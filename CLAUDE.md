# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project Overview

Drummate is a PWA for drummers: practice tracking, reports, metronome with rhythm sequencer, and a Notes tab for dated journal entries attached to practice items. Stack: React 19, Vite 7, Tailwind v4, Dexie.js (IndexedDB) with Firebase cloud sync.

**Key docs:** [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md), [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md)

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # always run after changes
npm run lint
```

## Environment Variables

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`

## Architecture

**Provider hierarchy:** `LanguageProvider → BackendProvider → AuthProvider → App`. Firebase is the sole backend.

**State:** All in `App.jsx`, passed down as props. No external state library. Metronome/sequencer state persists across tab switches; the audio engine is initialized once on mount and destroyed only on unmount.

**Audio engine** ([src/audio/metronomeEngine.js](src/audio/metronomeEngine.js)): Web Audio API + Web Worker lookahead scheduler (25ms wake-up, 100ms lookahead). Worker MUST live at `public/metronome-worker.js` (absolute path `/metronome-worker.js`). Two modes: normal (single `subdivisionPattern`) and sequence (`sequencePatterns[]`, one per beat slot). Subdivision patterns are fractional beat positions 0.0–1.0; negative values = silent; `null` = rest beat (see `src/constants/subdivisions.js`).

**Database** ([src/services/database.js](src/services/database.js)): Dexie wrapper, name `DrummateDB`, **v14**.

- `practiceItems` — `'++id, &uid, name, sortOrder, archived, trashed, category'` + non-indexed `syncedOnce`. `uid` is cross-device identity (stable across renames); `name` is mutable. `category` ∈ `'fundamentals' | 'songs'`, orthogonal to `archived`. Soft-delete via `trashed` + `trashedAt`, purged after 30 days.
- `practiceLogs` — `'++id, itemId, itemUid, date, duration, uid, loggedAt'` + `syncedOnce` (v14). `loggedAt` (epoch ms) is the source of truth for date grouping; `date` is a denormalized cache kept for Firestore wire-format compat. `addLog` stamps `Date.now()`; `addAdjustmentLog` stamps `noonInHomeTz(dateStr)`. `reattributeLogsToDate` re-stamps existing logs.
- `notes` — `'++id, &uid, itemUid, date, trashed'` + `syncedOnce`. Same soft-delete/30-day pattern as items.
- `syncQueue` — `'++id, action, collection, localId'` (offline retry).

All ops async. Date strings are `YYYY-MM-DD`. Deleting an item cascades to its logs **and** notes in one transaction. `mergeItem(sourceId, targetId)` reassigns logs+notes and hard-deletes source. `purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`.

**Timezone** ([src/services/timezoneService.js](src/services/timezoneService.js)): single account-synced home TZ, stored at `users/{uid}.timezone`, mirrored to `localStorage['drummate_timezone']`. Module-level `getTimezone()` is synchronous; `initTimezone(backend, userId)` reconciles localStorage against Firestore (default `America/Los_Angeles`). All log-grouping reads use `loggedAt` range queries derived from the current TZ, so switching at runtime re-buckets every report without touching stored data.

**Offline mode** ([src/services/offlineService.js](src/services/offlineService.js)): explicit, session-scoped. Auto-entered on initial load only if `!navigator.onLine`; never auto-detected mid-session. `OfflineBanner` + `PendingChangesModal` subscribe to `db.syncQueue` via `Dexie.liveQuery`. "Go online" while still offline shows a 3.5s toast and stays offline. Every Firestore-mutating method in `firebaseBackend.js` short-circuits to `syncQueue` when offline, enqueuing enriched payloads (full mutable state) so `flushSyncQueue` can replay via `setDoc` without re-reading pull-overwritten Dexie. Spec: [docs/superpowers/specs/2026-05-18-offline-mode-design.md](docs/superpowers/specs/2026-05-18-offline-mode-design.md).

**Tabs:** Practice / Metronome / Report / Notes. Report has subpages `daily | weekly | monthly | yearly | stats`. Notes has `byDate | byItem`, managed by [src/components/NotesPage.jsx](src/components/NotesPage.jsx). Notes attached to trashed items are hidden from both subpages.

**Daily report "Merge to yesterday"** (edit mode, when `isToday && grandTotal > 0`): re-stamps every log in `reportLogs` to noon yesterday in home TZ via `reattributeLogsToDate`, preserves per-item breakdown, pushes via `pushLog` upsert.

**i18n** ([src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx)): `t(key)` with nested keys and `{param}` interpolation. `en` / `zh`. Persisted to `localStorage['drummate_language']`.

**Practice goal**: single goal at `localStorage['drummate_goal']` as `{ startDate, endDate, targetHours }`. Three self-contained components (`GoalSetupModal`, `GoalCard` in Stats, `GoalBanner` on Practice top) — `readGoal()` / `dateDiffDays()` are intentionally duplicated to keep components decoupled from App.jsx props. `daysLeft = dateDiffDays(today, endDate) + 1` (includes today; avoids divide-by-zero on last day).

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
| `?` | Toggle shortcuts help modal |

## Date Math Helpers

