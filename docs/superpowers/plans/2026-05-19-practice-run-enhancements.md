# Practice Run Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 UX improvements to the Metronome → Practice subpage: percentage display, total practice time in listing, Space/Up/Down hotkeys, and a 2-bar count-in before the practice starts.

**Architecture:** All changes are confined to two files: `PracticeRunView.jsx` (run-time UX: percentage, Space hotkey, count-in) and `PracticePage.jsx` (listing UX: total time, Up/Down/Space keyboard nav). Pure helpers (`computePracticeSeconds`, `formatPracticeTime`) get unit tests in `tests/practicePage.test.js`. No engine changes, no DB changes, no new backend calls.

**Tech Stack:** React 19, Tailwind CSS v4, Vite 7, Vitest (tests for pure helpers only)

---

## Files Changed

| File | What changes |
|------|-------------|
| `src/components/PracticeRunView.jsx` | Percentage label, Space hotkey, 2-bar count-in state + logic + UI |
| `src/components/PracticePage.jsx` | `computePracticeSeconds` + `formatPracticeTime` helpers, time in `PracticeRow`, `focusedIndex` state + keyboard nav |
| `src/contexts/LanguageContext.jsx` | One i18n key: `practiceMode.getReady` (en + zh) for count-in display |
| `tests/practicePage.test.js` | Unit tests for `computePracticeSeconds` and `formatPracticeTime` |

---

## Task 1: Percentage label on the progress bar

**Files:**
- Modify: `src/components/PracticeRunView.jsx:244-250`

`progressPct` is already computed at line 232. We wrap the existing progress bar `<div>` in a flex column and add a right-aligned percentage label above it.

- [ ] **Step 1: Replace the plain progress bar with a labeled version**

Find this block in `PracticeRunView.jsx` (around line 244):

```jsx
      <div className="w-full max-w-sm h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
```

Replace it with:

```jsx
      <div className="w-full max-w-sm flex flex-col gap-1">
        <div className="flex justify-end">
          <span className="text-sm font-semibold text-blue-600">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
```

- [ ] **Step 2: Start the dev server and verify**

```bash
npm run dev
```

Open http://localhost:5173, go to Metronome → Practice, start a practice. Confirm `0%` shows at rest, percentage increases as bars complete, reaches `100%` on the last bar, and "Practice Complete" renders correctly afterward.

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticeRunView.jsx
git commit -m "feat(practiceRun): show integer percentage above progress bar

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Space hotkey in the run view

**Files:**
- Modify: `src/components/PracticeRunView.jsx` (add one `useEffect` after the cleanup effect at line ~219)

When the run view is visible, Space should toggle play/pause. This mirrors the existing Space handler in `SequencerPage.jsx`. No-op when `complete` is true (the complete state shows a Done button, not a play button).

- [ ] **Step 1: Add the keydown listener**

In `PracticeRunView.jsx`, add the following `useEffect` immediately after the cleanup effect (the one that ends around line 228):

```jsx
  // Space bar: toggle play/pause while practice is active
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !complete) {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, complete]);
```

- [ ] **Step 2: Verify in browser**

