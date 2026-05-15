# Multi-Meter Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "Multi-Meter" subpage to the Metronome tab where users build a sequence of bars, each with its own time signature from a curated list, that loops continuously at a shared BPM/sound/subdivision.

**Architecture:** A new `MultiMeterPage.jsx` component (mirrored on `SequencerPage.jsx`) owns the slot grid and controls. `MetronomeEngine` gains a `meterTrack` mode that cycles `beatsPerMeasure` bar-by-bar and fires `onMeterSlot` callbacks for UI highlighting. All new state lives in `App.jsx` and persists to `localStorage`.

**Tech Stack:** React 19, Tailwind CSS v4, `@dnd-kit/sortable`, Web Audio API (`MetronomeEngine` extension)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/contexts/LanguageContext.jsx` | Add 3 multi-meter translation keys (EN + ZH) |
| Modify | `src/audio/metronomeEngine.js` | Add `meterTrack` properties, `setMeterTrack()`, bar-boundary hook in `_advanceBeat`, reset in `start()` |
| Modify | `src/App.jsx` | New state vars, localStorage effects, `onMeterSlot` callback, `handleSubpageChange` cleanup, Tab cycle, subpage button, render `<MultiMeterPage>` |
| Create | `src/components/MultiMeterPage.jsx` | Full new component |

---

## Task 1: i18n — Add multi-meter translation keys [model: Haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add English keys**

In `LanguageContext.jsx`, find the `metronomeSubpages` object in the English (`en`) locale (around line 84) and add the `multiMeter` key. Also add a `multiMeter` section after `practiceMode`:

```js
// In the en locale — inside metronomeSubpages:
metronomeSubpages: {
  metronome: 'Metronome',
  sequencer: 'Sequencer',
  practice: 'Practice',
  multiMeter: 'Multi-Meter',    // ADD THIS LINE
},
// After practiceMode block, add:
multiMeter: {
  emptyState: 'Tap a time signature below to add bars',
  tapToAdd: 'Tap to add a bar',
},
```

- [ ] **Step 2: Add Chinese keys**

Find the `metronomeSubpages` object in the `zh` locale (around line 377) and mirror the same additions:

```js
// In the zh locale — inside metronomeSubpages:
metronomeSubpages: {
  metronome: '节拍器',
  sequencer: '复杂节奏',
  practice: '练习',
  multiMeter: '多拍号',    // ADD THIS LINE
},
// After the zh practiceMode block, add:
multiMeter: {
  emptyState: '点击下方拍号以添加小节',
  tapToAdd: '点击添加小节',
},
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add i18n keys for multi-meter mode

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Engine — Add meterTrack properties and setMeterTrack() [model: Sonnet]

**Files:**
- Modify: `src/audio/metronomeEngine.js`

- [ ] **Step 1: Add properties to constructor**

In `MetronomeEngine`'s constructor, after the `this._oneShotAccent = false;` line (around line 38), add:

```js
// Meter track mode: cycles beatsPerMeasure bar-by-bar through a slot list.
// null = mode off.
this.meterTrack = null;
this.meterTrackIndex = 0;
this.onMeterSlot = null;
```

- [ ] **Step 2: Add setMeterTrack() method**

After the `setSoundType` method (around line 436), add:

```js
/**
 * Enable meter-track mode.
 * @param {number[]|null} track - Array of beatsPerMeasure values, one per bar slot.
 *   Pass null to return to normal (fixed beatsPerMeasure) mode.
 */
setMeterTrack(track) {
  if (!track) {
    this.meterTrack = null;
    this.meterTrackIndex = 0;
    return;
  }
  this.meterTrack = track;
  this.meterTrackIndex = 0;
  this.beatsPerMeasure = track[0];
}
```

- [ ] **Step 3: Reset meter track in start()**

In `start()`, after the existing sequencePatterns reset block (around line 327):

