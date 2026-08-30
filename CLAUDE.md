# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drummate is a PWA for drummers: practice tracking, reports, metronome with rhythm sequencer, and a Notes tab for dated journal entries attached to practice items. Stack: React 19, Vite 7, Tailwind v4, Dexie.js (IndexedDB) with Firebase cloud sync.

**Key docs:** [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md), [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md)

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # always run after changes
npm run lint
npm run test                              # run all tests once (Vitest)
npm run test:watch                        # watch mode
npx vitest run tests/dateHelpers.test.js  # run a single test file
```

Tests live in `tests/` (not `src/`). Covered: `dateHelpers`, `tzDateHelpers`, `timezoneService`, `offlineService`, `pendingActionFormatter`, `practicePage`, `practiceEditModal`, `goalStatus`, `authContext`, `visitorMode`, `priorPracticeService`, `firebaseBackend.sync` (characterization suite for sync/reconciler behavior), and a smoke test.

## Environment Variables

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`

## Architecture

**Provider hierarchy:** `LanguageProvider → BackendProvider → AuthProvider → ErrorBoundary → App`. Firebase is the sole backend.

**Backend injection:** The `firebaseBackend` singleton is provided via `src/contexts/BackendContext.jsx` (`BackendProvider` + `useBackend()` hook). The context default IS the singleton, so tests work unwrapped. Only `BackendContext.jsx` imports the singleton directly — `AuthContext`, all data/mutation hooks (`useSync`, `usePracticeItems`, `usePracticeTimer`, `useReports`, `useMetronomePractices`, `useAppData`), and components (`NotesPage`, `GoalsPage`, `SettingsPanel`) all call `useBackend()`. The backend interface is documented as `@typedef Backend` in `src/services/backends/backendInterface.js`.

**Error handling:** `src/components/ErrorBoundary.jsx` wraps `<App>` and shows a recoverable fallback. Text is intentionally English-only because a crash may break the `LanguageProvider` tree. `useSync` surfaces init failures via a `syncError` state, shown as a dismissible red banner in `App.jsx` (i18n keys `sync.error`, `common.dismiss`).

**State:** Ephemeral UI state (metronome/sequencer settings, active tab, settings panel) lives in `App.jsx` and is passed down as props or via hooks. No external state library. UI reads for items/practices/notes/totals are reactive via `Dexie.liveQuery` — `src/hooks/useLiveData.js` exposes `{ items, practices, notes, totals, refreshTotals }` and `useReports` subscribes log queries keyed to date anchors the same way. Metronome/sequencer state persists across tab switches; the audio engine is initialized once on mount and destroyed only on unmount.

**Audio engine** ([src/audio/metronomeEngine.js](src/audio/metronomeEngine.js)): Web Audio API + Web Worker lookahead scheduler (25ms wake-up, 100ms lookahead). Worker MUST live at `public/metronome-worker.js` (absolute path `/metronome-worker.js`). Two modes: normal (single `subdivisionPattern`) and sequence (`sequencePatterns[]`, one per beat slot). Subdivision patterns are fractional beat positions 0.0–1.0; negative values = silent; `null` = rest beat (see `src/constants/subdivisions.js`).

**Database** ([src/services/database.js](src/services/database.js)): Dexie wrapper, name `DrummateDB`, **v16**.

