# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drummate is a Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Also includes a Notes tab for dated, free-text journal entries attached to practice items. Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js (IndexedDB) with Firebase cloud sync.

**Key docs:**
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) — Full architecture, project structure, completed phases
- [PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) — Roadmap with task breakdowns and design doc links

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server at http://localhost:5173
npm run build            # Production build (always test before committing)
npm run preview          # Preview production build
npm run lint             # Run ESLint
```

**Critical:** Always run `npm run build` after changes to verify the build succeeds.

## Environment Variables

```bash
# Firebase (default backend)
VITE_FIREBASE_API_KEY       # Firebase API key
VITE_FIREBASE_AUTH_DOMAIN   # Firebase auth domain
VITE_FIREBASE_PROJECT_ID    # Firebase project ID
```

## Architecture Overview

### Provider Hierarchy (main.jsx)

```
LanguageProvider → BackendProvider → AuthProvider → App
```

`AuthProvider` uses `firebaseBackend` directly. Firebase is the sole backend.

### Global State Management (App.jsx)

All state lives in `App.jsx` and is passed down as props. No external state management library.

**Practice State:** `items`, `totals`, `activeItemId`, `elapsedTime`, `editing`
**Metronome/Sequencer State:** `metronomeBpm`, `metronomeIsPlaying`, `metronomeCurrentBeat`, `metronomeTimeSignature`, `metronomeSubdivision`, `metronomeSoundType`, `metronomeSubpage`, `sequencerSlots`, `sequencerPlayingSlot`
**Report State:** `reportSubpage` (`'daily' | 'weekly' | 'monthly' | 'yearly' | 'stats'`), `reportDate`, `weekStart`, `monthStart`, `yearStart`
**Notes State:** `notesSubpage` (`'byDate' | 'byItem'`), `notesRefreshKey` (counter bumped by `loadData` on every sync event and by local note mutations via `bumpNotesRefresh`)
**Shared Display:** `timeUnit` (`'minutes' | 'hours'`) — persisted to localStorage, controls how durations display across all reports
**Voice State:** STT service instance, voice listening state, floating voice indicator
**Singleton Refs:** `metronomeEngineRef` (audio engine), `noSleepRef` (prevents screen lock)

**Key Pattern:** Metronome/sequencer state persists when switching tabs. The audio engine is initialized once on mount and destroyed only on unmount.

### Audio Engine (metronomeEngine.js)

`MetronomeEngine` class handles all audio playback via Web Audio API + Web Worker.

**Dual Modes:**
1. **Normal metronome mode:** Single `subdivisionPattern` applied to all beats
2. **Sequence mode:** Array of patterns (`sequencePatterns`), one per beat slot

**Key Methods:** `start()`, `stop()`, `setBPM(bpm)`, `setTimeSignature(beats, noteValue)`, `setSubdivision(pattern)`, `setSequence(patterns)`, `setSoundType(type)`

**Callbacks:**
- `onBeat({ beat, subdivisionIndex })` — UI beat indicators
- `onSequenceBeat(slotIndex)` — sequencer UI

**Implementation:** Lookahead scheduler (25ms wake-up, 100ms lookahead). Web Worker at `/metronome-worker.js` (must be in `public/`). Subdivision patterns are fractional beat positions (0.0–1.0, e.g. `[0, 0.5]` for eighth notes). Negative values mark silent subdivisions. Rest beats use `null` (from `SUBDIVISIONS` constant in `src/constants/subdivisions.js`).

### Database Layer (database.js)

Dexie.js wrapper around IndexedDB. Database name: `DrummateDB`, current version: **14**.

**Tables:**
- `practiceItems` — Schema: `'++id, &uid, name, sortOrder, archived, trashed, category'`
  - `uid`: UUID generated at creation; the cross-device sync identity. Stable across renames.
  - `name`: mutable display label. UI enforces uniqueness at create-time but the DB no longer requires it.
  - `sortOrder`: integer for drag-and-drop ordering (@dnd-kit)
  - `archived`: boolean, hides from active list
  - `trashed`: boolean, soft-delete with `trashedAt` ISO timestamp (auto-purged after 30 days)
  - `category`: `'fundamentals'` | `'songs'` — which section the item appears in. Orthogonal to `archived`.
  - `syncedOnce` (stored, not indexed): `true` once this item has reached the cloud (via push) or arrived from the cloud (via pull/subscribe). `pullAll` deletes any item with `syncedOnce: true` whose uid is missing from the latest remote set — this is how offline deletes propagate.
- `practiceLogs` — Schema: `'++id, itemId, itemUid, date, duration, uid, loggedAt'`
  - `loggedAt`: UTC epoch ms. Source of truth for date grouping. Timer-stop logs stamp `Date.now()`; adjustment logs (from Daily report Edit) stamp noon in the configured home TZ on the edited date; legacy rows were backfilled by the v13 migration to noon `America/Los_Angeles` on their stored `date`.
  - `date`: denormalized `YYYY-MM-DD` cache derived from `loggedAt + currentTimezone`. Kept for Firestore wire-format backward compat; not used for queries.
  - `itemUid`: parent item's uid; the cross-device link.
  - `itemId`: local Dexie pk for this device only; do not use across devices.
  - `uid`: UUID for the log itself; cross-device dedup key.
  - `syncedOnce` (stored, not indexed, added in v14): `true` once this log has reached the cloud (via `pushLog`) or arrived from the cloud (via `pullAll`/`subscribeToChanges`). `pushAllLocal` filters to `!syncedOnce` so already-synced logs are not re-pushed on every refresh — the dominant cost for users with many logs. v14 migration backfills existing rows to `true` (they're all already in cloud). Unlike items/notes, there is **no deletion reconciliation** based on this flag: logs are append-only, and remote-side deletes flow in via `subscribeToChanges` 'removed' events or via the cascade in `pushDeleteItem`.
- `notes` — Schema: `'++id, &uid, itemUid, date, trashed'`
  - `uid`: UUID; cross-device dedup key. Unique index.
  - `itemUid`: parent practice item's `uid`. Indexed.
  - `date`: `YYYY-MM-DD`. Indexed for chronological queries.
  - `body`: arbitrary text; the only user-editable field after creation.
  - `trashed` / `trashedAt`: soft-delete (same 30-day purge pattern as items).
  - `syncedOnce` (stored, not indexed): same offline-deletion reconciliation role as on items.
- `syncQueue` — Schema: `'++id, action, collection, localId'` (offline retry queue)

**Key Operations:**
- CRUD: `getItems`, `addItem(name, category)`, `renameItem`, `deleteItem`
- Category: `setItemCategory(id, category)` — updates `'fundamentals'` | `'songs'`
- Ordering: `updateItemOrder(orderedIds)` — batch updates sortOrder in a transaction
- Archive/Trash: `archiveItem(id, bool)`, `trashItem(id)`, `restoreItem(id)`, `purgeExpiredTrash(daysOld=30)`
- Merge: `mergeItem(sourceId, targetId)` — reassigns all logs **and notes** from source to target, hard-deletes the source item. Returns `{ sourceUid, targetUid, targetName }`.
- Logs: `addLog(itemId, duration, opts={})` (real-time, stamps `loggedAt=Date.now()`), `addAdjustmentLog(itemId, duration, dateStr)` (calendar-attributed, stamps `loggedAt=noonInHomeTz(dateStr)`), `getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange(startDate, endDate)`, `getAllLogs`, `reattributeLogsToDate(logIds, newDateStr)` (re-stamps existing logs' `loggedAt` to noon-in-home-TZ of `newDateStr` and updates `date`; returns the updated log objects for caller to push via `pushLog`)
- Notes: `addNote(itemUid, body, date?)`, `getAllNotes()`, `getNotesByItem(itemUid)`, `updateNote(id, body)`, `trashNote(id)`, `restoreNote(id)`

All operations are async/await. Date strings always use `YYYY-MM-DD` format. Deleting a practice item cascade-deletes all its logs **and notes** (wrapped in a single Dexie transaction). `purgeExpiredTrash` returns `{ expiredItems, expiredNotes }` — callers must handle both. Practice item names must be unique (case-insensitive check in UI).

### Notes Tab

Fourth tab (after Report). Two subpages: **By Date** (chronological feed, `NotesByDate.jsx`) and **By Item** (accordion grouped by category, `NotesByItem.jsx`). Managed by `NotesPage.jsx`.

- `notesSubpage` and `notesRefreshKey` live in `App.jsx`. `notesRefreshKey` is bumped by `loadData` (so every remote sync event also refreshes the Notes view) and by `bumpNotesRefresh` after local mutations. `NotesPage` receives both as props.
- `NoteEditModal.jsx` — create/edit modal. Create mode: item dropdown + date picker + textarea. Edit mode: textarea only (date/item locked). Dismissed only by Escape, Cancel, Save, or Delete — backdrop click is intentionally disabled.
- Notes attached to a trashed practice item are hidden from **both** By Date and By Item. By Item filters via `activeItems = items.filter(i => !i.trashed)`; By Date filters via `itemNameByUid` (only non-trashed items populate the map) and skips notes whose `itemUid` has no entry. Hard-deleting an item cascades to its notes.
- Firestore path: `users/{userId}/notes/{noteUid}`. Soft-deletes (`trashed: true`) are pushed as upserts, not hard-deletes, so other devices can still restore within the 30-day window.
- `mergeItem` reassigns notes' `itemUid` in the same transaction as logs. `subscribeToChanges` handles cross-device merge by remapping `itemUid` on `modified` events (same as logs).

### Timezone Setting

A single account-synced home timezone determines how all dates are computed. Stored on `users/{uid}.timezone` in Firestore, mirrored to `localStorage['drummate_timezone']`. The current value lives in a module-level variable in [src/services/timezoneService.js](src/services/timezoneService.js); `getTimezone()` is a synchronous getter consumed by [src/utils/tzDateHelpers.js](src/utils/tzDateHelpers.js) and `dateHelpers.toDateString`. `initTimezone(backend, userId)` is called from `App.jsx` once auth resolves and reconciles localStorage against Firestore; the default for the first user is `America/Los_Angeles`.

All log-grouping reads (`getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange`) use `loggedAt` range queries derived from the current timezone — switching the setting at runtime makes every report re-bucket without touching stored data. A full IANA timezone dropdown is exposed in `SettingsPanel.jsx` via `Intl.supportedValuesOf('timeZone')`.

### Offline Mode

Explicit, session-scoped offline mode. The app never auto-detects network changes mid-session — it only auto-enters offline mode on initial load if `navigator.onLine` is false. Users control transitions via UI.

- **`src/services/offlineService.js`** — module-level boolean (`getOfflineMode()` / `setOfflineMode()`). In-memory only; page refresh resets to `false`. Mirrors the pattern of `timezoneService.js`. Non-React backend code reads this synchronously.
- **`App.jsx` state** — `offlineMode` (React state) + `subscriptionRef` (ref to the Firestore listener so it can be torn down from outside the init effect). `setOfflineMode` is a wrapped setter that mirrors into `offlineService` synchronously.
- **`OfflineBanner.jsx`** — top-of-shell amber banner shown whenever `offlineMode === true`. Subscribes to `db.syncQueue.count()` via `Dexie.liveQuery` for the live pending count; tappable label opens `PendingChangesModal`; "Go online" link triggers `handleGoOnline`.
- **`PendingChangesModal.jsx`** — read-only list of every `syncQueue` entry, oldest first, rendered via `formatPendingAction(entry, t)` from [src/utils/pendingActionFormatter.js](src/utils/pendingActionFormatter.js). Subscribes via `Dexie.liveQuery` so newly-enqueued actions appear live. Backdrop click and Escape dismiss.
- **`SettingsPanel.jsx`** — "Offline mode" toggle row plus a "Pending changes: N" sub-row that opens the modal. Both call the same App.jsx handlers as the banner.

**State transitions:**
- *Initial load with `!navigator.onLine`* → `init()` sets `offlineMode = true` synchronously, skips all Firestore calls, banner mounts.
- *"Enter offline mode" button on sync overlay* → tears down `subscriptionRef.current` if active (sync-overlay path arrives before subscription is registered; settings-toggle path may arrive with an active subscription, so the teardown must happen here), sets `offlineMode = true`, dismisses overlay.
- *"Go online" (banner / settings)* → if `!navigator.onLine`, shows a 3.5s toast (`offline.stillOffline`) and stays in offline mode. Otherwise sets `offlineMode = false`, closes settings, bumps `syncTrigger` to re-fire the init effect.
- *Page refresh* → always resets to online attempt; offline state never persists.

**Push short-circuit:** every Firestore-mutating method in `firebaseBackend.js` checks `getOfflineMode()` at the top; if true, enqueues an enriched payload to `syncQueue` and returns without touching the network. Payloads carry `displayName` / `previousName` / `itemName` / full state hints so the modal formatter can render readable summaries and `flushSyncQueue` can replay without re-reading local Dexie (see gotcha about pull-then-push race below).

**Spec/plan:** [docs/superpowers/specs/2026-05-18-offline-mode-design.md](docs/superpowers/specs/2026-05-18-offline-mode-design.md), [docs/superpowers/plans/2026-05-18-offline-mode.md](docs/superpowers/plans/2026-05-18-offline-mode.md).

### Report Tab

Five subpages in `reportSubpage`: `daily`, `weekly`, `monthly`, `yearly`, `stats`.

- `DailyReport` / `WeeklyReport` / `MonthlyReport` / `YearlyReport` — scoped to their time window; receive a date/week/month/year start prop from App
- `DailyReport` edit mode (when `isToday && grandTotal > 0`) exposes a **Merge today's practice to yesterday** button — for late-night sessions past midnight that should still count toward yesterday. Calls `onMergeToYesterday` → `handleMergeToYesterday` in App.jsx, which uses `reattributeLogsToDate` to re-stamp every log in `reportLogs` to noon yesterday in the home TZ. Preserves per-item breakdown (no aggregation); if yesterday already has logs for the same items they simply sum together in the report view. Updated logs are pushed to Firestore via `pushLog` (upsert by `uid`). Confirms before applying.
- `StatsReport` — all-time aggregated stats (total time, total days, streaks, best month, top item). Calls `getAllLogs()` then filters to active (non-trashed) items before computing. Includes a "Generate Report" button that opens `ReportGeneratorModal`. Also renders `GoalCard` at the bottom.
- `ReportGeneratorModal` — generates a copyable plain-text summary for a user-selected date range. Uses `getLogsByDateRange` and respects `timeUnit`.

### Voice Commands & AI Features

- `src/audio/wakeWordEngine.js` — Wake word detection (openWakeWord WASM)
- `src/services/sttService.js` — Speech-to-text service
- `src/services/intentParser.js` — Parses voice transcripts into app intents (`parseIntent`, `findBestItemMatch`)
- `src/services/voiceFeedback.js` — TTS feedback (`speak`, `getLang`, `cancelSpeech`)
- `src/services/llmService.js` — On-device LLM for encouragement messages
- `src/services/ttsService.js` — Text-to-speech service (Kokoro)
- `src/components/FloatingVoiceIndicator.jsx` — Voice listening UI overlay
- `src/components/EncouragementButton.jsx` / `EncouragementModal.jsx` — AI-generated practice encouragement

### Internationalization (LanguageContext.jsx)

React Context providing `t(key)` function for translations. Supports nested keys (e.g., `t('tempoNames.allegro')`) and interpolation (`{param}` syntax). Languages: `en`, `zh`. Persisted to `localStorage` key `drummate_language`.

### Practice Goal (GoalCard / GoalBanner / GoalSetupModal)

A single time-boxed practice goal stored in `localStorage` key `drummate_goal` as `{ startDate, endDate, targetHours }`. Three self-contained components — none require new props from `App.jsx`:

- `GoalSetupModal` — create/edit modal; validates and writes to localStorage, then calls `onSave()`
- `GoalCard` — full-detail card in the Stats tab (`StatsReport`); reads localStorage + `getLogsByDateRange`, shows progress bar, required daily average, edit/clear
- `GoalBanner` — compact read-only strip at top of Practice tab (`PracticeItemList`); reads goal once on mount via `useState(readGoal)` with no setter (refreshes on remount/tab switch); returns `null` when no goal is set

Both `GoalCard` and `GoalBanner` define `readGoal()` and `dateDiffDays()` locally — intentionally duplicated to keep components self-contained. `daysLeft` always includes today (`dateDiffDays(today, endDate) + 1`) to avoid divide-by-zero on the last day.

### Keyboard Shortcuts (App.jsx)

All shortcuts are blocked when focus is in an `<input>` or `<textarea>`.

| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Switch to Practice / Metronome / Report / Notes tab |
| `Tab` / `Shift+Tab` | Cycle metronome subpages (metronome↔sequencer), report subpages (daily→weekly→monthly→yearly→stats), or notes subpages (byDate↔byItem) |
| `←` / `→` | Step report date back/forward (daily=1 day, weekly=1 week, monthly=1 month, yearly=1 year); **not bound on Notes tab** |
| `M` / `H` | Set time unit to minutes / hours |
| `E` / `C` | Switch language to English / Chinese |

## Utilities

### dateHelpers.js

Date helpers that operate on `YYYY-MM-DD` strings. `toDateString(date)` and `getTodayString()` delegate to `formatInTimezone(epochMs, getTimezone())` from `tzDateHelpers.js` so they respect the user's configured home timezone. The remaining helpers (`shiftDate`, `getWeekStart/End`, `getMonthStart/End`, `getYearStart/End`, `formatDateLabel`, `getDaysInRange`) operate on already-resolved date strings and are timezone-agnostic.

Key exports: `getTodayString()`, `toDateString(date)`, `shiftDate(dateStr, days)`, `formatDateLabel(dateStr, t)`, `getWeekStart/End(dateStr)`, `getMonthStart/End(dateStr)`, `getYearStart/End(dateStr)`, `getDaysInRange(start, end)`

### tzDateHelpers.js

Pure TZ-aware date math using `Intl.DateTimeFormat`. No React, no external deps.

Key exports: `formatInTimezone(epochMs, tz)` → `YYYY-MM-DD`, `getDateRangeUtc(dateStr, tz)` → `{ startMs, endMsExclusive }`, `noonInHomeTz(dateStr, tz)` → epoch ms, `legacyDateToLoggedAt(dateStr)` → epoch ms (always anchored to noon `America/Los_Angeles`).

### formatTime.js

Two distinct formatters:
- `formatTime(seconds)` → `"HH:MM:SS"` — used for the live practice timer display
- `formatDuration(seconds, unit)` → number (minutes or hours) — used in all reports; respects `timeUnit` state

## Critical Implementation Patterns

### Practice Timer Auto-Save
When user closes/refreshes with active timer: `beforeunload`/`pagehide` → save to `localStorage` as `drummate_pending_log` → recovered on next load. iOS Safari kills pages aggressively; synchronous localStorage survives.

### Metronome ↔ Sequencer Switching
When switching subpages: stop playback → `setSequence(null)` → clear beat indicators → disable NoSleep. Prevents audio engine state conflicts.

### Drag-and-Drop Reordering
Practice items use `@dnd-kit/sortable` for reordering. Edit mode uses **two `SortableContext` instances** (one per category) inside a single `DndContext`. On drag end: `handleDragEnd` uses `arrayMove` for same-category reorders and splice for cross-category drops → `onReorder([{id, category}])` → DB transaction updates `sortOrder` and `category` → `backend.pushReorder(items, userId)`. `pushReorder` carries `category` per item so cross-section drags are atomic on the remote.

### Trash Bin (Soft Delete)
Items are soft-deleted (`trashed: true`, `trashedAt: ISO string`). `purgeExpiredTrash(30)` runs on app load to permanently delete items trashed >30 days ago. Restore sets `trashed: false` and also clears `archived`.

### NoSleep.js
Single global instance in `App.jsx`. Enable on start, disable on stop/tab switch. **Never create multiple instances** (causes iOS bugs).

### Web Worker Path
Worker MUST be in `public/` folder, referenced as `/metronome-worker.js` (absolute path). Vite serves `public/` as-is; relative paths break in production.

## Styling

- **Tailwind CSS v4 only** — no CSS modules, no inline styles
- Mobile-first responsive design
- System font stack (defined in `index.css`)

## Common Gotchas

1. **AudioContext must be created in user gesture** (Safari requirement) — engine initializes on first play
2. **iOS silent mode bypass:** Engine sets audio session to `'playback'` category
3. **Timer cleanup:** Always clear intervals in cleanup functions
4. **Starting new practice item auto-saves previous item** if still running
5. **Database operations are async** — always await
6. **Date strings must be YYYY-MM-DD** — use `dateHelpers.js`
7. **All user-facing text must use `t()` function** for bilingual support
8. **Metronome state is global in App.jsx** — persists across tab switches
9. **Practice item names are mutable; identity is the `uid`** — UI does a case-insensitive duplicate-name check in `handleAddItem` for UX, but cross-device sync identity is the `uid` field. Always pass `item.uid` (not `item.name`) to backend push methods.
10. **Backend interface compliance** — new sync operations must be added to `firebaseBackend.js`
11. **Firebase SDK** — `firebaseBackend.js` is imported statically; it is always bundled
12. **Database migrations** — Dexie version must be incremented when adding/changing indexed fields; provide `.upgrade()` to populate defaults on existing records
13. **Sync init order is `[initTimezone, pullAll, pullAllNotes, pullAllPractices] (parallel) → flushSyncQueue → pushAllLocal → loadData → setIsSyncing(false) → subscribeToChanges`** — see [App.jsx](src/App.jsx) `init()`. Pulling first lets the device adopt remote-truth (renames, deletes) before pushing local state. The four parallel tasks touch disjoint Dexie tables and disjoint Firestore collections; intermediate cross-table inconsistency is invisible since the UI is gated by `isSyncing`. `initTimezone` is safe to run in parallel because the module-level `currentTz` is already initialized from `localStorage` cache at module load — `getTimezone()` returns a valid value before the Firestore reconciliation finishes, and none of the pulls read or write timezone. The `loadData` and `setIsSyncing(false)` are in a `finally` block so the UI updates and unblocks even on partial failure. `subscribeToChanges` registers AFTER `loadData` so its initial snapshot doesn't surface stale-state flicker.
14. **`pullAll` processes logs BEFORE reconciling item deletions** — the items network call and logs network call fire in parallel at the top of `pullAll`, but the **loops** run sequentially: items loop first (writes parent items to Dexie), then logs loop (looks up parents). Item-deletion reconciliation runs last. If you change the loop order, cross-device merges will cause silent log data loss.
15. **`subscribeToChanges` log `modified` events must remap parent** — the live Firestore listener handles `modified` on logs by updating local `itemUid`/`itemId` if `item_uid` changed. This mirrors the `pullAll` remap logic and prevents data loss when a merge on another device arrives via real-time subscription.
16. **`category` is orthogonal to `archived`** — `category` (`'fundamentals'` | `'songs'`) controls which active section an item appears in; `archived` controls whether it's in the active sections or the collapsed Archived section. Both fields are always persisted. Tolerant pull rule: treat absent `category` on remote as "no change" (`if (remote.category !== undefined && ...)`) to avoid clobbering on old clients.
17. **`notesRefreshKey` lives in App.jsx, not NotesPage** — `loadData` bumps it on every call (including remote sync events from `subscribeToChanges`). Local note mutations call `bumpNotesRefresh` (the setter) passed as `onNotesRefresh` prop. This ensures the Notes tab re-fetches both after local writes and after remote sync arrives.
18. **`purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`** — the App.jsx caller destructures both arrays and calls `pushDeleteItem` for items and `deleteNoteRemote` for notes to propagate hard-deletes to Firestore.
19. **Note soft-delete is a push, not a hard-delete** — `trashNote` sets `trashed: true` locally, then `pushNote` upserts the full note (including `trashed: true`) to Firestore. `deleteNoteRemote` is only called by `purgeExpiredTrash` (after 30 days) and by the `deleteItem` cascade.
20. **`pullAll` / `pullAllNotes` / `pullAllPractices` bail when `snap.metadata.fromCache` is true** — the Firestore Web SDK (initialized as plain `getFirestore(app)`, no persistence) resolves `getDocs` with an empty cached snapshot when offline. Without this guard, the deletion-reconciliation loops at the end of each pull function would treat every locally-synced row as "deleted on another device" and hard-delete them all from Dexie. Never remove these guards; they're the difference between offline-safe and data-loss.
21. **`pushAllLocal` / `pushAllLocalNotes` / `pushAllLocalPractices` filter to `syncedOnce: false`** — synced rows have their edits replayed by `flushSyncQueue` from queue payloads. Re-pushing them in `pushAllLocal` would write this device's pull-overwritten state back to cloud, undoing `flushSyncQueue`'s work (the "pull-then-push race"). Logs (added in v14) also filter to `!syncedOnce`, but for a different reason: logs are append-only and immutable on cloud post-push, so re-pushing N×~44ms per refresh was the dominant init cost for users with many logs. `pushLog` flips `syncedOnce: true` on `setDoc` success; `pullAll` and `subscribeToChanges` set it when adopting a remote log locally (including back-patching pre-v14 rows on initial-snapshot replay).
22. **`flushSyncQueue` writes BOTH cloud AND local Dexie for field-update actions** — `reorder`, `rename_item`, `archive_item`, `trash_item`, `set_category`, `push_note`, `push_practice`, `reorder_practices`. After pushing to cloud, the handler re-asserts the payload values in local Dexie. This restores the offline intent that the earlier `pullAll` just overwrote, so `loadData` (in `init`'s `finally`) reads the final post-merge state with no flicker.
23. **`subscribeToChanges` items/notes/practices listeners handle `'added'` and `'modified'` with the same reconciliation logic** — the Firestore initial snapshot after listener registration reports every doc as `change.type === 'added'`, including docs we just updated via `flushSyncQueue`. Without unified handling, cloud-side updates that happened before subscription registers would never propagate to local Dexie until refresh. The logs listener doesn't need this unification (no field updates flow through that path).
24. **Offline-mode push payloads are enriched with the full mutable state** — `push_note` carries `body`, `trashed`, `trashedAt`, `itemUid`, `createdAt`. `push_practice` carries every BPM/time-signature/etc field. `flushSyncQueue`'s handlers push directly from the payload via `setDoc`, NOT by re-reading local Dexie (which would already be pull-overwritten). Legacy minimal payloads (from the catch-block fallback when `navigator.onLine` is true but Firestore actually fails) fall back to re-reading local — see the dual-path handlers in `flushSyncQueue`.

## File Naming

- Components: PascalCase (`PracticeItemList.jsx`)
- Utilities/services: camelCase (`dateHelpers.js`, `database.js`)
- Context: PascalCase + "Context" suffix (`LanguageContext.jsx`)

## Commit Conventions

- `feat:`, `fix:`, `refactor:`, `docs:`
- Always include: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Testing Checklist

After changes:
- [ ] `npm run build` succeeds
- [ ] All tabs work (Practice, Metronome subpages, Report, Notes subpages)
- [ ] Database persists after refresh
- [ ] Metronome/sequencer plays in background when switching tabs
- [ ] Language toggle works
- [ ] Mobile responsive (if UI changes)
- [ ] Notes: create/edit/delete a note → both By Date and By Item reflect changes immediately
- [ ] Notes: remote sync (another device or Firestore write) refreshes Notes tab without switching tabs
- [ ] Offline refresh: DevTools → Network → Offline, reload — app loads with local data intact, amber banner shows automatically, no items wiped from Dexie
- [ ] Offline edits: create item / add log / rename / reorder / edit note while offline — pending count in banner ticks up, modal lists each action in human-readable form
- [ ] Go online round-trip: re-enable network, tap "Go online" — sync overlay persists until queue drains, items appear in their post-offline state (no flicker, no revert)
- [ ] Go online while still offline: tap "Go online" — 3.5s toast appears, banner stays, no overlay flash
