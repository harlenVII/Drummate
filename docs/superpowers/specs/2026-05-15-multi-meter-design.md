# Multi-Meter Mode — Design

**Date:** 2026-05-15
**Status:** Approved, ready for implementation plan

## Overview

A new "Multi-Meter" subpage in the Metronome tab (4th alongside Metronome, Sequencer, and Practice). The user builds a list of bar slots, each assigned a time signature from a curated list. On playback the engine cycles through the bars in order, looping indefinitely — each bar plays exactly once per cycle at its own beat count. BPM, sound type, and subdivision are global for the whole sequence.

## Goals

- Build a sequence of bars with different time signatures that loops continuously.
- Global BPM, sound type, and subdivision apply to all bars.
- Slots persist to localStorage (no Firestore sync — keeping scope tight).
- Audio transitions between time signatures are engine-owned (no UI-callback timing risk).

## Non-Goals

- No per-bar sound type or subdivision.
- No Firestore sync.
- No "bars per slot" (every slot is exactly 1 bar).
- No free-input time signatures — a fixed curated list only.

## Curated Time Signatures

12 options in two rows:

| Row | Options |
|-----|---------|
| /4  | 2/4, 3/4, 4/4, 5/4, 6/4, 7/4 |
| /8  | 3/8, 6/8, 7/8, 9/8, 11/8, 12/8 |

## UI Architecture

### Subpage Integration

`metronomeSubpage` gains a fourth value: `'multiMeter'`. The subpage toggle becomes a four-button row: Metronome | Sequencer | Practice | Multi-Meter.

The `Tab` / `Shift+Tab` cycle order for the metronome tab becomes `['metronome', 'sequencer', 'practice', 'multiMeter']`.

Switching to/from `'multiMeter'` stops audio, clears `multiMeterPlayingSlot` to `-1`, and disables NoSleep (same cleanup as the other subpages in `handleSubpageChange`).

### Component

One new component: **`src/components/MultiMeterPage.jsx`**

Modelled closely on `SequencerPage.jsx`. Layout top-to-bottom:

