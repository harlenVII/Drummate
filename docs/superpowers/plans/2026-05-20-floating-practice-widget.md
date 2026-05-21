# Floating Practice Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating top-of-screen pill that appears on non-Practice tabs while a practice item is running, showing item name + live elapsed time with a stop button, plus a global `s` hotkey to stop the active timer from any tab.

**Architecture:** One new stateless presentational React component (`FloatingPracticeWidget`) consumes existing App.jsx state (`activeItemId`, `elapsedTime`, `items`) via props. Rendered conditionally next to existing floating UI (`FloatingVoiceIndicator`, `EncouragementButton`). The `s` hotkey is added as one new branch inside the existing global keydown effect at [App.jsx:1432](src/App.jsx#L1432). No new state, no new persistence, no database changes.

**Tech Stack:** React 19 (no hooks needed in the new component), Tailwind CSS v4 utility classes, existing `formatTime` helper, existing `LanguageContext` for i18n. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-20-floating-practice-widget-design.md](docs/superpowers/specs/2026-05-20-floating-practice-widget-design.md)

---

## File Structure

- **Create:** [src/components/FloatingPracticeWidget.jsx](src/components/FloatingPracticeWidget.jsx) — stateless pill component.
- **Modify:** [src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx) — add `stopPractice` key in both `en` and `zh`.
- **Modify:** [src/App.jsx](src/App.jsx) — import the component, render it conditionally near the existing `FloatingVoiceIndicator` block, add the `KeyS` branch to the global keydown handler.
- **Modify:** [CLAUDE.md](CLAUDE.md) — document the `S` hotkey in the keyboard-shortcuts table and note the new component briefly.

No test files. The project has Vitest but no React component test environment (no jsdom, no testing-library); the existing convention is `npm run build` + the manual verification checklist below.

---

## Task 1: Add i18n key for the stop button aria-label

**Model:** `claude-haiku-4-5-20251001` — single-line edits, fully specified.

**Files:**
- Modify: [src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx)

- [ ] **Step 1: Add `stopPractice` to the English block**

Open [src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx). Find the existing `stop: 'Stop',` line in the `en` object (around line 38). Insert a new line directly below it:

```javascript
    stopPractice: 'Stop practice',
```

- [ ] **Step 2: Add `stopPractice` to the Chinese block**

Find the `zh` object's `stop:` entry and insert directly below it:

```javascript
    stopPractice: '停止练习',
```

If the `zh` block does not have a `stop:` entry, place `stopPractice: '停止练习',` adjacent to the `start:` entry (in the same area where the English block has it). The position is not load-bearing — only that the key exists in both languages.

- [ ] **Step 3: Verify by building**

Run: `npm run build`
Expected: Build succeeds with no new warnings.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(i18n): add stopPractice key for floating widget"
```

---

## Task 2: Create the FloatingPracticeWidget component

**Model:** `claude-haiku-4-5-20251001` — full component code is written verbatim in the plan; copy-paste-and-save task.

**Files:**
- Create: [src/components/FloatingPracticeWidget.jsx](src/components/FloatingPracticeWidget.jsx)

- [ ] **Step 1: Create the file with the full component**

Create [src/components/FloatingPracticeWidget.jsx](src/components/FloatingPracticeWidget.jsx) with this exact content:

```jsx
import { useLanguage } from '../contexts/LanguageContext';
import { formatTime } from '../utils/formatTime';

function FloatingPracticeWidget({ itemName, elapsedTime, onStop, onNavigate }) {
  const { t } = useLanguage();

  if (!itemName) return null;

  const handleStopClick = (e) => {
    e.stopPropagation();
    onStop();
  };

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-blue-600 text-white shadow-lg max-w-[280px] hover:bg-blue-700 active:scale-95 transition-all duration-150"
      aria-label={itemName}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-medium truncate min-w-0">{itemName}</span>
      <span className="text-sm font-mono tabular-nums shrink-0">{formatTime(elapsedTime)}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={handleStopClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStopClick(e);
          }
        }}
        aria-label={t('stopPractice')}
        className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 cursor-pointer"
      >
        <span className="block w-2.5 h-2.5 bg-white rounded-sm" />
      </span>
    </button>
  );
}