- `practiceItems` — `'++id, &uid, name, sortOrder, archived, trashed, category'` + non-indexed `syncedOnce`. `uid` is cross-device identity (stable across renames); `name` is mutable. `category` ∈ `'fundamentals' | 'songs'`, orthogonal to `archived`. Soft-delete via `trashed` + `trashedAt`, purged after 30 days.
- `practiceLogs` — `'++id, itemId, itemUid, date, duration, uid, loggedAt'` + `syncedOnce`. `loggedAt` (epoch ms) is the source of truth for date grouping; `date` is a denormalized cache kept for Firestore wire-format compat. `addLog` stamps `Date.now()`; `addAdjustmentLog` stamps `noonInHomeTz(dateStr)`. `reattributeLogsToDate` re-stamps existing logs.
- `notes` — `'++id, &uid, itemUid, date, trashed'` + `syncedOnce`. Same soft-delete/30-day pattern as items.
- `goals` — `'++id, &uid, startDate, endDate, archived, pinned, sortOrder'` + non-indexed `syncedOnce`, `name`, `targetHours`, `archivedAt`, `createdAt`. Multiple goals allowed. One goal can be `pinned: true` to show on the Practice tab banner (enforced by `setGoalPinned` transaction). Status (met/missed/progress) is always computed from logs at render time — never stored. Auto-archived when `endDate < today` at each init. Legacy `localStorage['drummate_goal']` is one-shot migrated to Dexie on first load after v15 and then removed.
- `metronomePractices` — `'++id, &uid, sortOrder'` + non-indexed `linkedItemUid` (nullable `uid` of a practice item). No Dexie version bump needed — unindexed fields are invisible to Dexie's schema but persisted in records.
- `syncQueue` — `'++id, action, collection, localId'` (offline retry).

All ops async. Date strings are `YYYY-MM-DD`. Deleting an item cascades to its logs **and** notes in one transaction. `mergeItem(sourceId, targetId)` reassigns logs+notes and hard-deletes source. `purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`.

**Timezone** ([src/services/timezoneService.js](src/services/timezoneService.js)): single account-synced home TZ, stored at `users/{uid}.timezone`, mirrored to `localStorage['drummate_timezone']`. Module-level `getTimezone()` is synchronous; `initTimezone(backend, userId)` reconciles localStorage against Firestore (default `America/Los_Angeles`). All log-grouping reads use `loggedAt` range queries derived from the current TZ, so switching at runtime re-buckets every report without touching stored data.

**Offline mode** ([src/services/offlineService.js](src/services/offlineService.js)): explicit, session-scoped. Auto-entered on initial load only if `!navigator.onLine`; never auto-detected mid-session. `OfflineBanner` + `PendingChangesModal` subscribe to `db.syncQueue` via `Dexie.liveQuery`. "Go online" while still offline shows a 3.5s toast and stays offline. Every Firestore-mutating method in `firebaseBackend.js` short-circuits to `syncQueue` when offline, enqueuing enriched payloads (full mutable state) so `flushSyncQueue` can replay via `setDoc` without re-reading pull-overwritten Dexie. Spec: [docs/superpowers/specs/2026-05-18-offline-mode-design.md](docs/superpowers/specs/2026-05-18-offline-mode-design.md).

**Tabs:** Practice / Metronome / Report / Notes. Report has subpages `daily | weekly | monthly | yearly | stats | goals`. Notes has `byDate | byItem`, managed by [src/components/NotesPage.jsx](src/components/NotesPage.jsx). Notes attached to trashed items are hidden from both subpages.

**Daily report "Merge to yesterday"** (edit mode, when `isToday && grandTotal > 0`): re-stamps every log in `reportLogs` to noon yesterday in home TZ via `reattributeLogsToDate`, preserves per-item breakdown, pushes via `pushLog` upsert.

**i18n** ([src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx)): `t(key)` with nested keys and `{param}` interpolation. `en` / `zh`. Persisted to `localStorage['drummate_language']`. Translation tables live in `src/locales/en.json` and `src/locales/zh.json`; `LanguageContext.jsx` is ~50 lines (provider + `t()` only). Adding a language means adding a JSON file and registering it in the `locales` map in `LanguageContext.jsx`.

**UI preferences in localStorage** (boolean/string, read at init, persisted in `useEffect`):

| Key | Values | Default | Controls |
|-----|--------|---------|---------|
| `drummate_language` | `'en'` \| `'zh'` | `'en'` | language |
| `drummate_group_by_category` | `'true'` \| `'false'` | `'true'` | report grouping |
| `drummate_timezone` | IANA tz string | `'America/Los_Angeles'` | home timezone |
| `drummate_pending_log` | JSON log | absent | crash-recovery log |
| `drummate_compact_mode` | `'true'` \| `'false'` | `'false'` | compact mode (tightens padding, gaps, and radii across all major screens) |
| `drummate_visitor` | `'true'` \| absent | absent | visitor (anonymous) mode flag |
| `drummate_prior_hours` | integer string | `'0'` | prior practice hours offset added to lifetime total |