- [src/utils/dateHelpers.js](src/utils/dateHelpers.js) — `YYYY-MM-DD` string ops. `toDateString` / `getTodayString` are TZ-aware (delegate to `tzDateHelpers`); the rest are TZ-agnostic string math.
- [src/utils/tzDateHelpers.js](src/utils/tzDateHelpers.js) — pure TZ math via `Intl.DateTimeFormat`. Key exports: `formatInTimezone`, `getDateRangeUtc`, `noonInHomeTz`, `legacyDateToLoggedAt` (always anchors to noon `America/Los_Angeles`).
- [src/utils/formatTime.js](src/utils/formatTime.js) — `formatTime(seconds)` → `"HH:MM:SS"` for live timer; `formatDuration(seconds, unit)` → number for reports (respects `timeUnit`).

## Critical Patterns

- **Practice timer auto-save**: `beforeunload`/`pagehide` writes to `localStorage['drummate_pending_log']`; recovered next load. iOS Safari kills pages aggressively; synchronous localStorage survives.
- **Metronome ↔ Sequencer switch**: stop playback → `setSequence(null)` → clear beat indicators → disable NoSleep. Prevents engine state conflicts.
- **Drag-and-drop**: `@dnd-kit/sortable`, two `SortableContext` instances (one per category) in one `DndContext`. `handleDragEnd` → `onReorder([{id, category}])` → DB transaction → `backend.pushReorder` with per-item category (cross-section drags atomic on remote).
- **Trash**: soft via `trashed: true` + `trashedAt`. `purgeExpiredTrash(30)` runs on app load. Restore clears `trashed` AND `archived`.
- **NoSleep**: single global instance in `App.jsx`. Enable on start, disable on stop/tab switch. Never create multiple instances (iOS bugs).
- **Floating practice widget**: top pill when `activeItemId != null && activeTab !== 'practice'`. Inner stop is a `role="button"` span (HTML disallows nested buttons).

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

**Sync init order** (see `init()` in [src/App.jsx](src/App.jsx)):
`[initTimezone, pullAll, pullAllNotes, pullAllPractices] (parallel) → flushSyncQueue → pushAllLocal → loadData → setIsSyncing(false) → subscribeToChanges`
Pulls go first so device adopts remote truth (renames/deletes) before pushing local. The four parallel tasks touch disjoint tables/collections. `loadData` + `setIsSyncing(false)` are in `finally` so UI unblocks on partial failure. `subscribeToChanges` registers AFTER `loadData` to avoid stale-state flicker.

**Sync correctness — these comments are load-bearing; do not "simplify" without understanding why:**
- `pullAll` processes items loop → logs loop → item-deletion reconciliation, in that order. Reordering causes silent log loss during cross-device merges.
- `subscribeToChanges` log `modified` events must remap `itemUid`/`itemId` if `item_uid` changed (mirrors `pullAll` remap; prevents loss when merges arrive via live listener).
- `subscribeToChanges` items/notes/practices listeners handle `'added'` and `'modified'` with the **same** reconciliation. The Firestore initial snapshot reports every doc as `'added'`, including ones we just updated in `flushSyncQueue`. Logs don't need this (no field updates).
- `pullAll` / `pullAllNotes` / `pullAllPractices` MUST bail when `snap.metadata.fromCache` is true. The Web SDK (no persistence) resolves `getDocs` with an empty cached snapshot when offline; without the guard, deletion reconciliation hard-deletes every locally-synced row. This is the difference between offline-safe and data-loss.
- `pushAllLocal*` filters to `syncedOnce: false`. Re-pushing synced rows would clobber `flushSyncQueue`'s replays (the pull-then-push race). For logs (v14): different reason — logs are append-only/immutable on cloud, so re-pushing N rows per init was the dominant refresh cost. `pushLog` flips `syncedOnce: true` on success; `pullAll` + `subscribeToChanges` set it when adopting remote (including back-patching pre-v14 rows).
- `flushSyncQueue` writes BOTH cloud AND local Dexie for field-update actions (`reorder`, `rename_item`, `archive_item`, `trash_item`, `set_category`, `push_note`, `push_practice`, `reorder_practices`). After cloud push, it re-asserts payload values locally to restore the offline intent that the earlier `pullAll` overwrote.
- Offline-mode push payloads are enriched with full mutable state so `flushSyncQueue` can `setDoc` directly from the payload, NOT re-read local (which is already pull-overwritten). Legacy minimal payloads (catch-block fallback when `navigator.onLine` is true but Firestore fails) re-read local — see dual-path handlers.

**Data model**
- `category` (`'fundamentals' | 'songs'`) is orthogonal to `archived`. Both fields always persisted. Tolerant pull rule: treat absent remote `category` as "no change" to avoid clobbering old clients.
- `purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`; caller must propagate both to remote (`pushDeleteItem`, `deleteNoteRemote`).
- Note soft-delete is a `pushNote` upsert with `trashed: true`, NOT a hard-delete. `deleteNoteRemote` is only called by `purgeExpiredTrash` (30 days) and the `deleteItem` cascade.
- `notesRefreshKey` lives in `App.jsx`. `loadData` bumps it on every call (including remote sync events). Local note mutations call `bumpNotesRefresh` via `onNotesRefresh` prop.

**Boot / setup**
- Backend interface compliance: new sync ops must be added to `firebaseBackend.js`. The SDK is statically imported (always bundled).
- Theme is applied before React mounts: [src/services/themeService.js](src/services/themeService.js) is imported by [src/main.jsx](src/main.jsx) before `App` so the `dark` class is on `<html>` before first paint. Do not move this import below `App` or gate `applyTheme` behind React state.

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
- [ ] All tabs work (Practice, Metronome subpages, Report, Notes subpages)
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
