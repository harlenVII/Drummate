# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drummate is a Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js (IndexedDB) with Firebase cloud sync.

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

**Implementation:** Lookahead scheduler (25ms wake-up, 100ms lookahead). Web Worker at `/metronome-worker.js` (must be in `public/`). Subdivision patterns are arrays of integers (0=quarter, 1=eighth, 2=triplet, 3=sixteenth). Rest beats use `[-1]`.

### Database Layer (database.js)

Dexie.js wrapper around IndexedDB. Database name: `DrummateDB`, current version: 9.

**Tables:**
- `practiceItems` — Schema: `'++id, &uid, name, sortOrder, archived, trashed, category'`
  - `uid`: UUID generated at creation; the cross-device sync identity. Stable across renames.
  - `name`: mutable display label. UI enforces uniqueness at create-time but the DB no longer requires it.
  - `sortOrder`: integer for drag-and-drop ordering (@dnd-kit)
  - `archived`: boolean, hides from active list
  - `trashed`: boolean, soft-delete with `trashedAt` ISO timestamp (auto-purged after 30 days)
  - `category`: `'fundamentals'` | `'songs'` — which section the item appears in. Orthogonal to `archived`.
  - `syncedOnce` (stored, not indexed): `true` once this item has reached the cloud (via push) or arrived from the cloud (via pull/subscribe). `pullAll` deletes any item with `syncedOnce: true` whose uid is missing from the latest remote set — this is how offline deletes propagate.
- `practiceLogs` — Schema: `'++id, itemId, itemUid, date, duration, uid'`
  - `itemUid`: parent item's uid; the cross-device link.
  - `itemId`: local Dexie pk for this device only; do not use across devices.
  - `uid`: UUID for the log itself; cross-device dedup key.
- `syncQueue` — Schema: `'++id, action, collection, localId'` (offline retry queue)

**Key Operations:**
- CRUD: `getItems`, `addItem(name, category)`, `renameItem`, `deleteItem`
- Category: `setItemCategory(id, category)` — updates `'fundamentals'` | `'songs'`
- Ordering: `updateItemOrder(orderedIds)` — batch updates sortOrder in a transaction
- Archive/Trash: `archiveItem(id, bool)`, `trashItem(id)`, `restoreItem(id)`, `purgeExpiredTrash(daysOld=30)`
- Logs: `addLog`, `getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange(startDate, endDate)`

All operations are async/await. Date strings always use `YYYY-MM-DD` format. Deleting a practice item cascade-deletes all its logs. Practice item names must be unique (case-insensitive check in UI).

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

React Context providing `t(key)` function for translations. Supports nested keys (e.g., `t('tempoNames.allegro')`) and interpolation. Languages: `en`, `zh`. Does NOT persist across refresh.

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
13. **Sync init order is `pullAll → flushSyncQueue → pushAllLocal`** — pulling first lets the device adopt remote-truth (renames, deletes) before pushing local state. The `syncedOnce` flag on items lets `pullAll` distinguish "deleted on another device" (delete locally) from "created here while offline" (preserve and push up).
14. **`category` is orthogonal to `archived`** — `category` (`'fundamentals'` | `'songs'`) controls which active section an item appears in; `archived` controls whether it's in the active sections or the collapsed Archived section. Both fields are always persisted. Tolerant pull rule: treat absent `category` on remote as "no change" (`if (remote.category !== undefined && ...)`) to avoid clobbering on old clients.

## File Naming

- Components: PascalCase (`PracticeItemList.jsx`)
- Utilities/services: camelCase (`dateHelpers.js`, `database.js`)
- Context: PascalCase + "Context" suffix (`LanguageContext.jsx`)

## Commit Conventions

- `feat:`, `fix:`, `refactor:`, `docs:`
- Always include: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Testing Checklist

After changes:
- [ ] `npm run build` succeeds
- [ ] All tabs work (Practice, Metronome subpages, Report)
- [ ] Database persists after refresh
- [ ] Metronome/sequencer plays in background when switching tabs
- [ ] Language toggle works
- [ ] Mobile responsive (if UI changes)