**AI / Voice features** (on-device, no server):
- `llmService.js` — Qwen3-0.6B (Q4_K_M GGUF, ~397 MB) via `@wllama/wllama`; generates post-session encouragement text. Model URL points at the `unsloth/Qwen3-0.6B-GGUF` repo because the official `Qwen/Qwen3-0.6B-GGUF` only publishes Q8_0 — a 404 there silently became an "Invalid typed array length" parse error in the modal, so verify any URL swap with `curl -sIL` before committing. Qwen3 ships with thinking mode on by default, which would emit `<think>…</think>` preamble and break the length guard; the system prompt ends with `/no_think` and `generateEncouragement` strips any residual `<think>…</think>` block defensively. The system prompt is tuned to lead with today's minutes/item names — weekly total and streak are supporting context only. WASM blobs fetched from jsDelivr on first use; model cached in OPFS. Has hardcoded fallback strings for both languages so the feature works offline.
- `sttService.js` — thin promise wrapper around the browser `SpeechRecognition` API; returns `null` when unsupported. Used for voice command input.
- `ttsService.js` — Text-to-speech via `kokoro-js`; reads aloud feedback messages.
- `wakeWordEngine.js` — detects a wake phrase via `openwakeword-wasm-browser` + ONNX (~5 MB download). Call `engine.load()` then `engine.start()` from a user gesture; fires `onDetected` callback.
- `intentParser.js` — maps STT transcript → structured intent for voice commands.
- `voiceFeedback.js` — orchestrates STT → intent → action → TTS response.
- `FloatingVoiceIndicator.jsx` — overlay showing voice-listening state.
- `EncouragementButton.jsx` / `EncouragementModal.jsx` — UI entry point that triggers the LLM encouragement flow; modal shows generated text with a copy action.

**Backend abstraction**: `src/services/backends/firebaseBackend.js` is the sole concrete backend. New sync operations must be added here. The file is statically imported via `BackendContext.jsx` (always bundled — no dynamic loading).

**Codec + reconciler layer**: The previously duplicated per-collection reconciliation logic is consolidated. Per-collection codecs live in `src/services/backends/codecs/` (`noteCodec`, `practiceCodec`, `goalCodec`, `itemCodec` each export `{ table, toRemote, toLocal, diff }`; `logCodec` is special — named exports, and its `toLocal`/`diff` take a resolved parent `localItem` since there is no `toRemote`). A generic reconciler `src/services/backends/reconcile.js` exports `reconcileSnapshot`, `applyChange`, and `applyRemoteDoc`, which drive BOTH `pullAll*` and the `subscribeToChanges` live listeners for notes/practices/goals from one code path. Items and logs keep specialized orchestration (legacy migration, name-fallback, parent resolution, remap-before-delete, deletion cascade) but use the codecs for field mapping and diff. `flushSyncQueue` replay reuses codec `toRemote` for note and goal payloads (practice replay is hand-written due to flat payload shape). `resolveLoggedAt` moved to `src/services/backends/resolveLoggedAt.js`. Firestore SDK access goes through an injectable seam `src/services/backends/firestoreAccess.js` (`getFirestore()`/`setFirestoreImpl()`) so tests inject a fake without monkey-patching. A characterization suite `tests/firebaseBackend.sync.test.js` pins sync behavior.

**Visitor mode** ([src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx)): users can skip auth via "Continue as guest" on AuthScreen. `isVisitor` flag in `AuthContext` persists to `localStorage['drummate_visitor']`. App gate is `!user && !isVisitor`. Every `firebaseBackend.push*` call in App.jsx is already guarded by `if (user)`, so cloud writes naturally short-circuit — no Firestore push site needed changes. `fromVisitorIntent` (React state, not persisted) tells `signUp` to migrate local Dexie via `pushAllLocal*` (which filters `syncedOnce: false` — exactly visitor rows), or tells `signIn` to wipe local before the normal cloud pull. Three Settings actions for visitors: Sign in / Create account (preserve Dexie, set intent) / Log off (wipe Dexie, no intent). `wipeAllLocalData()` in [src/services/database.js](src/services/database.js) atomically clears all five Dexie tables; localStorage UI prefs survive.