```js
// After the sequencePatterns if-block, add:
// Reset meter track to first slot on each start
if (this.meterTrack && this.meterTrack.length > 0) {
  this.meterTrackIndex = 0;
  this.beatsPerMeasure = this.meterTrack[0];
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/audio/metronomeEngine.js
git commit -m "feat(engine): add meterTrack mode with setMeterTrack() and start() reset

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Engine — Wire bar-boundary meter advance in _advanceBeat() [model: Sonnet]

**Files:**
- Modify: `src/audio/metronomeEngine.js`

- [ ] **Step 1: Add bar-boundary hook in _advanceBeat()**

In `_advanceBeat()`, find the `if (this.sequencePatterns && ...)` block (around line 551). Directly after the closing `}` of that block (before the outer `} else {`), add:

```js
// Meter track mode: at bar boundary (currentBeat just wrapped to 0),
// advance to the next slot's beatsPerMeasure and fire onMeterSlot callback.
if (this.currentBeat === 0 && this.meterTrack && this.meterTrack.length > 0) {
  this.meterTrackIndex = (this.meterTrackIndex + 1) % this.meterTrack.length;
  this.beatsPerMeasure = this.meterTrack[this.meterTrackIndex];
  if (!this.audioCtx) return;
  const slotIdx = this.meterTrackIndex;
  const delay = Math.max(0, (this.nextNoteTime - this.audioCtx.currentTime) * 1000);
  setTimeout(() => {
    this.onMeterSlot?.(slotIdx);
  }, delay);
}
```

The check `this.currentBeat === 0` is safe because `currentBeat` only becomes 0 inside the `subdivisionIndex >= pattern.length` branch (i.e., at beat wrap-around), never on the very first call from `start()`.

- [ ] **Step 2: Verify build and lint**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build && npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/audio/metronomeEngine.js
git commit -m "feat(engine): advance meter track slot at bar boundaries in _advanceBeat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: App.jsx — Add multi-meter state, localStorage effects, onMeterSlot callback [model: Sonnet]

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import MultiMeterPage**

At the top of `App.jsx`, after the `PracticePage` import (line 11), add:

```js
import MultiMeterPage from './components/MultiMeterPage';
```

- [ ] **Step 2: Add multi-meter state variables**

After the `sequencerNextIdRef` block (around line 233), add:

```js
// Multi-Meter state (persists across tab changes and page reloads)
const [multiMeterBpm, setMultiMeterBpm] = useState(() => {
  try {
    const saved = localStorage.getItem('drummate_multimeter_bpm');
    const bpm = saved ? Number(saved) : 120;
    return bpm >= 30 && bpm <= 300 ? bpm : 120;
  } catch {
    return 120;
  }
});
const [multiMeterSoundType, setMultiMeterSoundType] = useState(() => {
  try {
    const saved = localStorage.getItem('drummate_multimeter_sound_type');
    const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
    return saved && validTypes.includes(saved) ? saved : 'click';
  } catch {
    return 'click';
  }
});
const [multiMeterSubdivision, setMultiMeterSubdivision] = useState(() => {
  try {
    const saved = localStorage.getItem('drummate_multimeter_subdivision');
    const validSubdivisions = ['quarter', 'eighth', 'triplet', 'sixteenth',
                                'eighthTwoSixteenths', 'twoSixteenthsEighth',
                                'sixteenthEighthSixteenth', 'quintuplet', 'sextuplet', 'offbeatSixteenths'];
    return saved && validSubdivisions.includes(saved) ? saved : 'quarter';
  } catch {
    return 'quarter';
  }
});
const [multiMeterSlots, setMultiMeterSlots] = useState(() => {
  try {
    const saved = localStorage.getItem('drummate_multimeter_slots');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
});
const [multiMeterPlayingSlot, setMultiMeterPlayingSlot] = useState(-1);
```

- [ ] **Step 3: Add localStorage persistence effects**

After the existing `useEffect` that saves `metronomeAccentFirstBeat` (around line 253), add four new effects:

```js
useEffect(() => {
  localStorage.setItem('drummate_multimeter_bpm', String(multiMeterBpm));
}, [multiMeterBpm]);
useEffect(() => {
  localStorage.setItem('drummate_multimeter_sound_type', multiMeterSoundType);
}, [multiMeterSoundType]);
useEffect(() => {
  localStorage.setItem('drummate_multimeter_subdivision', multiMeterSubdivision);
}, [multiMeterSubdivision]);
useEffect(() => {
  localStorage.setItem('drummate_multimeter_slots', JSON.stringify(multiMeterSlots));
}, [multiMeterSlots]);
```

- [ ] **Step 4: Wire onMeterSlot callback in engine init useEffect**

In the engine initialization `useEffect` (around line 383), after the existing `onSequenceBeat` assignment, add:

```js
metronomeEngineRef.current.onMeterSlot = (slotIndex) => {
  setMultiMeterPlayingSlot(slotIndex);
};
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build
```

Expected: build succeeds (MultiMeterPage import will fail until Task 6, so this step must be run after Task 6 completes — see note below).

> **Note:** The import added in Step 1 will cause a build error until `MultiMeterPage.jsx` is created in Task 6. If running tasks strictly in order, skip the build check here and run it after Task 6. Alternatively, create a stub file first:
> ```bash
> echo "export default function MultiMeterPage() { return null; }" \
>   > /Users/harlen/Desktop/myCODE/Drummate/src/components/MultiMeterPage.jsx
> ```
> Then run `npm run build` to verify the rest of the changes, and overwrite the stub in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add multi-meter state, localStorage effects, and onMeterSlot wiring in App.jsx

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: App.jsx — handleSubpageChange, Tab cycle, subpage button, render [model: Sonnet]

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update handleSubpageChange**

Replace the existing `handleSubpageChange` (around line 865) with:

```js
const handleSubpageChange = useCallback(
  (subpage) => {
    if (metronomeIsPlaying) {
      metronomeEngineRef.current.stop();
      metronomeEngineRef.current.setSequence(null);
      metronomeEngineRef.current.setMeterTrack(null);
      setMetronomeIsPlaying(false);
      setMetronomeCurrentBeat(-1);
      setSequencerPlayingSlot(-1);
      setMultiMeterPlayingSlot(-1);
      noSleepRef.current.disable();
    }
    if (runningPracticeUid) {
      if (metronomeEngineRef.current?.isPlaying) {
        metronomeEngineRef.current.stop();
      }
      if (metronomeEngineRef.current) {
        // Re-wire the App-level beat callback (practice mode overrides it)
        metronomeEngineRef.current.onBeat = ({ beat, subdivisionIndex }) => {
          if (subdivisionIndex === 0) setMetronomeCurrentBeat(beat);
        };
      }
      noSleepRef.current?.disable?.();
      setRunningPracticeUid(null);
      setPracticeRunStepIndex(0);
      setPracticeRunBarIndex(0);
      setPracticeRunIsPlaying(false);
      setPracticeRunComplete(false);
    }
    setMetronomeSubpage(subpage);
  },
  [metronomeIsPlaying, runningPracticeUid],
);
```

- [ ] **Step 2: Update Tab/Shift+Tab cycle to include multiMeter**

In the global keyboard shortcut `useEffect` (around line 1312), find:

```js
const pages = ['metronome', 'sequencer', 'practice'];
```

Replace with:

```js
const pages = ['metronome', 'sequencer', 'practice', 'multiMeter'];
```

- [ ] **Step 3: Add Multi-Meter subpage toggle button**

In the subpage toggle `<div>` (around line 1427), find the closing `</div>` after the Practice button and add a fourth button before it:

```jsx
<button
  onClick={() => handleSubpageChange('multiMeter')}
  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
    metronomeSubpage === 'multiMeter'
      ? 'bg-white text-gray-800 shadow-sm'
      : 'text-gray-500'
  }`}
>
  {t('metronomeSubpages.multiMeter')}
</button>
```

- [ ] **Step 4: Render MultiMeterPage in the subpage conditional**

Find the existing ternary chain (around line 1460):

```jsx
{metronomeSubpage === 'metronome' ? (
  <Metronome ... />
) : metronomeSubpage === 'sequencer' ? (
  <SequencerPage ... />
) : (
  <PracticePage ... />
)}
```

Replace with:

```jsx
{metronomeSubpage === 'metronome' ? (
  <Metronome
    engineRef={metronomeEngineRef}
    noSleepRef={noSleepRef}
    bpm={metronomeBpm}
    setBpm={setMetronomeBpm}
    isPlaying={metronomeIsPlaying}
    setIsPlaying={setMetronomeIsPlaying}
    currentBeat={metronomeCurrentBeat}
    setCurrentBeat={setMetronomeCurrentBeat}
    timeSignature={metronomeTimeSignature}
    setTimeSignature={setMetronomeTimeSignature}
    subdivision={metronomeSubdivision}
    setSubdivision={setMetronomeSubdivision}
    soundType={metronomeSoundType}
    setSoundType={setMetronomeSoundType}
    accentFirstBeat={metronomeAccentFirstBeat}
    setAccentFirstBeat={setMetronomeAccentFirstBeat}
  />
) : metronomeSubpage === 'sequencer' ? (
  <SequencerPage
    engineRef={metronomeEngineRef}
    noSleepRef={noSleepRef}
    bpm={sequencerBpm}
    setBpm={setSequencerBpm}
    isPlaying={metronomeIsPlaying}
    setIsPlaying={setMetronomeIsPlaying}
    soundType={sequencerSoundType}
    setSoundType={setSequencerSoundType}
    slots={sequencerSlots}
    setSlots={setSequencerSlots}
    playingSlot={sequencerPlayingSlot}
    setPlayingSlot={setSequencerPlayingSlot}
    nextIdRef={sequencerNextIdRef}
  />
) : metronomeSubpage === 'multiMeter' ? (
  <MultiMeterPage
    engineRef={metronomeEngineRef}
    noSleepRef={noSleepRef}
    bpm={multiMeterBpm}
    setBpm={setMultiMeterBpm}
    isPlaying={metronomeIsPlaying}
    setIsPlaying={setMetronomeIsPlaying}
    soundType={multiMeterSoundType}
    setSoundType={setMultiMeterSoundType}
    subdivision={multiMeterSubdivision}
    setSubdivision={setMultiMeterSubdivision}
    slots={multiMeterSlots}
    setSlots={setMultiMeterSlots}
    playingSlot={multiMeterPlayingSlot}
    setPlayingSlot={setMultiMeterPlayingSlot}
    currentBeat={metronomeCurrentBeat}
    setCurrentBeat={setMetronomeCurrentBeat}
  />
) : (
  <PracticePage
    practices={metronomePractices}
    runningPracticeUid={runningPracticeUid}
    engineRef={metronomeEngineRef}
    noSleepRef={noSleepRef}
    onAddPractice={handleAddPractice}
    onUpdatePractice={handleUpdatePractice}
    onDeletePractice={handleDeletePractice}
    onReorderPractices={handleReorderPractices}
    onStartPractice={handleStartPractice}
    onEndPractice={handleEndPractice}
    runStepIndex={practiceRunStepIndex}
    runBarIndex={practiceRunBarIndex}
    runIsPlaying={practiceRunIsPlaying}
    runComplete={practiceRunComplete}
    setRunStepIndex={setPracticeRunStepIndex}
    setRunBarIndex={setPracticeRunBarIndex}
    setRunIsPlaying={setPracticeRunIsPlaying}
    setRunComplete={setPracticeRunComplete}
  />
)}
```

- [ ] **Step 5: Verify build and lint**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build && npm run lint
```

Expected: both pass (requires MultiMeterPage.jsx stub or final file from Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire MultiMeterPage into App.jsx subpage system

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Create MultiMeterPage.jsx [model: Sonnet]

**Files:**
- Create: `src/components/MultiMeterPage.jsx`

- [ ] **Step 1: Create the file**

Create `src/components/MultiMeterPage.jsx` with the following content:

```jsx
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import BpmDial from './BpmDial';
import BeatIndicator from './BeatIndicator';
import SubdivisionIcon from './SubdivisionIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const MAX_SLOTS = 16;
const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

const METER_OPTIONS = [
  { beats: 2, noteValue: 4 },
  { beats: 3, noteValue: 4 },
  { beats: 4, noteValue: 4 },
  { beats: 5, noteValue: 4 },
  { beats: 6, noteValue: 4 },
  { beats: 7, noteValue: 4 },
  { beats: 3, noteValue: 8 },
  { beats: 6, noteValue: 8 },
  { beats: 7, noteValue: 8 },
  { beats: 9, noteValue: 8 },
  { beats: 11, noteValue: 8 },
  { beats: 12, noteValue: 8 },
];

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="absolute top-0.5 left-0.5 p-0.5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    </button>
  );
}