export default FloatingPracticeWidget;
```

Why the inner stop control is a `<span role="button">` rather than a nested `<button>`: HTML forbids nesting `<button>` inside `<button>`, and the entire pill is a button (for keyboard focus on the navigate action). The inner span has `role="button"`, `tabIndex={0}`, an `aria-label`, and an `onKeyDown` handler that mirrors button behavior — accessible and valid HTML.

Why `formatTime` not `formatDuration`: per the spec, the pill shows the live timer (`MM:SS` / `HH:MM:SS`). `formatTime` is the existing live-timer formatter; `formatDuration` is for report aggregations and respects the user's `timeUnit` preference (minutes/hours), which is wrong for a running ticker.

- [ ] **Step 2: Verify by building**

Run: `npm run build`
Expected: Build succeeds. The component file is not yet imported anywhere, so it will be tree-shaken out — that is fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/FloatingPracticeWidget.jsx
git commit -m "feat(practice): add FloatingPracticeWidget component"
```

---

## Task 3: Wire the widget into App.jsx

**Model:** `claude-haiku-4-5-20251001` — two mechanical edits to App.jsx with exact insertion points and full code shown.

**Files:**
- Modify: [src/App.jsx](src/App.jsx)

- [ ] **Step 1: Add the import**

Open [src/App.jsx](src/App.jsx). Find the existing import line (around line 20):

```javascript
import FloatingVoiceIndicator from './components/FloatingVoiceIndicator';
```

Insert directly below it:

```javascript
import FloatingPracticeWidget from './components/FloatingPracticeWidget';
```

- [ ] **Step 2: Render the widget conditionally**

Find the existing `FloatingVoiceIndicator` render block (around [App.jsx:1863-1868](src/App.jsx#L1863-L1868)):

```jsx
      {handsFreeMode && (
        <FloatingVoiceIndicator
          listeningState={listeningState}
          transcript={voiceTranscript}
        />
      )}
```

Insert directly below the closing `)}` of that block:

```jsx
      {activeItemId != null && activeTab !== 'practice' && (
        <FloatingPracticeWidget
          itemName={items.find(i => i.id === activeItemId)?.name ?? ''}
          elapsedTime={elapsedTime}
          onStop={saveAndStop}
          onNavigate={() => handleTabChange('practice')}
        />
      )}
```

All four props use identifiers that already exist in the App component scope (`activeItemId`, `activeTab`, `items`, `elapsedTime`, `saveAndStop`, `handleTabChange`). No new state, no new memoization needed — the `items.find` is O(n) on a list that is at most a few dozen items, and re-renders only happen on the existing `elapsedTime` tick.

- [ ] **Step 3: Verify by building**

Run: `npm run build`
Expected: Build succeeds with no warnings about undefined references.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(practice): render FloatingPracticeWidget on non-practice tabs"
```

---

## Task 4: Add the `s` global hotkey

**Model:** `claude-haiku-4-5-20251001` — one branch added to an existing handler, plus a dep-array entry. Fully specified.

**Files:**
- Modify: [src/App.jsx](src/App.jsx)

- [ ] **Step 1: Add the KeyS branch to the keydown handler**

In [src/App.jsx](src/App.jsx), locate the existing global keydown handler at [App.jsx:1432-1497](src/App.jsx#L1432-L1497). Find the `else if (e.code === 'KeyC')` branch (around line 1442):

```javascript
      else if (e.code === 'KeyC') { if (languageRef.current !== 'zh') toggleLanguage(); }
```

Insert directly below it (before the `else if (e.key === 'Tab')` branch):

```javascript
      else if (e.code === 'KeyS') {
        if (activeItemIdRef.current != null) saveAndStop();
      }
```

`activeItemIdRef` already exists at [App.jsx:70](src/App.jsx#L70) and is kept in sync by the effect at [App.jsx:506](src/App.jsx#L506) — using the ref (not the state) inside the keydown handler avoids needing to add this dependency to the effect's dep array, which would re-bind the listener on every tick.

- [ ] **Step 2: Add `saveAndStop` to the effect's dependency array**

The effect ends at [App.jsx:1500](src/App.jsx#L1500) with this dep array:

```javascript
  }, [handleTabChange, handleSubpageChange, setReportSubpage, handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange, toggleLanguage]);
```

Add `saveAndStop` to it:

```javascript
  }, [handleTabChange, handleSubpageChange, setReportSubpage, handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange, toggleLanguage, saveAndStop]);
```

`saveAndStop` is wrapped in `useCallback` at [App.jsx:594](src/App.jsx#L594), so it has a stable identity that only changes when its own dependencies change — adding it to the dep array is correct and will not cause excessive re-binds.

- [ ] **Step 3: Verify by building**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Verify by lint**

Run: `npm run lint`
Expected: No new errors. In particular, the `react-hooks/exhaustive-deps` rule should be satisfied for the modified effect.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(practice): add 's' global hotkey to stop active timer"
```