**Goals system**: Multiple goals live in Dexie `goals` table. Pure status helpers are in `src/utils/goalStatus.js` (no side effects — safe to call anywhere). `GoalsPage` subscribes to `db.goals` and `db.practiceLogs` via `liveQuery` and calls `useBackend()` for mutations. `GoalBanner` on the Practice tab reads the single `pinned: true` goal via `liveQuery`. `GoalCard` is fully prop-driven (no localStorage reads). `user` is still passed as a prop from `App.jsx`; the backend is consumed via `useBackend()` inside `GoalsPage` (no longer a prop).

## Keyboard Shortcuts

Blocked when focus is in `<input>` or `<textarea>`.

| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Practice / Metronome / Report / Notes |
| `Tab` / `Shift+Tab` | Cycle subpages on current tab |
| `←` / `→` | Step report date (daily=1d, weekly=1w, etc); not bound on Notes |
| `M` / `H` | Time unit minutes / hours |
| `E` / `C` | Language English / Chinese |
| `L` / `D` | Theme Light / Dark |
| `S` | Stop active practice timer |
| `R` | Toggle today's Daily Report modal (copyable text; no navigation) |
| `Space` | Toggle play/pause during metronome practice; dismiss Practice Complete screen |
| `?` | Toggle shortcuts help modal |
| `Enter` | Copy to clipboard while the Daily Report modal is open (modal-scoped, not in the `?` list) |

## Date Math Helpers

- [src/utils/dateHelpers.js](src/utils/dateHelpers.js) — `YYYY-MM-DD` string ops. `getTodayString` is TZ-aware (delegates to `tzDateHelpers`); the rest are TZ-agnostic string math. `daysUntilPurge(trashedAt, now?)` — whole days before a soft-deleted record is hard-purged, using `TRASH_RETENTION_DAYS` (from [src/constants/trash.js](src/constants/trash.js)). Pure (pass `now` for testability). Used by NotesPage and PracticeItemList trash countdowns.
- [src/utils/tzDateHelpers.js](src/utils/tzDateHelpers.js) — pure TZ math via `Intl.DateTimeFormat`. Key exports: `formatInTimezone`, `getDateRangeUtc`, `noonInHomeTz`, `legacyDateToLoggedAt` (always anchors to noon `America/Los_Angeles`).
- [src/utils/formatTime.js](src/utils/formatTime.js) — `formatTime(seconds)` → `"HH:MM:SS"` for live timer; `formatDuration(seconds, unit)` → number for reports (respects `timeUnit`).
- [src/utils/goalStatus.js](src/utils/goalStatus.js) — pure goal helpers: `computeGoalStatus(goal, logs)`, `isCurrentGoal`, `isHistoryGoal`, `selectExpiredForArchive`, `shouldMigrateLegacy`, `buildMigratedGoal`. Goals filter by `l.date` (YYYY-MM-DD string), not `loggedAt` epoch — goal ranges are user-defined calendar intervals, not TZ-shifted UTC windows.
- `buildBreakdown(items, logs)` in [src/utils/practiceStats.js](src/utils/practiceStats.js) — shared per-item report pipeline (totals → drop zeros → sort desc → fundamentals/songs split → grandTotal). All four report tabs (Daily/Weekly/Monthly/Yearly) use it; each does its own active/trashed log filtering first.
- [src/utils/heatmap.js](src/utils/heatmap.js) — `computePercentiles(values)` + `intensityColor(seconds, buckets, isDark)`, shared by Monthly/Yearly heatmaps.
- [src/utils/streaks.js](src/utils/streaks.js) — `computeLongestStreak(sortedDays)` and `computeCurrentStreak(daysSet, opts)`; back StatsReport (all-time) and YearlyReport (year-scoped, `anchorOnYesterday`+`minDate`).
- [src/utils/reportText.js](src/utils/reportText.js) — `buildReportText(logs, startDate, endDate, items, t, timeUnit)` builds the copyable plain-text report body (date/total header, then fundamentals/songs sections); `formatReportDate` renders `YYYY/MM/DD`. Shared by `ReportGeneratorModal` (arbitrary range, Report → Stats) and `DailyReportModal` (today only, `R` shortcut) so the two cannot drift. Entries whose `itemId` is missing from `items` are dropped, so callers pass already-filtered (non-trashed) items.
- `useIsDarkMode()` ([src/hooks/useIsDarkMode.js](src/hooks/useIsDarkMode.js)) — reactive dark-mode boolean via `themeService` pub/sub; use instead of reading `document.documentElement.classList`.

