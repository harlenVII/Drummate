# Drummate Architectural Refactor — Design

**Date:** 2026-06-01
**Status:** Approved (design); pending implementation plan

## Goal

Improve the robustness, readability, and extendability of the Drummate codebase
through six independently-shippable phases. Every phase is **behavior-preserving
for the user** (same UI, same sync semantics). The two competing data paradigms
(imperative full-refetch vs. reactive `liveQuery`) get unified rather than
replaced wholesale.

## Decisions (from brainstorming)

- **Sync refactor:** characterization tests first, then refactor to keep them green.
- **liveQuery migration:** full migration of reads (delete `goalRefreshKey` and the resetters bag).
- **Backend abstraction:** injected interface via a provider + `useBackend()` hook.
- **Delivery:** one spec, one phased plan; each phase its own commit/PR, app working between phases.

## Current-state findings (verified against code)

- [firebaseBackend.js](../../../src/services/backends/firebaseBackend.js) is ~1,429 lines. The
  same reconciliation shape (snake_case↔camelCase map, find-local-by-uid,
  diff fields, add/update/skip) is hand-written 5× across `pullAll*`,
  `subscribeToChanges`, `flushSyncQueue`, and `replay*Payload`. CLAUDE.md flags
  several of these blocks as "load-bearing; do not simplify."
- Two data paradigms coexist: items/totals/notes/practices flow through the
  imperative [`loadData()`](../../../src/hooks/useAppData.js) full-refetch; goals use
  `Dexie.liveQuery` directly in `GoalsPage`/`GoalBanner`. The seam between them
  is `goalRefreshKey` ([useAppData.js:41](../../../src/hooks/useAppData.js)) and the
  16-setter `resetters` bag ([useSync.js:42-82](../../../src/hooks/useSync.js)).
- **There is no `BackendProvider`** despite CLAUDE.md listing it. [main.jsx](../../../src/main.jsx)
  is `LanguageProvider → AuthProvider → App`. The `firebaseBackend` singleton is
  imported directly in 11 sites (10 hooks/components **plus** `AuthContext`).
- No `ErrorBoundary` anywhere; a render throw blanks the PWA. `useSync` init
  errors are swallowed with `console.error` ([useSync.js:159](../../../src/hooks/useSync.js)) —
  failed pulls show stale data silently.
- `fake-indexeddb` is already a devDependency; `tests/setup.js` and Vitest are in place.

---

## Phase 1 — Sync characterization tests (safety net)

**Purpose:** pin current `firebaseBackend` behavior before refactoring it.

Use a fake Firestore snapshot shape (plain objects exposing `.docs`,
`.metadata.fromCache`, `.data()`) + in-memory Dexie via `fake-indexeddb`.
Inject the backend's Firestore access so tests can feed snapshots — this may
require a thin seam (e.g. parameterizing the `*Ref` helpers or the
`getDocs`/`onSnapshot` calls) introduced minimally in this phase.

Cases to lock down (from the load-bearing comments):
- `pullAll`: add new remote; update changed fields; skip unchanged;
  `fromCache` bail (no deletions); item-deletion reconciliation; log `item_uid`
  remap **before** parent delete; legacy doc (no `uid`) migration.
- `subscribeToChanges`: `'added'` == `'modified'` reconciliation parity;
  log `modified` remaps `itemUid`/`itemId`.
- `flushSyncQueue`: enriched-payload replay writes **both** cloud + local;
  legacy/minimal payload returns `false` and falls back to re-read.

**Output:** `tests/firebaseBackend.sync.test.js`. These tests are the contract
Phases 4–5 must keep green.

---

## Phase 2 — Locale extraction (independent, near-zero risk)

Move the `en`/`zh` tables out of
[LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx) into
`src/locales/en.json` + `src/locales/zh.json`. Provider keeps only `language`
state, `toggleLanguage`, and the `t()` interpolation (`{param}` regex unchanged)
— ~40 lines. A `locales` map registers languages; adding one = add a JSON file +
one map entry.

**Verification:** `npm run build`, language toggle, existing i18n behavior
identical (no test changes required).

---

## Phase 3 — Error boundary + sync-error surfacing (independent robustness)

- **`<ErrorBoundary>`**: new class component wrapping `<App>` (in `main.jsx` or
  just inside it). Recoverable fallback UI (message + reload button), all text
  via `t()`. Catches render throws that currently blank the app.
- **Surface sync failures:** add a `syncError` state in
  [useSync.js](../../../src/hooks/useSync.js); set it in the init `catch` instead of
  swallowing. Render a dismissible banner mirroring `OfflineBanner` styling so a
  failed pull is visible. `loadData` still runs in `finally` as today.

**Verification:** build; simulate a thrown error in a child + a rejected pull;
confirm fallback/banner render. Add a small render test for `ErrorBoundary`.

---

## Phase 4 — Backend interface injection (foundational)

**Purpose:** make the backend swappable/mockable and stop direct singleton imports.