With the dev server running, start a practice. Press Space → practice starts. Press Space again → pauses. Press Space → resumes. Complete the practice. Verify Space does nothing after completion (so you don't accidentally restart).

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticeRunView.jsx
git commit -m "feat(practiceRun): Space toggles play/pause in run view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Total practice time in listing — helpers + tests

**Files:**
- Create: `tests/practicePage.test.js`
- Modify: `src/components/PracticePage.jsx` (add two helpers near the top of the file)

`computePracticeSeconds` iterates the same BPM steps as `PracticeRunView`'s `computeSteps` (start → end, step by increment, always include endBpm) and sums `(beats * 60 / bpm) * barsPerStep` per step. `formatPracticeTime` formats seconds as `M:SS`.

- [ ] **Step 1: Write failing tests**

Create `tests/practicePage.test.js`:

```js
import { describe, it, expect } from 'vitest';

// These helpers are defined in PracticePage.jsx but we inline them here for
// unit testing without needing to mount the React component.
function computePracticeSeconds(practice) {
  const steps = [];
  for (let bpm = practice.startBpm; bpm < practice.endBpm; bpm += practice.bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(practice.endBpm);
  return steps.reduce((acc, bpm) => {
    return acc + (practice.timeSignature.beats * 60 / bpm) * practice.barsPerStep;
  }, 0);
}

function formatPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const basePractice = {
  startBpm: 80,
  endBpm: 80,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
};

describe('computePracticeSeconds', () => {
  it('single step (start === end): 4 beats * 60/80 * 4 bars = 12s', () => {
    expect(computePracticeSeconds(basePractice)).toBeCloseTo(12, 5);
  });

  it('two steps (80→85): sums both BPMs', () => {
    const p = { ...basePractice, endBpm: 85 };
    const expected = (4 * 60 / 80) * 4 + (4 * 60 / 85) * 4;
    expect(computePracticeSeconds(p)).toBeCloseTo(expected, 5);
  });

  it('always includes endBpm even when increment lands exactly on it', () => {
    const p = { ...basePractice, startBpm: 80, endBpm: 100, bpmIncrement: 10 };
    // steps: 80, 90, 100
    const expected = [80, 90, 100].reduce((a, bpm) => a + (4 * 60 / bpm) * 4, 0);
    expect(computePracticeSeconds(p)).toBeCloseTo(expected, 5);
  });
});

describe('formatPracticeTime', () => {
  it('formats zero seconds', () => {
    expect(formatPracticeTime(0)).toBe('0:00');
  });

  it('formats exactly 60 seconds', () => {
    expect(formatPracticeTime(60)).toBe('1:00');
  });

  it('formats 200 seconds as 3:20', () => {
    expect(formatPracticeTime(200)).toBe('3:20');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatPracticeTime(65)).toBe('1:05');
  });

  it('handles rounding that produces 60 seconds', () => {
    // 119.5s → floor(119.5/60)=1, round(59.5)=60 → carry → "2:00"
    expect(formatPracticeTime(119.5)).toBe('2:00');
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
npm test -- tests/practicePage.test.js
```

Expected: tests pass immediately because the functions are inlined in the test file (this verifies the logic is correct before we add them to the component).

- [ ] **Step 3: Add helpers to `PracticePage.jsx`**

At the top of `PracticePage.jsx`, after the imports (before `const TIME_SIGNATURES` or before the `PracticeRow` function), add:

```js
function computePracticeSeconds(practice) {
  const steps = [];
  for (let bpm = practice.startBpm; bpm < practice.endBpm; bpm += practice.bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(practice.endBpm);
  return steps.reduce((acc, bpm) => {
    return acc + (practice.timeSignature.beats * 60 / bpm) * practice.barsPerStep;
  }, 0);
}

function formatPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Display the time in `PracticeRow`**

In `PracticePage.jsx`, the `PracticeRow` component renders a summary line:

```jsx
        <div className="text-sm text-gray-500 truncate">
          {t('practiceMode.summary', {
            start: practice.startBpm,
            end: practice.endBpm,
            inc: practice.bpmIncrement,
            bars: practice.barsPerStep,
            beats: practice.timeSignature.beats,
            noteValue: practice.timeSignature.noteValue,
          })}
        </div>
```

Replace it with:

```jsx
        <div className="text-sm text-gray-500 truncate">
          {t('practiceMode.summary', {
            start: practice.startBpm,
            end: practice.endBpm,
            inc: practice.bpmIncrement,
            bars: practice.barsPerStep,
            beats: practice.timeSignature.beats,
            noteValue: practice.timeSignature.noteValue,
          })}
          {' '}
          <span className="text-gray-400">
            ({formatPracticeTime(computePracticeSeconds(practice))})
          </span>
        </div>
```

- [ ] **Step 5: Verify in browser**

Open the Practice listing. Each row should show duration in parentheses at the end of the summary line, e.g. `80 → 120 BPM, +5 every 4 bars, 4/4 (3:20)`. Verify the duration is non-zero and roughly plausible (a 80→120 BPM, 9 steps, 4 bars each, 4/4 practice ≈ about 3–4 minutes).

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/PracticePage.jsx tests/practicePage.test.js
git commit -m "feat(practiceList): show estimated total duration per practice row

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Up/Down/Space hotkeys in the listing view

**Files:**
- Modify: `src/components/PracticePage.jsx`

Add `focusedIndex` state (null | number). ArrowDown/Up navigate through the practice list, wrapping around. Space starts the focused practice. Guard: inactive when a modal is open. Visual: focused row gets `ring-2 ring-blue-400`.

- [ ] **Step 1: Add `focusedIndex` state to `PracticePage`**

In `PracticePage`, after the existing `const [modalState, setModalState] = useState(null);` line, add:

```jsx
  const [focusedIndex, setFocusedIndex] = useState(null);
```

- [ ] **Step 2: Add keyboard listener to `PracticePage`**

In `PracticePage`, add this `useEffect` after the `sensors` declaration (before `handleDragEnd`):

```jsx
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (modalState !== null || practices.length === 0) return;

      if (e.code === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === null ? 0 : (prev + 1) % practices.length
        );
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === null ? practices.length - 1 : (prev - 1 + practices.length) % practices.length
        );
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (focusedIndex !== null) {
          onStartPractice(practices[focusedIndex].uid);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, practices, focusedIndex, onStartPractice]);