## Critical Patterns

- **Practice timer auto-save**: `beforeunload`/`pagehide` writes to `localStorage['drummate_pending_log']`; recovered next load. iOS Safari kills pages aggressively; synchronous localStorage survives.
- **Metronome ↔ Sequencer switch**: stop playback → `setSequence(null)` → clear beat indicators → disable NoSleep. Prevents engine state conflicts.
- **Drag-and-drop (practice items)**: `@dnd-kit/sortable`, two `SortableContext` instances (one per category) in one `DndContext`. `handleDragEnd` → `onReorder([{id, category}])` → DB transaction → `backend.pushReorder` with per-item category (cross-section drags atomic on remote).
- **Drag-and-drop (goals)**: Single `SortableContext` for Current goals only. `handleDragEnd` calls `setLocalOrder(newUids)` and `setActiveDragId(null)` **synchronously before any await** so React batches them into a single render — the `SortableContext` sees the new order when dnd-kit clears drag state, eliminating snap-back. `localOrder` is cleared after `updateGoalOrder` resolves (liveQuery has fired by then). `DragOverlay` shows a floating clone with `shadow-2xl` and a slight rotation; the source slot shows opacity 0.
- **Trash**: soft via `trashed: true` + `trashedAt`. `purgeExpiredTrash(TRASH_RETENTION_DAYS)` runs on app load. Restore clears `trashed` AND `archived`. The 30-day window is `TRASH_RETENTION_DAYS` in [src/constants/trash.js](src/constants/trash.js) (a dependency-free module to avoid a dateHelpers↔database cycle); the UI countdown (`daysUntilPurge`) and the purge share it so they cannot drift.
- **NoSleep**: single global instance in `App.jsx`. Enable on start, disable on stop/tab switch. Never create multiple instances (iOS bugs).
- **Floating practice widget**: top pill when `activeItemId != null && activeTab !== 'practice'`. Inner stop is a `role="button"` span (HTML disallows nested buttons).
- **Metronome → practice item link**: A `metronomePractice` may carry `linkedItemUid`. `handleStartPractice` calls `handleStart(linkedItem.id)` when the linked item exists and is neither trashed nor archived (auto-saves any currently running item first, which `handleStart` handles internally). `handleEndPractice(wasComplete)` calls `saveAndStop()` only when `wasComplete === true` and the currently active item's `uid` matches `linkedItemUid`. `PracticeRunView.handleEnd` passes `complete` to `onEnd(complete)` so the natural-vs-manual distinction propagates. Navigating away via the subpage switcher calls the clearing logic directly (not `handleEndPractice`), leaving the timer running — intentional.

## Date Pickers