- **Contract:** `src/services/backends/backendInterface.js` — a JSDoc `@typedef`
  enumerating every method (`getUser`, `onAuthChange`, `signUp`/`signIn`/`signOut`,
  `pushItem`, `pullAll`, `subscribeToChanges`, `flushSyncQueue`, …) grouped by
  domain. No runtime cost; documents the surface.
- **Create `BackendProvider`** (`src/contexts/BackendContext.jsx`) holding the
  `firebaseBackend` instance, exposing `useBackend()`. Wrap `AuthProvider`:
  `LanguageProvider → BackendProvider → AuthProvider → App` (matches CLAUDE.md's
  intended hierarchy). `AuthContext` is a heavy consumer and sits above `App`, so
  the provider must be above it.
- **Migrate all 11 direct-import sites** (`AuthContext`, the sync/data/items/
  reports/practices/timer hooks, `NotesPage`, `ReportTab`, `GoalsPage`,
  `SettingsPanel`) to `useBackend()`. Hooks that can't call hooks at the right
  spot receive the backend as a parameter from their caller.
- Local **reads** stay on direct Dexie (that's the liveQuery path); **cloud ops**
  go through the injected backend.

**Verification:** Phase 1 tests green (now trivially wired against a fake
backend); build; full manual checklist. Behavior unchanged — call sites only.

---

## Phase 5 — Codec + reconciler refactor (the core)

Introduce one declarative codec per collection:

```
src/services/backends/codecs/
  itemCodec.js   logCodec.js   noteCodec.js   practiceCodec.js   goalCodec.js
```

Each exports:
- `toRemote(local)` / `toLocal(remoteData)` — the snake_case↔camelCase field map,
  **defined once** (replaces every inline `archived: data.archived ?? false`,
  `trashed_at: ... || ''`, etc.).
- `diff(remoteDoc, localRow) → { action: 'add' | 'update' | 'skip', fields }` —
  the reconciliation rule, written once.

A generic `reconcileCollection(snap, { codec, table, ... })` drives **both**
`pullAll*` and the `subscribeToChanges` listener from the same code path —
structurally guaranteeing the parity CLAUDE.md currently enforces by hand.

Cross-cutting steps stay explicit in the orchestrator (not per-field): the
`fromCache` bail, item-deletion reconciliation, and log `item_uid` remap.
`flushSyncQueue` replay reuses `toRemote`/`toLocal`. The legacy/minimal-payload
fallback is preserved.

**Verification:** Phase 1 characterization tests must stay green throughout (this
is the whole point). Build; full manual checklist incl. cross-device merge.

---

## Phase 6 — liveQuery migration + delete the seams

- Convert items / totals / notes / practices reads to `Dexie.liveQuery`
  (matching how goals already work). A `useLiveData` hook (or per-entity live
  hooks) replaces the `useAppData` state where it's read today.
- Reports' **log** reads (weekly/monthly/yearly ranges) become liveQuery range
  subscriptions keyed by `reportDate`, so date stepping re-emits only the
  relevant query.
- **Delete `goalRefreshKey`** ([useAppData.js:41](../../../src/hooks/useAppData.js)) —
  reactive queries make it obsolete.
- **Delete the 16-setter `resetters` bag** ([useSync.js:42-82](../../../src/hooks/useSync.js)) —
  clearing Dexie (`wipeAllLocalData`) now propagates to the UI automatically;
  logout/visitor-logoff reset shrinks to "clear Dexie + reset ephemeral UI state
  (activeTab, settings)."
- `loadData` shrinks to **sync orchestration only** (day-change/visibility/purge
  effects stay but trigger re-sync, not a full state refetch).
- **Fix the wiring-cycle ref** ([App.jsx:89-102](../../../src/App.jsx)): with reports no
  longer owning fetched-data state, remove the `reportSubpageNavRef` hack by
  creating nav first and passing `setReportSubpage` into `useReports` directly
  (or co-locating subpage state).

**Verification:** Phase 1 + existing suites green; build; full manual checklist
with emphasis on offline refresh, go-online round-trip, logout/visitor-logoff
reset, and report date stepping.

---

## Cross-cutting testing & gates

Each phase gates on: `npm run build`, `npm run lint`, the relevant Vitest
suites, and the manual checklist in [CLAUDE.md](../../../CLAUDE.md) (offline refresh,
offline edits, go-online round-trip, all tabs/subpages, DB persists after
refresh). Phases 4–6 additionally require the Phase 1 sync suite to stay green.

## Out of scope

- Audio engine / metronome internals.
- Visual/UX changes of any kind.
- Firestore data-model or wire-format changes.
- Unrelated refactoring not serving the six phases above.

## Docs follow-up

After Phase 4 and Phase 6, update [CLAUDE.md](../../../CLAUDE.md): correct the provider
hierarchy (BackendProvider now real), document `useBackend()`, the codec layer,
and the liveQuery read path replacing `loadData`/`goalRefreshKey`/resetters.