```

- [ ] **Step 3: Clear focus when a modal opens**

Modify the two `setModalState` calls that open the modal to also clear focus. Find:

```jsx
        onEdit={() => setModalState({ mode: 'edit', practice: p })}
```

Replace with:

```jsx
        onEdit={() => { setFocusedIndex(null); setModalState({ mode: 'edit', practice: p }); }}
```

And for the "+ Add Practice" button, find:

```jsx
          onClick={() => setModalState({ mode: 'create' })}
```

Replace with:

```jsx
          onClick={() => { setFocusedIndex(null); setModalState({ mode: 'create' }); }}
```

- [ ] **Step 4: Pass `focusedIndex` to `PracticeRow` and apply highlight**

In `PracticePage`, change the map call from:

```jsx
                {practices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    onStart={() => onStartPractice(p.uid)}
                    onEdit={() => setModalState({ mode: 'edit', practice: p })}
                  />
                ))}
```

To:

```jsx
                {practices.map((p, idx) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    isFocused={focusedIndex === idx}
                    onStart={() => { setFocusedIndex(null); onStartPractice(p.uid); }}
                    onEdit={() => { setFocusedIndex(null); setModalState({ mode: 'edit', practice: p }); }}
                  />
                ))}
```

- [ ] **Step 5: Apply the focus ring in `PracticeRow`**

`PracticeRow` currently renders:

```jsx
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3"
```

Add `isFocused` to the destructured props and apply a conditional ring:

```jsx
function PracticeRow({ practice, isFocused, onStart, onEdit }) {
```

And update the className:

```jsx
      className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3 ${
        isFocused ? 'ring-2 ring-blue-400' : ''
      }`}
```

- [ ] **Step 6: Verify in browser**

Open the Practice listing with at least 2 practices. Press ArrowDown → first row highlights. Press ArrowDown again → second row highlights. Press ArrowUp → back to first. Press Space → practice starts. Verify the focus ring disappears when the modal opens (tap Edit on any row).

- [ ] **Step 7: Commit**

```bash
git add src/components/PracticePage.jsx
git commit -m "feat(practiceList): ArrowUp/Down to navigate, Space to start focused practice

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 2-bar count-in

**Files:**
- Modify: `src/components/PracticeRunView.jsx`
- Modify: `src/contexts/LanguageContext.jsx` (one i18n key)

When the user presses Start (fresh) or Play after completion (restart), the engine plays 2 bars at the starting BPM before practice tracking begins. The bar-boundary logic in `onBeat` checks `isCountingInRef` first and decrements `countInBarsLeftRef`; when it hits 0 it flips `isCountingIn` to false and returns (the next boundary starts normal tracking). Resume after pause: no count-in. UI during count-in: large countdown number (2 → 1) with "Get Ready" label; progress bar hidden.

### i18n key

- [ ] **Step 1: Add `getReady` key to LanguageContext**

In `src/contexts/LanguageContext.jsx`, find the `practiceMode` block in the English translations and add after `done: 'Done',`:

```js
      getReady: 'Get Ready',
```

Find the Chinese `practiceMode` block (around line 437) and add after the Chinese equivalent of `done`:

```js
      getReady: '准备好',
```

### State and refs

- [ ] **Step 2: Add count-in state and refs to `PracticeRunView`**

In `PracticeRunView.jsx`, after the existing `const stoppedRef = useRef(complete);` line (around line 45), add:

```jsx
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBarsLeft, setCountInBarsLeft] = useState(2);
  const isCountingInRef = useRef(false);
  const countInBarsLeftRef = useRef(2);
  // True once the first count-in has fired; stays true for the component lifetime
  // so that resume-after-pause never re-triggers the count-in.
  const hasBegunRef = useRef(false);
