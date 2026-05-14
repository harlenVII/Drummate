# Metronome Practice Mode — Design

**Date:** 2026-05-13
**Status:** Approved, ready for implementation plan

## Overview

A new "Practice Mode" lives as a third subpage of the Metronome tab (alongside Metronome and Sequencer). It is a tempo trainer: the user defines a practice with a start tempo, end tempo, BPM increment, bars per tempo step, time signature, subdivision, and sound. Running the practice plays the metronome at each tempo step in turn, automatically advancing after the configured number of bars. Practices are persisted in IndexedDB and synced to Firestore.

## Goals

- Add, edit, delete, reorder, and run named tempo-trainer practices.
- Each practice carries its full metronome configuration (time signature, subdivision, sound) so selecting a practice fully configures the engine.
- Sync practices across devices via Firebase (same patterns as items/notes).
- Keep the audio engine and the rest of the metronome tab unaffected when the practice subpage is not in use.

## Non-Goals

- No logging of practice runs against any practice item (the Practice tab and the metronome's Practice Mode are independent features).
- No soft-delete / trash bin for practices — deletion is permanent.
- No localStorage recovery if the page is refreshed mid-run.
- No non-uniform tempo segments. The shape is always startBpm → endBpm by a fixed increment.

## Data Model

New Dexie table `metronomePractices`, added in Dexie version **11**.

| Field            | Type                     | Notes                                                              |
|------------------|--------------------------|--------------------------------------------------------------------|
| `id`             | auto-increment int       | local primary key                                                  |
| `uid`            | string                   | UUID; cross-device sync identity (unique index)                    |
| `name`           | string                   | free text; no uniqueness check                                     |
| `startBpm`       | number                   | inclusive                                                          |
| `endBpm`         | number                   | inclusive; must be ≥ `startBpm`                                    |
| `bpmIncrement`   | number                   | ≥ 1                                                                |
| `barsPerStep`    | number                   | ≥ 1                                                                |
| `timeSignature`  | `{ beats, noteValue }`   | per-practice                                                       |
| `subdivision`    | string                   | key from `SUBDIVISIONS` constant                                   |
| `soundType`      | string                   | matches metronome sound-type options                               |
| `sortOrder`      | int                      | display order (indexed)                                            |
| `createdAt`      | ISO string               |                                                                    |
| `updatedAt`      | ISO string               |                                                                    |
| `syncedOnce`     | bool (stored, not indexed) | true once item has reached the cloud or arrived from it          |

Schema string: `'++id, &uid, sortOrder'`.

**Validation** (enforced in the form, not the DB):
- All numeric fields are positive integers.
- `endBpm` ≥ `startBpm`.
- `bpmIncrement` ≥ 1, `barsPerStep` ≥ 1.
- `name` non-empty after trim.

**Derived values** (computed at run time, not stored):
- `totalSteps = floor((endBpm - startBpm) / bpmIncrement) + 1`
- BPM at step `i` (0-indexed) = `min(startBpm + i * bpmIncrement, endBpm)`. The last step is clamped at `endBpm` when the math would overshoot, so the trainer always finishes at exactly `endBpm`.
- `totalBars = totalSteps * barsPerStep`.

**Deletion:** hard delete only. No `trashed`/`trashedAt` fields, no purge job.

## UI Architecture

### Subpage integration

`metronomeSubpage` gains a third value: `'practice'`. The subpage toggle in `App.jsx` becomes a three-button row: Metronome / Sequencer / Practice. The `Tab` / `Shift+Tab` cycle order for the metronome tab becomes `['metronome', 'sequencer', 'practice']`.

Switching between any two of these three subpages stops audio, clears any active practice run state, and disables NoSleep (same pattern as the existing metronome ↔ sequencer transition).

### Components

Three new components, all under `src/components/`:

- **`PracticePage.jsx`** — the container. Renders either the list view or the run view based on whether a practice is currently running.
- **`PracticeEditModal.jsx`** — create/edit form modal.
- **`PracticeRunView.jsx`** — the running-practice UI.

#### List view (default state of `PracticePage`)

- Scrollable list of practices ordered by `sortOrder`.
- Each row shows: name, summary line ("80 → 120 BPM, +5 every 4 bars, 4/4"), a "Start" button, and an edit/delete kebab menu (or an inline edit icon — implementer's call).
- Drag handle on each row enables reorder via `@dnd-kit/sortable` (one `SortableContext` inside one `DndContext`). No category grouping, so the structure is simpler than `PracticeItemList`.
- Floating "+" button (or a header-row Add button) opens `PracticeEditModal` in create mode.
- Empty state: a centered message and a primary "Add practice" CTA.

#### Run view

Replaces the list when a practice is active. Renders:

- Practice name as the header.
- Large current BPM number.
- "Step N / totalSteps — bar M / barsPerStep" indicator.
- Linear progress bar covering total bars (filled = bars completed so far).
- **Play/Pause** button: toggles the engine. Pause preserves `stepIndex` and `barIndex`; resume restarts the engine at the start of the current bar of the current step at the current step's BPM. Mid-bar resume is not supported.
- **End** button: stops audio and returns to the list view.
- On reaching `totalSteps`, the engine is stopped and the run view shows a completion state (e.g., "Practice complete" with a "Done" button that returns to the list).

#### `PracticeEditModal`

- Fields: name, startBpm, endBpm, bpmIncrement, barsPerStep, time signature, subdivision, sound.
- Buttons: Save, Cancel, Delete (Delete only in edit mode, with a confirmation prompt).
- Dismiss conventions match `NoteEditModal`: closes only via Escape, Cancel, Save, or Delete. Backdrop click is intentionally disabled.

## State

All new state lives in `App.jsx`, following the existing global-state pattern.

```
metronomePractices       // array of practices, loaded from DB on auth bootstrap
practiceRunState         // null when idle; otherwise { practiceUid, stepIndex, barIndex, paused }
                         // (barIndex is the count of bars completed within the current step;
                         // mid-bar resume is not supported — resume restarts at the start of the current bar)
```

`practiceRunState` lives in `App.jsx` so it survives app-tab switches (1/2/3/4), matching how regular metronome state persists across tabs. Switching between metronome subpages (metronome ↔ sequencer ↔ practice) clears it as part of the audio-stop transition.

A ref (`practiceRunStateRef`) mirrors `practiceRunState` for use inside the engine's `onBeat` callback, since that callback closes over its initial value.

## Audio Engine Integration

`MetronomeEngine` already exposes everything needed except a one-shot accent. The runner attaches an `onBeat({ beat })` handler that:

1. Detects a bar boundary when `beat === 0` after the first beat has fired.
2. Increments `barIndex` on each bar boundary.
3. When `barIndex` reaches `barsPerStep`:
   - Resets `barIndex` to 0.
   - Increments `stepIndex`.
   - Computes `nextBpm = min(startBpm + stepIndex * bpmIncrement, endBpm)`.
   - Calls `engine.setBPM(nextBpm)`.
   - Calls `engine.triggerOneShotAccent()` (see engine addition below) so the next downbeat is accented even if the user's accent-first-beat setting is off.
4. When `stepIndex` exceeds `totalSteps - 1`: calls `engine.stop()` and transitions the run view to the completion state.

**Engine addition:** a new `triggerOneShotAccent()` method on `MetronomeEngine` that sets a flag consumed by the next scheduled downbeat. Implementation: a boolean `oneShotAccent` on the engine; when scheduling beat 0, if the flag is set, use the accent sound regardless of the user setting and then clear the flag.

When a practice starts, the engine is configured with that practice's time signature, subdivision, sound type, and `startBpm` before `start()` is called. When the practice ends (by completion or by the End button), the engine is left as-is — the user's regular metronome state in `App.jsx` (`metronomeBpm`, `metronomeTimeSignature`, etc.) is unaffected, so returning to the metronome subpage shows their previous configuration.

## Sync

**Firestore path:** `users/{userId}/metronomePractices/{uid}`.

### `firebaseBackend.js` additions

- `pushPractice(practice, userId)` — upsert the full practice document.
- `pushDeletePractice(uid, userId)` — hard-delete the document.
- `pullAllPractices(userId)` — return an array of remote practices.
- `pushPracticeReorder(practices, userId)` — write new `sortOrder` to each practice's document (mirrors the items `pushReorder`; one write per affected practice).
- Extend `subscribeToChanges` to also subscribe to the practices collection and emit added / modified / removed events analogous to items.

### `database.js` additions

- `getPractices()` — return all practices ordered by `sortOrder`.
- `addPractice(data)` — generate `uid`, set `createdAt`/`updatedAt`, assign next `sortOrder`, insert. Return the new local record.
- `updatePractice(id, data)` — patch fields, bump `updatedAt`.
- `deletePractice(id)` — hard delete.
- `updatePracticeOrder(orderedIds)` — batch update `sortOrder` in a single transaction (mirrors `updateItemOrder`).
- `pullAllPractices(remotePractices)` — reconcile remote into local: upsert each remote, then hard-delete any local practice where `syncedOnce: true` and the uid is missing from the remote set (same offline-delete pattern as items).

### Sync init order

Existing order is `pullAll → pullAllNotes → flushSyncQueue → pushAllLocal`. Updated order:

```
pullAll → pullAllNotes → pullAllPractices → flushSyncQueue → pushAllLocal
```

`pushAllLocal` is extended to also push any local practices that lack `syncedOnce` (mirrors the items/notes flow).

### Dexie migration

Bump database version to **11** and add the `metronomePractices` table with the schema string above. No `upgrade()` body is needed because the table is new and contains no existing data.

## Reorder Flow

1. User drags a row in the practice list.
2. `@dnd-kit`'s `onDragEnd` calls a new `handlePracticeReorder(orderedIds)` handler in `App.jsx`.
3. The handler:
   - Calls `database.updatePracticeOrder(orderedIds)` to write new `sortOrder` values in a transaction.
   - Reloads `metronomePractices` state from the DB.
   - Calls `firebaseBackend.pushPracticeReorder(updatedPractices, userId)` to propagate to other devices.

If offline, the push silently fails and the local order stands; the existing sync queue / `pushAllLocal` flow will reconcile on next connectivity (the reorder is captured in each practice's persisted `sortOrder`).

## Internationalization

New translation keys in `LanguageContext.jsx` for both `en` and `zh`:

- `metronomeSubpages.practice` — label for the subpage toggle button
- `practiceMode.addPractice`, `practiceMode.editPractice`, `practiceMode.deletePractice`, `practiceMode.deleteConfirm`
- `practiceMode.name`, `practiceMode.startBpm`, `practiceMode.endBpm`, `practiceMode.bpmIncrement`, `practiceMode.barsPerStep`
- `practiceMode.start`, `practiceMode.pause`, `practiceMode.resume`, `practiceMode.end`
- `practiceMode.stepProgress` (interpolated), `practiceMode.barProgress` (interpolated)
- `practiceMode.complete`, `practiceMode.done`
- `practiceMode.emptyState`
- Validation messages

All user-facing strings in the new components must use `t()`.

## Keyboard

The `Tab` cycle in the metronome tab is extended to include `'practice'`. No new global shortcuts.

## Testing Checklist (post-implementation)

- [ ] `npm run build` succeeds.
- [ ] Practice subpage appears in the metronome tab toggle; Tab / Shift+Tab cycles through all three subpages.
- [ ] Create, edit, delete, reorder a practice — all reflected in the list immediately.
- [ ] Running a practice plays the metronome at start BPM, advances tempo every `barsPerStep` bars, and stops at end BPM with a completion screen.
- [ ] Pause preserves position; resume restarts at the start of the same bar of the same step at the same BPM.
- [ ] End button returns to the list and stops audio.
- [ ] Switching subpage or app tab during a run: subpage switch stops audio; app-tab switch continues playing.
- [ ] Step-transition downbeat is accented even when accent-first-beat is off.
- [ ] Sync: practices created/edited/deleted/reordered on one device appear on another within the normal sync window.
- [ ] Offline create → online: practice appears on other devices on next sync.
- [ ] DB version 11 migration runs cleanly on a fresh install and on an upgrade from version 10.
- [ ] Bilingual UI: every new string renders in both en and zh.