Use `react-datepicker` — **never `<input type="date">`** (OS-rendered popup can't be dark-mode styled). Dark mode CSS lives at `.dark .react-datepicker*` in [src/index.css](src/index.css); new pickers inherit it.

**Conversion pattern** (state stays `YYYY-MM-DD`; convert only at picker boundary):
```js
const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null); // noon avoids UTC off-by-one
const fromPickerDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
```

**Standard props inside a modal:**
```jsx
<DatePicker
  selected={toPickerDate(dateStr)}
  onChange={(d) => setDateStr(fromPickerDate(d))}
  dateFormat="MM/dd/yyyy"
  className="..." wrapperClassName="..."
  popperProps={{ strategy: 'fixed' }}  // prevents clipping in fixed modals
/>
```

## Manual Verification

Do not use Playwright or any browser automation for verification. Instead, after implementing changes, provide the user with a numbered list of manual testing steps to verify the feature works correctly.

## Styling

Tailwind v4 only — no CSS modules, no inline styles. Mobile-first. System font stack (see [src/index.css](src/index.css)).

## Gotchas

**Audio / UI**
- AudioContext must be created in a user gesture (Safari) — engine init on first play.
- iOS silent-mode bypass: engine sets audio session category to `'playback'`.
- Starting a new practice item auto-saves the previous one if still running.

**Data**
- Practice item identity is `uid`, not `name`. UI does case-insensitive dup-name check in `handleAddItem` for UX, but always pass `item.uid` to backend push methods.
- All user-facing text must go through `t()`.
- Dexie version must bump when adding/changing indexed fields; provide `.upgrade()` to populate defaults.

**Sync init order** (see `init()` in [src/hooks/useSync.js](src/hooks/useSync.js)):
`[initTimezone, initPriorHours, pullAll, pullAllNotes, pullAllPractices, pullAllGoals] (parallel) → legacy goal migration → flushSyncQueue → pushAllLocal → auto-archive expired goals → setIsSyncing(false) → subscribeToChanges`
Pulls go first so device adopts remote truth (renames/deletes) before pushing local. Pulls write Dexie; `useLiveData` and `useReports` liveQuery subscriptions in the UI react to those writes automatically — no manual `loadData` refetch needed. `setIsSyncing(false)` is in `finally` so the overlay drops on partial failure. `subscribeToChanges` registers AFTER the init sequence to avoid a stale-state flicker on first snapshot; its callback is a no-op (`() => {}`) because `subscribeToChanges` writes adopted changes to Dexie and liveQuery propagates them to the UI without further instruction.

**Sync correctness — these comments are load-bearing; do not "simplify" without understanding why:**
- `pullAll` processes items loop → logs loop → item-deletion reconciliation, in that order. Reordering causes silent log loss during cross-device merges.
- `subscribeToChanges` log `modified` events must remap `itemUid`/`itemId` if `item_uid` changed (mirrors `pullAll` remap; prevents loss when merges arrive via live listener).
- `subscribeToChanges` items/notes/practices/goals listeners handle `'added'` and `'modified'` with the **same** reconciliation. The Firestore initial snapshot reports every doc as `'added'`, including ones we just updated in `flushSyncQueue`. Logs don't need this (no field updates).
- `pullAll` / `pullAllNotes` / `pullAllPractices` / `pullAllGoals` MUST bail when `snap.metadata.fromCache` is true. The Web SDK (no persistence) resolves `getDocs` with an empty cached snapshot when offline; without the guard, deletion reconciliation hard-deletes every locally-synced row. This is the difference between offline-safe and data-loss.
- `pushAllLocal*` filters to `syncedOnce: false`. Re-pushing synced rows would clobber `flushSyncQueue`'s replays (the pull-then-push race). For logs: logs are append-only/immutable on cloud, so re-pushing N rows per init was the dominant refresh cost. `pushLog` flips `syncedOnce: true` on success; `pullAll` + `subscribeToChanges` set it when adopting remote.
- `flushSyncQueue` writes BOTH cloud AND local Dexie for field-update actions (`reorder`, `rename_item`, `archive_item`, `trash_item`, `set_category`, `push_note`, `push_practice`, `reorder_practices`, `push_goal`). After cloud push, it re-asserts payload values locally to restore the offline intent that the earlier `pullAll` overwrote.
- Offline-mode push payloads are built by a single `buildPayload` per method (see `withOfflineQueue` in `firebaseBackend.js`, backed by pure `runWithOfflineQueue` in `backends/offlineQueue.js`). The SAME enriched payload feeds both the offline short-circuit and the lost-connectivity catch fallback, so they cannot drift. `flushSyncQueue` replays enriched note/practice/goal payloads via `replayNotePayload`/`replayPracticePayload`/`replayGoalPayload`, each of which returns `false` for legacy/minimal payloads (queued by pre-2026-06 app versions) so the caller re-reads local. Do not delete that legacy fallback — it prevents silently dropping a pending pre-upgrade offline edit.

**Data model**
- `category` (`'fundamentals' | 'songs'`) is orthogonal to `archived`. Both fields always persisted. Tolerant pull rule: treat absent remote `category` as "no change" to avoid clobbering old clients.
- `purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`; caller must propagate both to remote (`pushDeleteItem`, `deleteNoteRemote`).
- Note soft-delete is a `pushNote` upsert with `trashed: true`, NOT a hard-delete. `deleteNoteRemote` is only called by `purgeExpiredTrash` (30 days) and the `deleteItem` cascade.
- `notes` are read reactively via `useLiveData` (which subscribes to `getAllNotes()` via `liveQuery`) and passed down as props to `NotesPage`. Local note mutations write to Dexie; `liveQuery` re-emits automatically so no manual refresh is needed. Subpages (`NotesByDate`, `NotesByItem`) are pure prop-driven renderers.
- Goal `delete_goal_permanent` in `flushSyncQueue` only calls `deleteGoalRemote` — the Dexie delete already ran at action time in the handler, so no second local delete.

**Boot / setup**
- Backend interface compliance: new sync ops must be added to `firebaseBackend.js` and declared in `src/services/backends/backendInterface.js`. The singleton is injected via `BackendContext` (statically imported there — always bundled).
- Theme is applied before React mounts: [src/services/themeService.js](src/services/themeService.js) is imported by [src/main.jsx](src/main.jsx) before `App` so the `dark` class is on `<html>` before first paint. Do not move this import below `App` or gate `applyTheme` behind React state.

**Testing**
- DB tests use `import 'fake-indexeddb/auto'` and clear all tables in `beforeEach` (see [tests/database.test.js](tests/database.test.js), [tests/useLiveData.test.jsx](tests/useLiveData.test.jsx)). For TZ-dependent assertions, pin the zone with `await setTimezone('America/Los_Angeles')` in `beforeEach` — module TZ state persists across tests in the same file.
- **Never use `vi.useFakeTimers()` in a test that awaits a Dexie/fake-indexeddb op.** Fake timers freeze fake-indexeddb's internal promises, so any `db.*` read hangs and the test times out. To control the clock for time-based logic (e.g. the practice-timer auto-save), spy on `Date.now` instead: `vi.spyOn(Date, 'now').mockImplementation(() => now)` and mutate `now`. See [tests/usePracticeTimer.test.jsx](tests/usePracticeTimer.test.jsx).
- Hooks that read auth/backend (`useAuth`, `useBackend`) but exercise real DB behavior should `vi.mock` those two contexts and keep the real (fake-indexeddb) `db` — that isolates the contract under test without standing up Firebase.

## File Naming

- Components: PascalCase (`PracticeItemList.jsx`)
- Utilities/services: camelCase (`dateHelpers.js`)
- Context: PascalCase + `Context` suffix (`LanguageContext.jsx`)

## Commits

- `feat:`, `fix:`, `refactor:`, `docs:`
- Always include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Testing Checklist

After changes:
- [ ] `npm run build` succeeds
- [ ] All tabs work (Practice, Metronome subpages, Report subpages including Goals, Notes subpages)
- [ ] DB persists after refresh
- [ ] Metronome/sequencer plays through tab switches
- [ ] Language toggle
- [ ] Mobile responsive (if UI changes)
- [ ] Notes: local create/edit/delete reflects in both subpages
- [ ] Notes: remote sync refreshes without tab switch
- [ ] Offline refresh: DevTools offline + reload — local data intact, banner shows, no items wiped
- [ ] Offline edits: pending count ticks up, modal shows readable summaries
- [ ] Go-online round-trip: overlay persists until queue drains, no flicker/revert
- [ ] Go online while still offline: 3.5s toast, banner stays