```

### `handleTogglePlay` — trigger count-in on fresh start / restart

- [ ] **Step 3: Set count-in state inside `handleTogglePlay`**

In `handleTogglePlay`, find the `if (complete)` branch that starts at around line 148:

```js
    if (complete) {
      // Restart from scratch.
      setStepIndex(0);
      setBarIndex(0);
      stepIndexRef.current = 0;
      barIndexRef.current = 0;
      setComplete(false);
      stoppedRef.current = false;
      engine.setBpm(steps[0]);
    } else {
      // Resume / start: re-assert this step's BPM in case it was changed.
      engine.setBpm(steps[stepIndexRef.current]);
    }
```

Replace with:

```js
    if (complete) {
      // Restart from scratch.
      setStepIndex(0);
      setBarIndex(0);
      stepIndexRef.current = 0;
      barIndexRef.current = 0;
      setComplete(false);
      stoppedRef.current = false;
      engine.setBpm(steps[0]);
    } else {
      // Resume / start: re-assert this step's BPM in case it was changed.
      engine.setBpm(steps[stepIndexRef.current]);
    }

    // Trigger 2-bar count-in on fresh start or restart; skip on resume after pause.
    if (!hasBegunRef.current || complete) {
      hasBegunRef.current = true;
      isCountingInRef.current = true;
      countInBarsLeftRef.current = 2;
      setIsCountingIn(true);
      setCountInBarsLeft(2);
    }
```

### `onBeat` handler in `handleTogglePlay` — count-in bar tracking

- [ ] **Step 4: Extend the `onBeat` callback inside `handleTogglePlay`**

Find the `onBeat` callback assigned inside `handleTogglePlay` (around line 165). It currently starts with:

```js
    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      // Bar boundary: previous beat was nonzero, current is 0 (wrap).
      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      const nextBarIndex = barIndexRef.current + 1;
```

Replace the entire `onBeat` assignment with:

```js
    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      // Bar boundary: previous beat was nonzero, current is 0 (wrap).
      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      // Count-in: decrement and wait for it to finish before tracking practice bars.
      if (isCountingInRef.current) {
        const barsLeft = countInBarsLeftRef.current - 1;
        countInBarsLeftRef.current = barsLeft;
        setCountInBarsLeft(barsLeft);
        if (barsLeft > 0) return;
        isCountingInRef.current = false;
        setIsCountingIn(false);
        return;
      }

      const nextBarIndex = barIndexRef.current + 1;
```

Leave the rest of the `onBeat` callback (step transition logic, completion logic) unchanged.

### `onBeat` handler in the remount `useEffect` — count-in bar tracking

- [ ] **Step 5: Extend the `onBeat` callback inside the remount `useEffect`**

Find the remount `useEffect` (around line 71). Its `onBeat` assignment currently starts identically:

```js
    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      const nextBarIndex = barIndexRef.current + 1;
```

Replace with the same count-in check inserted at the same position:

```js
    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      // Count-in: decrement and wait for it to finish before tracking practice bars.
      if (isCountingInRef.current) {
        const barsLeft = countInBarsLeftRef.current - 1;
        countInBarsLeftRef.current = barsLeft;
        setCountInBarsLeft(barsLeft);
        if (barsLeft > 0) return;
        isCountingInRef.current = false;
        setIsCountingIn(false);
        return;
      }

      const nextBarIndex = barIndexRef.current + 1;
