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

Dexie.js wrapper around IndexedDB. Database name: `DrummateDB`, current version: **13**.

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
- Logs: `addLog(itemId, duration, opts={})` (real-time, stamps `loggedAt=Date.now()`), `addAdjustmentLog(itemId, duration, dateStr)` (calendar-attributed, stamps `loggedAt=noonInHomeTz(dateStr)`), `getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange(startDate, endDate)`, `getAllLogs`
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

### Report Tab

Five subpages in `reportSubpage`: `daily`, `weekly`, `monthly`, `yearly`, `stats`.

- `DailyReport` / `WeeklyReport` / `MonthlyReport` / `YearlyReport` — scoped to their time window; receive a date/week/month/year start prop from App
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
13. **Sync init order is `pullAll → pullAllNotes → flushSyncQueue → pushAllLocal`** — pulling first lets the device adopt remote-truth (renames, deletes) before pushing local state. Notes pull last among the pulls so item truth is in place first (notes reference `itemUid`).
14. **`pullAll` pulls logs BEFORE reconciling item deletions** — the log-pull loop runs first and remaps existing logs' `itemUid`/`itemId` if `item_uid` changed remotely (e.g. from a cross-device merge). Item-deletion reconciliation runs after. If you change this order, cross-device merges will cause silent log data loss.
15. **`subscribeToChanges` log `modified` events must remap parent** — the live Firestore listener handles `modified` on logs by updating local `itemUid`/`itemId` if `item_uid` changed. This mirrors the `pullAll` remap logic and prevents data loss when a merge on another device arrives via real-time subscription.
16. **`category` is orthogonal to `archived`** — `category` (`'fundamentals'` | `'songs'`) controls which active section an item appears in; `archived` controls whether it's in the active sections or the collapsed Archived section. Both fields are always persisted. Tolerant pull rule: treat absent `category` on remote as "no change" (`if (remote.category !== undefined && ...)`) to avoid clobbering on old clients.
17. **`notesRefreshKey` lives in App.jsx, not NotesPage** — `loadData` bumps it on every call (including remote sync events from `subscribeToChanges`). Local note mutations call `bumpNotesRefresh` (the setter) passed as `onNotesRefresh` prop. This ensures the Notes tab re-fetches both after local writes and after remote sync arrives.
18. **`purgeExpiredTrash` returns `{ expiredItems, expiredNotes }`** — the App.jsx caller destructures both arrays and calls `pushDeleteItem` for items and `deleteNoteRemote` for notes to propagate hard-deletes to Firestore.
19. **Note soft-delete is a push, not a hard-delete** — `trashNote` sets `trashed: true` locally, then `pushNote` upserts the full note (including `trashed: true`) to Firestore. `deleteNoteRemote` is only called by `purgeExpiredTrash` (after 30 days) and by the `deleteItem` cascade.

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
