# Tab Key Subtab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tab / Shift+Tab keyboard shortcuts that cycle forward/backward through subtabs in the Metronome and Report tabs, wrapping around at both ends.

**Architecture:** Extend the single existing global `keydown` `useEffect` in `App.jsx`. Two `useRef` mirrors keep the current subpage values readable in the handler without stale closures. `e.preventDefault()` is called only inside the matched branches so native focus movement is preserved on the Practice tab and inside inputs.

**Tech Stack:** React 19, useRef, useEffect, existing `handleSubpageChange` callback, existing `setReportSubpage` state setter.

---

### Task 1: Add subpage ref mirrors and extend the keydown handler

**Files:**
- Modify: `src/App.jsx`

The existing global handler lives around line 1152. We add two refs just below the existing `activeItemIdRef` ref (around line 55), two tiny sync effects after the existing ref-sync effects, and one `Tab` branch inside `handleKeyDown`.

- [ ] **Step 1: Add the two ref declarations**

Open `src/App.jsx`. Find this block (around line 54–55):

```js
  const startTimeRef = useRef(null);
  const activeItemIdRef = useRef(null);
```

Add two lines immediately after:

```js
  const metronomeSubpageRef = useRef(metronomeSubpage);
  const reportSubpageRef = useRef(reportSubpage);
```

- [ ] **Step 2: Add the two sync effects**

Find the global shortcuts `useEffect` (starts with the comment `// Global shortcuts: 1 = Practice, 2 = Metronome...`). Insert these two effects immediately **before** it:

```js
  useEffect(() => { metronomeSubpageRef.current = metronomeSubpage; }, [metronomeSubpage]);
  useEffect(() => { reportSubpageRef.current = reportSubpage; }, [reportSubpage]);
```

- [ ] **Step 3: Add the Tab branch inside handleKeyDown**

The existing handler body looks like:

```js
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Digit1') handleTabChange('practice');
      else if (e.code === 'Digit2') handleTabChange('metronome');
      else if (e.code === 'Digit3') handleTabChange('report');
      else if (e.code === 'KeyM') setTimeUnit('minutes');
      else if (e.code === 'KeyH') setTimeUnit('hours');
    };
```

Replace it with:

```js
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Digit1') handleTabChange('practice');
      else if (e.code === 'Digit2') handleTabChange('metronome');
      else if (e.code === 'Digit3') handleTabChange('report');
      else if (e.code === 'KeyM') setTimeUnit('minutes');
      else if (e.code === 'KeyH') setTimeUnit('hours');
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
    };
```

- [ ] **Step 4: Update the deps array**

The effect's deps array currently reads:

```js
  }, [handleTabChange]);
```

Change it to:

```js
  }, [handleTabChange, handleSubpageChange, setReportSubpage]);
```

(`setReportSubpage` is a stable React setter; `handleSubpageChange` is already a `useCallback`.)

- [ ] **Step 5: Verify the build succeeds**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 6: Manual verification**

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173` in a browser.

Check each scenario:

| Scenario | Expected |
|---|---|
| Navigate to Metronome tab, press Tab | Switches from `metronome` → `sequencer` subtab |
| Press Tab again | Wraps back to `metronome` subtab |
| Press Shift+Tab | Goes backwards `metronome` → `sequencer` |
| Navigate to Report tab (starts on `daily`), press Tab | Switches to `weekly` |
| Keep pressing Tab | Cycles through `monthly` → `yearly` → `stats` → `daily` |
| Press Shift+Tab from `daily` | Wraps to `stats` |
| Navigate to Practice tab, press Tab | No subtab change; browser native focus moves normally |

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Tab/Shift+Tab subtab navigation for Metronome and Report tabs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
