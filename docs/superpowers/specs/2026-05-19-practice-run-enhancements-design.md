# Practice Run Enhancements Design

**Date:** 2026-05-19  
**Scope:** Four UX improvements to the Metronome → Practice subpage

---

## 1. 2-Bar Count-In

### What
When the user starts a fresh practice session (first Start press) or restarts after completion, the engine plays 2 bars at the starting BPM before practice tracking begins. Resuming after a pause does **not** trigger the count-in.

### How

All changes are confined to `PracticeRunView.jsx`. No engine changes required.

**State (local to PracticeRunView):**
- `isCountingIn` (boolean) — true during the 2-bar lead-in
- `countInBarsLeft` (integer, 2 or 1) — bars remaining in the count-in

**Logic in `handleTogglePlay`:**
- Fresh start (step 0, bar 0) or restart after complete → set `isCountingIn = true`, `countInBarsLeft = 2` before calling `engine.start()`
- Resume after pause → leave `isCountingIn = false` (no count-in)

**`onBeat` handler extension:**
The existing bar-boundary detection runs first. If `isCountingIn`:
- Decrement `countInBarsLeft`
- If `countInBarsLeft > 0` → stay in count-in, do not advance practice state
- If `countInBarsLeft === 0` → set `isCountingIn = false`, practice tracking begins from this point (next bar boundary advances `barIndex`)

**UI during count-in:**
- The step/bar/progress section is replaced by a centered "Get Ready" label and a large number showing `countInBarsLeft` (2 → 1)
- The progress bar stays at 0% and is hidden during count-in
- The pause button is still active (user can abort)

---

## 2. Percentage Display

### What
Show an integer percentage (e.g. `84%`) reflecting overall practice progress.

### How

`progressPct` is already computed in `PracticeRunView`:
```js
const progressPct = Math.min(100, (barsCompletedTotal / totalBars) * 100);
```

Add `{Math.round(progressPct)}%` as a right-aligned label on the same row as the progress bar. Display `0%` during count-in (count-in bars do not count toward progress).

---

## 3. Total Practice Time in Listing

### What
Each row in the practice listing (PracticePage) shows the estimated total duration of that practice, e.g. `(3:20)`.

### How

**Computation** (pure function, defined inside `PracticePage.jsx` or a shared util):

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

function formatPracticeTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s === 60 ? (m + 1) * 60 - totalSeconds : s).padStart(2, '0')}`;
  // simpler: clamp seconds and handle carry
}
```

Simpler formatting:
```js
function formatPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

**Display:** In `PracticeRow`, append the formatted time to the existing summary line, in parentheses: `{summary} · (3:20)`. No new i18n key needed since the format is locale-agnostic.

---

## 4. Keyboard Shortcuts

### Listing view (`PracticePage.jsx`)

**State:** `focusedIndex` (null | number) — tracks the keyboard-focused practice row.

**Behavior:**
- `ArrowDown` / `ArrowUp`: move focus down/up through the practice list; wraps around. If `focusedIndex` is null, first press sets it to 0 (ArrowDown) or last index (ArrowUp).
- `Space`: call `onStart` for the focused practice (identical to clicking its Start button). No-op if `focusedIndex` is null.
- Guard: listener is inactive when a modal is open (`modalState !== null`).
- Guard: skip if `e.target` is INPUT or TEXTAREA.

**Visual indicator:** The focused row gets a `ring-2 ring-blue-400` outline (same pattern used in SequencerPage for selected slots). Focus is cleared when the modal opens or when a practice starts.

### Run view (`PracticeRunView.jsx`)

A `useEffect` keydown listener: `Space` → calls `handleTogglePlay()`. Guards: skip when `complete === true`, skip when target is INPUT/TEXTAREA. Mirrors the existing Space handler in `SequencerPage.jsx`.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/components/PracticeRunView.jsx` | Count-in state + logic, percentage display, Space hotkey |
| `src/components/PracticePage.jsx` | `computePracticeSeconds`/`formatPracticeTime` helpers, time display in `PracticeRow`, `focusedIndex` state, ArrowUp/Down/Space keyboard listener |

No engine changes. No new i18n keys (count-in label is English-only "Get Ready" — can be added to LanguageContext as a quick follow-up if needed, but not blocking). No new DB schema. No backend changes.