---

## Task 5: Update CLAUDE.md documentation

**Model:** `claude-haiku-4-5-20251001` — doc edits, fully specified.

**Files:**
- Modify: [CLAUDE.md](CLAUDE.md)

- [ ] **Step 1: Add `S` to the keyboard-shortcuts table**

In [CLAUDE.md](CLAUDE.md), find the Keyboard Shortcuts table. The existing rows look like:

```markdown
| `M` / `H` | Set time unit to minutes / hours |
| `E` / `C` | Switch language to English / Chinese |
```

Insert a new row directly below them:

```markdown
| `S` | Stop the active practice timer (no-op if no timer running) |
```

- [ ] **Step 2: Add a brief note about FloatingPracticeWidget**

In the same file, find the "## Critical Implementation Patterns" section. Add a new pattern subsection at the bottom of that section (after the existing patterns):

```markdown
### Floating Practice Widget
`FloatingPracticeWidget.jsx` renders a top-anchored pill (`fixed top-4 left-1/2`) when `activeItemId != null && activeTab !== 'practice'`. Body click navigates to Practice tab; inner stop control (a `role="button"` span — HTML disallows nested buttons) calls `saveAndStop`. Stateless; consumes existing App.jsx state via props. The `s` global hotkey wired into the keydown handler at App.jsx calls `saveAndStop` when `activeItemIdRef.current != null`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document floating practice widget and 's' hotkey"
```

---

## Final verification

Per the spec's testing checklist. Run `npm run dev` and walk through each scenario.

- [ ] `npm run build` succeeds (final time).
- [ ] `npm run lint` produces no new errors.
- [ ] Start a practice item, switch to Metronome — pill appears at top with name + ticking timer.
- [ ] Switch to Report, then Notes — pill stays visible on both, timer keeps ticking.
- [ ] Switch back to Practice — pill disappears (the running timer in the list takes over).
- [ ] On any non-Practice tab, tap the pill body — navigates to Practice tab and pill disappears.
- [ ] On any non-Practice tab, tap the inner stop control — timer stops, log is saved, pill disappears, current tab is unchanged.
- [ ] On Practice tab with timer running, press `s` — timer stops, log saved.
- [ ] On Metronome / Report / Notes with timer running, press `s` — timer stops, log saved, pill disappears.
- [ ] With no timer running, press `s` — nothing happens, no console error.
- [ ] Focus an input (Add Practice Item form, Note Edit modal textarea), type `s` — the letter `s` is inserted into the input; timer is NOT stopped.
- [ ] Toggle language to Chinese (`C`), inspect the stop control via devtools — `aria-label="停止练习"`.
- [ ] Toggle back to English (`E`) — `aria-label="Stop practice"`.
- [ ] Resize to mobile viewport (375px wide) — pill truncates a long item name without overflowing or wrapping; no horizontal scroll on the page.
- [ ] Confirm no collision: with a timer running, scroll on a long Report — pill remains floating at top; the encouragement FAB (bottom-right, if `aiCoachEnabled`) and voice pill (bottom-center, when listening) are unaffected.
- [ ] Hard refresh during an active timer — `drummate_pending_log` recovery still works; widget reappears once `activeItemId` is restored.

---

## Self-review notes (author)

- **Spec coverage:**
  - Visibility rule (`activeItemId != null && activeTab !== 'practice'`) → Task 3 Step 2.
  - Display (icon + name + time + stop button, `formatTime`) → Task 2 Step 1.
  - Tap body → navigate to Practice → Task 3 Step 2 (`onNavigate`).
  - Tap stop → `saveAndStop` + stop propagation → Task 2 Step 1 (`handleStopClick`).
  - `s` hotkey, input-blocked, all tabs → Task 4 Step 1 (inside the existing input-blocking guard at line 1434).
  - Positioning (`fixed top-4 left-1/2 -translate-x-1/2 z-50`) → Task 2 Step 1.
  - i18n `stopPractice` → Task 1.
  - CLAUDE.md table update → Task 5.
- **Placeholder scan:** No TBDs, no "implement later", no vague handlers. All code is concrete.
- **Type consistency:** Component props match the call site exactly (`itemName`, `elapsedTime`, `onStop`, `onNavigate`). The component imports `formatTime` from `../utils/formatTime` — this matches the existing live-timer usage elsewhere in the codebase.
- **One known divergence from spec:** the spec said the i18n key would be `practice.stopAria`; the LanguageContext is flat (not namespaced), so the implementation uses the top-level key `stopPractice`. This is a naming-only adjustment, behavior is identical.