1. **Beat indicator** — `BeatIndicator` strip showing `slots[playingSlot]?.beats ?? 4` circles with the current beat lit; gives per-beat feedback within the active bar.
2. **Slot grid** — 4-column grid, up to 16 slots. Each card shows its time signature (e.g., "5/4"). The currently playing card is highlighted with a blue border + scale-up (same style as the sequencer's active slot). In edit mode cards are draggable and show a × delete badge.
3. **Edit mode controls** — visible only when editing and stopped:
   - Label: "Tap to add a bar"
   - Two rows of curated time signature buttons (tap to append / insert)
   - "Done" button to exit edit mode
4. **Sound type selector** — global button group (click, woodBlock, hiHat, rimshot, beep)
5. **Subdivision selector** — global icon button group (same `SUBDIVISIONS` filter as `Metronome.jsx`)
6. **BPM dial** — own BPM, independent of metronome/sequencer BPMs
7. **Play/Stop button** — disabled when `slots.length === 0`
8. **Edit / Done button** — only visible when not playing

Empty state (no slots, not editing): centered message using `t('multiMeter.emptyState')`.

## State

All new state lives in `App.jsx`, following the existing global-state pattern.

### New state variables

| Variable | Type | Default | localStorage key |
|----------|------|---------|-----------------|
| `multiMeterBpm` | number | 120 | `drummate_multimeter_bpm` |
| `multiMeterSoundType` | string | `'click'` | `drummate_multimeter_sound_type` |
| `multiMeterSubdivision` | string | `'quarter'` | `drummate_multimeter_subdivision` |
| `multiMeterSlots` | `{ id, beats, noteValue }[]` | `[]` | `drummate_multimeter_slots` |
| `multiMeterPlayingSlot` | number | `-1` | — (runtime only) |

`multiMeterSlots` is persisted as JSON. Each slot: `{ id: number, beats: number, noteValue: number }` (e.g., `{ id: 3, beats: 5, noteValue: 4 }` for 5/4). A `useRef` inside `MultiMeterPage.jsx` tracks the next ID, initialized on mount from `Math.max(0, ...slots.map(s => s.id)) + 1` to survive localStorage rehydration without collisions.

`metronomeCurrentBeat` (existing in App.jsx, driven by `engineRef.current.onBeat`) is reused to light up the beat indicator — no new state needed for the current beat.

### Engine callback addition

In the engine-initialization `useEffect`:
```js
metronomeEngineRef.current.onMeterSlot = (slotIndex) => {
  setMultiMeterPlayingSlot(slotIndex);
};
```

## Audio Engine Changes (`metronomeEngine.js`)

### New properties

| Property | Type | Description |
|----------|------|-------------|
| `meterTrack` | `number[] \| null` | Array of `beatsPerMeasure` values (one per slot); `null` = mode off |
| `meterTrackIndex` | `number` | Current slot index |
| `onMeterSlot` | `function \| null` | Callback: `(slotIndex) => void`, fired at each new bar's downbeat |

### New method

```js
setMeterTrack(track)
```
- If `track` is `null`, clears `meterTrack` and `meterTrackIndex`.
- If `track` is an array, sets `meterTrack = track`, `meterTrackIndex = 0`, and `beatsPerMeasure = track[0]`.

### Scheduler change

At bar boundaries (when `currentBeat` wraps back to 0, i.e., after the last beat of a bar is scheduled), if `meterTrack` is non-null:

1. Advance: `meterTrackIndex = (meterTrackIndex + 1) % meterTrack.length`
2. Update: `beatsPerMeasure = meterTrack[meterTrackIndex]`
3. Fire callback at playback time (same `setTimeout` pattern as `onBeat` / `onSequenceBeat`):
   ```js
   const delay = (scheduleTime - audioCtx.currentTime) * 1000;
   setTimeout(() => this.onMeterSlot?.(this.meterTrackIndex), delay);
   ```

### Play flow (in `MultiMeterPage`)

```js
engineRef.current.setSequence(null);           // ensure sequencer mode is off
engineRef.current.setMeterTrack(slots.map(s => s.beats));
engineRef.current.setSoundType(soundType);
engineRef.current.setSubdivision(subdivisionPattern);
engineRef.current.setBpm(bpm);
noSleepRef.current.enable();
await engineRef.current.start();
setMultiMeterPlayingSlot(0);
```

### Stop flow

```js
engineRef.current.stop();
engineRef.current.setMeterTrack(null);
setMultiMeterPlayingSlot(-1);
noSleepRef.current.disable();
```
(`metronomeCurrentBeat` is reset to `-1` via the existing `handleSubpageChange` stop path.)

## Slot Management

- **Add:** tap a curated time signature button → appends (or inserts at selected position if in edit mode with a selection, same UX as sequencer)
- **Delete:** edit mode × badge on each card
- **Reorder:** `@dnd-kit/sortable` drag handle in edit mode (one `DndContext` + `SortableContext`, same as sequencer)
- **Max slots:** 16 (same cap as sequencer)

Slots are persisted to localStorage on every change via a `useEffect` in `MultiMeterPage` (or in `App.jsx` alongside the other localStorage effects).

## Internationalization

New keys in `LanguageContext.jsx` for both `en` and `zh`:

| Key | EN | ZH |
|-----|----|----|
| `metronomeSubpages.multiMeter` | `"Multi-Meter"` | `"多拍号"` |
| `multiMeter.emptyState` | `"Tap a time signature below to add bars"` | `"点击下方拍号以添加小节"` |
| `multiMeter.tapToAdd` | `"Tap to add a bar"` | `"点击添加小节"` |

## Keyboard Shortcuts

Inside `MultiMeterPage`:
- Space: play/stop
- ←/→: BPM ±1

No new global shortcuts.

## Testing Checklist (post-implementation)

- [ ] `npm run build` succeeds.
- [ ] Multi-Meter tab appears; Tab / Shift+Tab cycles through all four metronome subpages.
- [ ] Add, delete, reorder slots — changes reflected immediately.
- [ ] Slots persist across page refreshes.
- [ ] Playing cycles through bars, each bar getting its correct beat count.
- [ ] Beat indicator shows the right number of circles for the currently playing bar.
- [ ] Slot highlight advances on each bar boundary.
- [ ] Sound type and subdivision changes take effect immediately (same as metronome).
- [ ] Switching subpage or app tab while playing stops audio correctly.
- [ ] Disabled play button when no slots exist.
- [ ] Both EN and ZH strings render correctly.
- [ ] Max 16 slots enforced.
