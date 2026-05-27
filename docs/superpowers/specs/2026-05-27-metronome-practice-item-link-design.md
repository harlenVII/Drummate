# Metronome Practice → Practice Item Link

**Date:** 2026-05-27

## Overview

Add an optional link from a metronome practice (tempo-trainer session) to a practice item (timed drills on the Practice tab). When a linked metronome practice is started, the corresponding practice item's timer starts automatically. When the metronome practice completes naturally (all BPM steps done), the timer auto-saves and stops.

## Data Model

Add `linkedItemUid` (nullable string, default `null`) to the `metronomePractices` record:

```
{ id, uid, name, startBpm, endBpm, bpmIncrement, barsPerStep, timeSignature, subdivision, soundType, sortOrder, syncedOnce, linkedItemUid }
```

- No new Dexie index — the field is only accessed by reading the practice object directly, never queried.
- No DB version bump required; Dexie treats new unindexed fields on existing records as `undefined` (treated as `null`).
- Sync: `pushPractice` already sends the full practice object via `setDoc`; `pullAllPractices` reads it back whole. No Firebase schema changes needed.

## UI — PracticeEditModal

Add a **"Linked practice item"** section at the bottom of the modal form (after the sound type picker):

- A native `<select>` dropdown styled to match existing inputs.
- Options:
  - `-- None --` (value `""`, maps to `null`)
  - Items grouped by category using `<optgroup label="Fundamentals">` / `<optgroup label="Songs">`, alphabetically by name within each group.
- Data source: `items` prop — the list of non-trashed practice items passed down from App.jsx → PracticePage → PracticeEditModal.
- Stale link handling: if the saved `linkedItemUid` does not match any item in `items` (item was deleted/purged), render a disabled `⚠ Item not found` option as the selected value so the user knows to clear or update it.
- On save, `linkedItemUid` is `null` when "None" is selected, or the `uid` string of the selected item.

### Prop chain additions

- `App.jsx` passes `items={items.filter(i => !i.trashed)}` as a new `items` prop to `PracticePage`.
- `PracticePage` forwards `items` to `PracticeEditModal` when the add/edit modal is open.
- `DEFAULTS` in `PracticeEditModal` gains `linkedItemUid: null`.

## Logic — App.jsx

### On start: `handleStartPractice(uid)`

Current behavior: sets `runningPracticeUid` and resets run state.

New behavior (after existing state resets):

1. Look up the metronome practice in `metronomePractices` state by `uid`.
2. If `practice.linkedItemUid` is set:
   a. Find the matching practice item in `items` by `item.uid === practice.linkedItemUid`.
   b. If not found (item deleted) → skip silently; metronome practice starts normally.
   c. If `activeItemId != null` → call `await saveAndStop()` first (saves the currently running item).
   d. Call `await handleStart(linkedItem.id)` to start the linked item's timer.

### Natural completion: `handleEndPractice(wasComplete)`

**Change in `PracticeRunView`:** `handleEnd` calls `onEnd(complete)` instead of `onEnd()`. The `complete` boolean propagates up through `PracticePage` → `handleEndPractice(wasComplete)` in App.jsx.

In `handleEndPractice(wasComplete)`:

1. Read `runningPracticeUid` **before** clearing it (order matters).
2. If `wasComplete === true`:
   a. Look up the metronome practice in `metronomePractices` state by `runningPracticeUid`.
   b. If the practice has `linkedItemUid` and `activeItemId != null`:
   c. Find the active practice item; confirm its `uid === practice.linkedItemUid`.
   d. If match → call `await saveAndStop()` to save and stop the practice timer.
3. Clear all running practice state (`setRunningPracticeUid(null)`, etc.) as today.

### Manual "End": wasComplete = false

`saveAndStop()` is not called. The practice item timer keeps running unchanged.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Linked item deleted/purged | Auto-start skipped on next run; modal shows ⚠ warning |
| Linked item archived | Auto-start still works; `handleStart` has no archived check |
| Linked item already running when metronome starts | saveAndStop current item, then restart it (same item, resetting timer) — acceptable since handleStart does exactly this |
| User manually starts a different item after metronome starts | The `uid` check in `handleEndPractice` will not match; that item's timer is left running |
| Visitor mode (no user, no Firebase) | Link stored in Dexie only; no cloud push — consistent with how practices work today for visitors |

## Files Changed

| File | Change |
|---|---|
| `src/components/PracticeEditModal.jsx` | Add `items` prop + linked item dropdown |
| `src/components/PracticeRunView.jsx` | `onEnd(complete)` instead of `onEnd()` |
| `src/components/PracticePage.jsx` | Accept + forward `items` prop; update `onEndPractice` signature |
| `src/App.jsx` | Pass `items` to PracticePage; update `handleStartPractice`, `handleEndPractice` |
| `src/contexts/LanguageContext.jsx` | Add i18n strings for the new dropdown section |