function SortableSlot({ slot, index, isSelected, editing, isPlaying, playingSlot, onDelete, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: slot.id });
  const isCurrentlyPlaying = isPlaying && index === playingSlot;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={editing ? () => onSelect(index) : undefined}
      className={`
        relative flex flex-col items-center justify-center
        p-3 rounded-xl border-2
        transition-all duration-150
        ${isCurrentlyPlaying
          ? 'border-blue-500 bg-blue-50 scale-105 shadow-md'
          : isSelected
            ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300'
            : 'border-gray-200 bg-white'
        }
        ${editing ? 'cursor-pointer' : ''}
      `}
    >
      {editing && (
        <DragHandle listeners={listeners} attributes={attributes} />
      )}

      <span className={`text-[10px] font-bold mb-0.5 ${
        isCurrentlyPlaying ? 'text-blue-600' : 'text-gray-400'
      }`}>
        {index + 1}
      </span>

      <span className={`text-sm font-semibold ${
        isCurrentlyPlaying ? 'text-blue-700' : 'text-gray-700'
      }`}>
        {slot.beats}/{slot.noteValue}
      </span>

      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(index); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500
            text-white rounded-full flex items-center justify-center
            text-xs font-bold shadow-sm hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}

function MultiMeterPage({
  engineRef,
  noSleepRef,
  bpm,
  setBpm,
  isPlaying,
  setIsPlaying,
  soundType,
  setSoundType,
  subdivision,
  setSubdivision,
  slots,
  setSlots,
  playingSlot,
  setPlayingSlot,
  currentBeat,
  setCurrentBeat,
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);

  const nextIdRef = useRef(null);
  if (nextIdRef.current === null) {
    nextIdRef.current = Math.max(0, ...slots.map(s => s.id)) + 1;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    if (engineRef.current) engineRef.current.setBpm(bpm);
  }, [engineRef, bpm]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setSoundType(soundType);
  }, [engineRef, soundType]);

  useEffect(() => {
    if (engineRef.current) {
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
    }
  }, [engineRef, subdivision]);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      engineRef.current.stop();
      engineRef.current.setMeterTrack(null);
      setIsPlaying(false);
      setPlayingSlot(-1);
      setCurrentBeat(-1);
      noSleepRef.current.disable();
    } else {
      if (slots.length === 0) return;
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSequence(null);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
      engineRef.current.setSoundType(soundType);
      engineRef.current.setBpm(bpm);
      engineRef.current.setMeterTrack(slots.map(s => s.beats));
      noSleepRef.current.enable();
      await engineRef.current.start();
      setIsPlaying(true);
      setPlayingSlot(0);
    }
  }, [engineRef, isPlaying, setIsPlaying, setPlayingSlot, setCurrentBeat,
      noSleepRef, slots, subdivision, soundType, bpm]);

  const handleAddSlot = useCallback((beats, noteValue) => {
    if (slots.length >= MAX_SLOTS) return;
    const newSlot = { id: nextIdRef.current++, beats, noteValue };
    if (editing && selectedSlotIndex !== null) {
      const newSlots = [...slots];
      newSlots.splice(selectedSlotIndex + 1, 0, newSlot);
      setSlots(newSlots);
      setSelectedSlotIndex(selectedSlotIndex + 1);
    } else {
      setSlots([...slots, newSlot]);
    }
  }, [slots, setSlots, editing, selectedSlotIndex]);

  const handleDeleteSlot = useCallback((index) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSlots(newSlots);
    if (selectedSlotIndex !== null) {
      if (index === selectedSlotIndex) setSelectedSlotIndex(null);
      else if (index < selectedSlotIndex) setSelectedSlotIndex(selectedSlotIndex - 1);
    }
    if (isPlaying && engineRef.current) {
      if (newSlots.length === 0) {
        engineRef.current.stop();
        engineRef.current.setMeterTrack(null);
        setIsPlaying(false);
        setPlayingSlot(-1);
        setCurrentBeat(-1);
        noSleepRef.current.disable();
      } else {
        engineRef.current.setMeterTrack(newSlots.map(s => s.beats));
      }
    }
  }, [slots, setSlots, isPlaying, engineRef, setIsPlaying, setPlayingSlot, setCurrentBeat,
      noSleepRef, selectedSlotIndex]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex(s => s.id === active.id);
    const newIndex = slots.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newSlots = [...slots];
    const [moved] = newSlots.splice(oldIndex, 1);
    newSlots.splice(newIndex, 0, moved);
    setSlots(newSlots);
    if (selectedSlotIndex !== null) {
      if (selectedSlotIndex === oldIndex) setSelectedSlotIndex(newIndex);
      else if (oldIndex < selectedSlotIndex && newIndex >= selectedSlotIndex)
        setSelectedSlotIndex(selectedSlotIndex - 1);
      else if (oldIndex > selectedSlotIndex && newIndex <= selectedSlotIndex)
        setSelectedSlotIndex(selectedSlotIndex + 1);
    }
  }, [slots, setSlots, selectedSlotIndex]);

  const handleSelectSlot = useCallback((index) => {
    setSelectedSlotIndex(prev => prev === index ? null : index);
  }, []);

  const handleExitEditing = useCallback(() => {
    setEditing(false);
    setSelectedSlotIndex(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); handleTogglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); setBpm(prev => Math.max(30, prev - 1)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); setBpm(prev => Math.min(300, prev + 1)); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, setBpm]);

  const activeBeats = (playingSlot >= 0 && playingSlot < slots.length)
    ? slots[playingSlot].beats
    : 4;

  const slotGrid = (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((slot, index) => (
        <SortableSlot
          key={slot.id}
          slot={slot}
          index={index}
          isSelected={editing && selectedSlotIndex === index}
          editing={editing}
          isPlaying={isPlaying}
          playingSlot={playingSlot}
          onDelete={handleDeleteSlot}
          onSelect={handleSelectSlot}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-5">

      {/* Beat indicator */}
      <BeatIndicator beats={activeBeats} currentBeat={currentBeat} isPlaying={isPlaying} />

      {/* Slot grid */}
      <div className="w-full">
        {slots.length === 0 ? (
          editing ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {t('multiMeter.emptyState')}
            </div>
          ) : null
        ) : editing ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slots.map(s => s.id)} strategy={rectSortingStrategy}>
              {slotGrid}
            </SortableContext>
          </DndContext>
        ) : (
          slotGrid
        )}
      </div>

      {/* Edit mode: time signature picker */}
      {editing && (
        <>
          <p className="text-xs text-gray-500 text-center">
            {t('multiMeter.tapToAdd')}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {METER_OPTIONS.map(({ beats, noteValue }) => (
              <button
                key={`${beats}/${noteValue}`}
                onClick={() => handleAddSlot(beats, noteValue)}
                disabled={slots.length >= MAX_SLOTS}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  slots.length >= MAX_SLOTS
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-blue-50 hover:border-blue-400'
                }`}
              >
                {beats}/{noteValue}
                {slots.length < MAX_SLOTS && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white
                    rounded-full flex items-center justify-center text-[10px] font-bold">
                    +
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Sound type selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SOUND_TYPES.map((key) => (
          <button
            key={key}
            onClick={() => setSoundType(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              soundType === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {t(`soundTypes.${key}`)}
          </button>
        ))}
      </div>

      {/* Subdivision selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SUBDIVISIONS.filter(({ key }) => key !== 'rest').map(({ key }) => (
          <button
            key={key}
            onClick={() => setSubdivision(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              subdivision === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            <SubdivisionIcon type={key} />
          </button>
        ))}
      </div>

      {/* BPM dial */}
      <BpmDial bpm={bpm} onBpmChange={setBpm} />

      {/* Play/Stop button */}
      <button
        onClick={handleTogglePlay}
        disabled={slots.length === 0}
        className={`w-16 h-16 rounded-full flex items-center justify-center
          transition-colors shadow-md ${
            slots.length === 0
              ? 'bg-gray-300 cursor-not-allowed'
              : isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
      >
        {isPlaying ? (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Edit / Done button */}
      {!isPlaying && (
        editing ? (
          <button
            onClick={handleExitEditing}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            {t('done')}
          </button>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('edit')}
          </button>
        )
      )}
    </div>
  );
}

export default MultiMeterPage;
```

- [ ] **Step 2: Verify build and lint**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build && npm run lint
```

Expected: both pass with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MultiMeterPage.jsx
git commit -m "feat: add MultiMeterPage component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Manual verification checklist [model: Sonnet]

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run dev
```

Open `http://localhost:5173` in a browser.

- [ ] **Step 2: Tab appears and subpage toggle works**

- Navigate to the Metronome tab (keyboard: `2`).
- Confirm four buttons appear: Metronome | Sequencer | Practice | Multi-Meter.
- Click Multi-Meter — confirm the page renders without errors.
- Press `Tab` repeatedly — confirm it cycles through all four subpages.
- Press `Shift+Tab` — confirm reverse cycle.

- [ ] **Step 3: Add slots and play**

- Click Edit, then tap several time signature buttons (e.g., 4/4, 3/4, 7/8, 5/4).
- Click Done.
- Click Play — confirm the metronome starts.
- Confirm the beat indicator shows the correct number of circles for the active bar (4 for 4/4, 3 for 3/4, etc.).
- Confirm the active slot card is highlighted as the sequence cycles.
- Confirm the sequence loops back to slot 1 after the last slot.
- Click Stop — confirm all highlighting clears.

- [ ] **Step 4: Sound type and subdivision changes**

- With slots added, change the sound type — confirm the sound changes on the next click.
- Change the subdivision — confirm the number of subdivisions per beat changes.
- Confirm both settings persist after a page refresh.

- [ ] **Step 5: BPM controls**

- Use the BPM dial to change tempo — confirm it takes effect immediately.
- With Multi-Meter playing, press `←` and `→` — confirm BPM changes by 1.
- Confirm BPM persists after a page refresh.

- [ ] **Step 6: Edit mode while playing**

- Start playback.
- Confirm the Edit button is hidden while playing.
- Stop playback, click Edit.
- Delete a slot — confirm the sequence updates immediately.
- Confirm max 16 slots is enforced (add 16 slots; + badges disappear; tapping adds nothing).

- [ ] **Step 7: Drag to reorder**

- In edit mode, drag a slot to a new position.
- Click Done, press Play — confirm the new order plays correctly.

- [ ] **Step 8: Switching subpages stops audio**

- Start playback on Multi-Meter.
- Switch to Metronome subpage — confirm audio stops, beat indicator clears.
- Switch back to Multi-Meter — confirm the slot highlight is cleared.

- [ ] **Step 9: Slots persist across refresh**

- Add slots, stop playing.
- Refresh the page, navigate to Multi-Meter.
- Confirm slots are restored.

- [ ] **Step 10: Final build**

```bash
cd /Users/harlen/Desktop/myCODE/Drummate && npm run build
```

Expected: zero errors or warnings.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat: complete Multi-Meter mode implementation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
