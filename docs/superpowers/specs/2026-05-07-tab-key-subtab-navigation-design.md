# Tab Key Subtab Navigation — Design Spec

**Date:** 2026-05-07

## Goal

Allow the `Tab` key to cycle forward through subtabs, and `Shift+Tab` to cycle backward, when the user is on the Metronome or Report tab. Navigation wraps around at both ends.

## Affected Tabs and Subtab Orders

| Tab | Subtab cycle (forward) |
|---|---|
| Metronome | `metronome` → `sequencer` → *(wraps)* |
| Report | `daily` → `weekly` → `monthly` → `yearly` → `stats` → *(wraps)* |

Practice tab: Tab key has no subtab effect (no subtabs).

## Implementation

### File: `src/App.jsx`

**Step 1 — Add ref mirrors for subpage state.**

Two refs keep a current copy of the subpage values so the keydown handler can read them without going stale:

```js
const metronomeSubpageRef = useRef(metronomeSubpage);
const reportSubpageRef = useRef(reportSubpage);
```

Two small `useEffect`s keep them in sync:

```js
useEffect(() => { metronomeSubpageRef.current = metronomeSubpage; }, [metronomeSubpage]);
useEffect(() => { reportSubpageRef.current = reportSubpage; }, [reportSubpage]);
```

**Step 2 — Extend the existing global keydown handler** (currently at line 1152) with a `Tab` branch:

```js
else if (e.key === 'Tab') {
  if (activeTab === 'metronome') {
    e.preventDefault();
    const pages = ['metronome', 'sequencer'];
    const idx = pages.indexOf(metronomeSubpageRef.current);
    const next = e.shiftKey
      ? pages[(idx - 1 + pages.length) % pages.length]
      : pages[(idx + 1) % pages.length];
    handleSubpageChange(next);
  } else if (activeTab === 'report') {
    e.preventDefault();
    const pages = ['daily', 'weekly', 'monthly', 'yearly', 'stats'];
    const idx = pages.indexOf(reportSubpageRef.current);
    const next = e.shiftKey
      ? pages[(idx - 1 + pages.length) % pages.length]
      : pages[(idx + 1) % pages.length];
    setReportSubpage(next);
  }
}
```

`e.preventDefault()` is called only inside the branches where we handle the key, so browser focus movement is suppressed only when we act on it.

**Step 3 — Update the handler's deps array** to include `handleSubpageChange` and `setReportSubpage`:

```js
}, [handleTabChange, handleSubpageChange, setReportSubpage]);
```

`setReportSubpage` is a React state setter (stable reference). `handleSubpageChange` is already a `useCallback`.

### No changes to other files

Metronome.jsx and SequencerPage.jsx do not need changes — they handle `Space`/arrow keys locally but subtab switching is App-level state.

## Guard Conditions

- If `e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'`: existing guard at the top of the handler already returns early, so Tab in a text field retains native browser behavior.
- On the Practice tab: neither branch matches, so the key falls through with no action and no `preventDefault` — browser default focus movement applies.

## Testing Checklist

- [ ] Metronome tab: Tab cycles `metronome → sequencer → metronome`
- [ ] Metronome tab: Shift+Tab cycles backwards `metronome → sequencer → metronome`
- [ ] Report tab: Tab cycles `daily → weekly → monthly → yearly → stats → daily`
- [ ] Report tab: Shift+Tab cycles backwards
- [ ] Practice tab: Tab has no subtab effect
- [ ] `npm run build` succeeds