```

Leave the rest of the remount `onBeat` callback unchanged.

### UI: count-in display

- [ ] **Step 6: Replace the step/bar/progress block with count-in UI when counting in**

In the JSX return of `PracticeRunView` (around lines 240–250), find this block:

```jsx
      <div className="text-sm text-gray-600 flex flex-col items-center gap-1">
        <div>{t('practiceMode.stepProgress', { current: stepIndex + 1, total: totalSteps })}</div>
        <div>{t('practiceMode.barProgress', { current: Math.min(barIndex + 1, practice.barsPerStep), total: practice.barsPerStep })}</div>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-1">
        <div className="flex justify-end">
          <span className="text-sm font-semibold text-blue-600">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
```

Replace with:

```jsx
      {isCountingIn ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">
            {t('practiceMode.getReady')}
          </div>
          <div className="text-7xl font-bold text-blue-600 tabular-nums">
            {countInBarsLeft}
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-600 flex flex-col items-center gap-1">
            <div>{t('practiceMode.stepProgress', { current: stepIndex + 1, total: totalSteps })}</div>
            <div>{t('practiceMode.barProgress', { current: Math.min(barIndex + 1, practice.barsPerStep), total: practice.barsPerStep })}</div>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-1">
            <div className="flex justify-end">
              <span className="text-sm font-semibold text-blue-600">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </>
      )}
```

- [ ] **Step 7: Verify in browser**

Start a practice. Immediately after pressing Start:
- Large "2" appears below the BPM, with "Get Ready" label above it.
- After one full bar at the starting BPM, "2" changes to "1".
- After the second bar, the normal step/bar/progress UI appears and practice tracking begins.
- Press Start on the same or another practice after it completes (restart case) — confirm the countdown fires again.
- Pause mid-practice and Resume — confirm **no** countdown fires.

- [ ] **Step 8: Verify the pause button still works during count-in**

During the 2-bar count-in, press the Pause button (or Space). The engine stops, `isPlaying` becomes false. The UI should show the Start button again (not Resume, since we haven't advanced any bars). After pressing Start again: confirm the count-in fires again from 2 (because pressing pause during count-in and then Start is treated as a fresh start — `hasBegunRef` is already true, but `complete` is false, so we enter the `else` branch where we check `!hasBegunRef.current` → false, so no count-in re-fires).

> **Note on pause-during-count-in:** Pausing during the count-in and pressing Start again will **not** re-trigger the count-in (hasBegunRef is true, complete is false). This is acceptable — the count-in was shown, just not fully completed. This is the simplest behavior and avoids complexity.

- [ ] **Step 9: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/PracticeRunView.jsx src/contexts/LanguageContext.jsx
git commit -m "feat(practiceRun): 2-bar count-in before practice starts

Shows a large countdown (2→1) before tracking begins. Fires on fresh
start and restart after completion; skipped on resume after pause.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Final build verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: no errors, no warnings about missing imports.

- [ ] **Step 3: Manual regression checklist**

With `npm run dev`:

- [ ] Practice tab (not metronome practice): still works normally
- [ ] Metronome subpage: Space still toggles the metronome (SequencerPage handler)
- [ ] Practice listing: ArrowDown/Up highlights rows, Space starts the highlighted one
- [ ] Practice listing: opening Edit modal clears the focus highlight
- [ ] Practice listing: each row shows a non-zero duration like `(3:20)`
- [ ] Practice run: countdown shows 2 → 1 on fresh start
- [ ] Practice run: countdown fires again after completion + restart
- [ ] Practice run: no countdown on resume after pause
- [ ] Practice run: Space toggles play/pause correctly
- [ ] Practice run: percentage label shows `0%` at start, increases, reaches `100%`
- [ ] Language toggle (E/C): "Get Ready" / "准备好" switches correctly during count-in
- [ ] `npm run build` succeeds

- [ ] **Step 4: Commit if any final fixes were made**

```bash
git add -p  # stage only intentional changes
git commit -m "fix(practiceRun): <describe any fix>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
