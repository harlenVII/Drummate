# Code Quality Refactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-duplicate the four report components, route all static `aria-label`s through `t()`, and migrate remaining direct `localStorage` access to `safeStorage` — in three independent commits.

**Architecture:** Two new stateless presentational components (`ReportNavHeader`, `ReportItemBreakdown`) absorb the copy-pasted blocks in DailyReport/WeeklyReport/MonthlyReport/YearlyReport. A new `accessibility` i18n block supplies translated aria strings; the FloatingPracticeWidget DOM query is decoupled from the (now translated) settings-button label via a `data-*` attribute. `safeStorage` gains a `removeItem` helper and replaces direct `localStorage` calls in App.jsx and LanguageContext.

**Tech Stack:** React 19, Vite 7, Tailwind v4, Vitest + @testing-library/react, custom i18n in `LanguageContext.jsx`.

**Spec:** [docs/superpowers/specs/2026-05-31-code-quality-refactors-design.md](../specs/2026-05-31-code-quality-refactors-design.md)

**Commit boundaries:** Tasks 1–3 = commit 1 (report de-dup). Tasks 4–7 = commit 2 (aria i18n). Tasks 8–9 = commit 3 (safeStorage). Each commit must pass `npm run build` and `npm run test` before the next.

---

## COMMIT 1 — Report de-duplication

### Task 1: `ReportNavHeader` component

**Files:**
- Create: `src/components/ReportNavHeader.jsx`
- Test: `tests/reportNavHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/reportNavHeader.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportNavHeader from '../src/components/ReportNavHeader';

describe('ReportNavHeader', () => {
  it('renders the center label and both aria-labels', () => {
    render(
      <ReportNavHeader
        onPrev={() => {}}
        onNext={() => {}}
        nextDisabled={false}
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Week label
      </ReportNavHeader>,
    );
    expect(screen.getByText('Week label')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous week')).toBeInTheDocument();
    expect(screen.getByLabelText('Next week')).toBeInTheDocument();
  });

  it('fires onPrev / onNext when the chevrons are clicked', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <ReportNavHeader
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={false}
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Label
      </ReportNavHeader>,
    );
    await userEvent.click(screen.getByLabelText('Previous week'));
    await userEvent.click(screen.getByLabelText('Next week'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables the next button when nextDisabled is true', async () => {
    const onNext = vi.fn();
    render(
      <ReportNavHeader
        onPrev={() => {}}
        onNext={onNext}
        nextDisabled
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Label
      </ReportNavHeader>,
    );
    const nextBtn = screen.getByLabelText('Next week');
    expect(nextBtn).toBeDisabled();
    await userEvent.click(nextBtn);
    expect(onNext).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reportNavHeader.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/ReportNavHeader"`.

- [ ] **Step 3: Write the component**

Create `src/components/ReportNavHeader.jsx`. Classes and SVG paths are copied verbatim from the existing report headers so output is byte-identical:

```jsx
function ReportNavHeader({ onPrev, onNext, nextDisabled, prevLabel, nextLabel, compactMode = false, children }) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onPrev}
        className={`${compactMode ? 'p-1' : 'p-2'} text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors`}
        aria-label={prevLabel}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className={`${compactMode ? 'text-base' : 'text-lg'} font-semibold text-gray-800 dark:text-slate-100`}>
        {children}
      </span>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`${compactMode ? 'p-1' : 'p-2'} transition-colors ${
          nextDisabled
            ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
            : 'text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
        }`}
        aria-label={nextLabel}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default ReportNavHeader;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reportNavHeader.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Do NOT commit yet** — commit happens after Task 3 (whole commit-1 unit).

---

### Task 2: `ReportItemBreakdown` component

**Files:**
- Create: `src/components/ReportItemBreakdown.jsx`
- Test: `tests/reportItemBreakdown.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/reportItemBreakdown.test.jsx`. The `useLanguage` mock mirrors `tests/reportItemCard.test.jsx` (returns the key itself):

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportItemBreakdown from '../src/components/ReportItemBreakdown';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const fundamentals = [{ id: 1, name: 'Singles', duration: 900, category: 'fundamentals' }];
const songs = [{ id: 2, name: 'Song A', duration: 1200, category: 'songs' }];
const breakdown = [...fundamentals, ...songs];
const renderCard = (entry) => <div key={entry.id} data-testid="card">{entry.name}</div>;

describe('ReportItemBreakdown', () => {
  it('renders category headers and a card per entry when grouping', () => {
    render(
      <ReportItemBreakdown
        groupByCategory
        fundamentals={fundamentals}
        songs={songs}
        breakdown={breakdown}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.getByText('categories.fundamentals')).toBeInTheDocument();
    expect(screen.getByText('categories.songs')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('renders a flat list with no category headers when not grouping', () => {
    render(
      <ReportItemBreakdown
        groupByCategory={false}
        fundamentals={fundamentals}
        songs={songs}
        breakdown={breakdown}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.queryByText('categories.fundamentals')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('omits an empty category section', () => {
    render(
      <ReportItemBreakdown
        groupByCategory
        fundamentals={fundamentals}
        songs={[]}
        breakdown={fundamentals}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.getByText('categories.fundamentals')).toBeInTheDocument();
    expect(screen.queryByText('categories.songs')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reportItemBreakdown.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/ReportItemBreakdown"`.

- [ ] **Step 3: Write the component**

Create `src/components/ReportItemBreakdown.jsx`. The JSX (classes, subtotal `reduce`) is copied verbatim from the existing report breakdown blocks:

```jsx
import { formatDuration } from '../utils/formatTime';
import { useLanguage } from '../contexts/LanguageContext';

function ReportItemBreakdown({ groupByCategory, fundamentals, songs, breakdown, timeUnit, renderCard }) {
  const { t } = useLanguage();

  if (!groupByCategory) {
    return <>{breakdown.map(renderCard)}</>;
  }

  return (
    <>
      {fundamentals.length > 0 && (
        <>
          <div className="flex justify-between items-center px-1 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              {t('categories.fundamentals')}
            </span>
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {formatDuration(fundamentals.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
            </span>
          </div>
          {fundamentals.map(renderCard)}
        </>
      )}
      {songs.length > 0 && (
        <>
          <div className="flex justify-between items-center px-1 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              {t('categories.songs')}
            </span>
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {formatDuration(songs.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
            </span>
          </div>
          {songs.map(renderCard)}
        </>
      )}
    </>
  );
}

export default ReportItemBreakdown;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reportItemBreakdown.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 3: Wire all four reports to the new components

**Files:**
- Modify: `src/components/DailyReport.jsx`
- Modify: `src/components/WeeklyReport.jsx`
- Modify: `src/components/MonthlyReport.jsx`
- Modify: `src/components/YearlyReport.jsx`

Each report: add two imports, replace the nav-header JSX block with `<ReportNavHeader>`, and replace the per-item breakdown ternary with `<ReportItemBreakdown>`. The local `renderItemCard` definition stays and is passed as `renderCard`. **Keep the current hardcoded English aria strings here** — they become `t('accessibility.…')` in Task 6.

- [ ] **Step 1: DailyReport — add imports**

In `src/components/DailyReport.jsx`, the existing import of `ReportItemCard` (line 6) stays. Add after it:

```jsx
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
```

- [ ] **Step 2: DailyReport — replace the nav header**

Replace the entire `{/* Date navigation */}` `<div className="flex items-center justify-between">…</div>` block (the two chevron buttons + center `<span>`) with:

```jsx
{/* Date navigation */}
<ReportNavHeader
  onPrev={() => onDateChange(shiftDate(reportDate, -1))}
  onNext={() => onDateChange(shiftDate(reportDate, 1))}
  nextDisabled={isToday}
  prevLabel="Previous day"
  nextLabel="Next day"
  compactMode={compactMode}
>
  {formatDateLabel(reportDate, t)}
</ReportNavHeader>
```

- [ ] **Step 3: DailyReport — replace the breakdown block**

Replace the entire `{/* Per-item breakdown */}` `{groupByCategory ? ( … ) : ( breakdown.map(renderItemCard) )}` block with:

```jsx
{/* Per-item breakdown */}
<ReportItemBreakdown
  groupByCategory={groupByCategory}
  fundamentals={fundamentals}
  songs={songs}
  breakdown={breakdown}
  timeUnit={timeUnit}
  renderCard={renderItemCard}
/>
```

- [ ] **Step 4: WeeklyReport — same three edits**

Add imports (after the `ReportItemCard` import):

```jsx
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
```

Replace the `{/* Week navigation */}` block with:

```jsx
{/* Week navigation */}
<ReportNavHeader
  onPrev={() => onWeekChange(shiftDate(weekStart, -7))}
  onNext={() => onWeekChange(shiftDate(weekStart, 7))}
  nextDisabled={isCurrentWeek}
  prevLabel="Previous week"
  nextLabel="Next week"
  compactMode={compactMode}
>
  {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
</ReportNavHeader>
```

Replace the `{/* Per-item breakdown */}` block with:

```jsx
{/* Per-item breakdown */}
<ReportItemBreakdown
  groupByCategory={groupByCategory}
  fundamentals={fundamentals}
  songs={songs}
  breakdown={breakdown}
  timeUnit={timeUnit}
  renderCard={renderItemCard}
/>
```

- [ ] **Step 5: MonthlyReport — same three edits**

Add imports (after the `ReportItemCard` import):

```jsx
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
```

Replace the `{/* Month navigation */}` block with:

```jsx
{/* Month navigation */}
<ReportNavHeader
  onPrev={handlePrevMonth}
  onNext={handleNextMonth}
  nextDisabled={isCurrentMonth}
  prevLabel="Previous month"
  nextLabel="Next month"
  compactMode={compactMode}
>
  {monthLabel}
</ReportNavHeader>
```

Replace the `{/* Per-item breakdown */}` block with:

```jsx
{/* Per-item breakdown */}
<ReportItemBreakdown
  groupByCategory={groupByCategory}
  fundamentals={fundamentals}
  songs={songs}
  breakdown={breakdown}
  timeUnit={timeUnit}
  renderCard={renderItemCard}
/>
```

- [ ] **Step 6: YearlyReport — same three edits**

Add imports (after the `ReportItemCard` import). Note YearlyReport imports `ReportItemCard` near the top — add alongside it:

```jsx
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
```

Replace the `{/* Year navigation */}` block with:

```jsx
{/* Year navigation */}
<ReportNavHeader
  onPrev={handlePrevYear}
  onNext={handleNextYear}
  nextDisabled={isCurrentYear}
  prevLabel="Previous year"
  nextLabel="Next year"
  compactMode={compactMode}
>
  {year}
</ReportNavHeader>
```

Replace the `{/* Per-item breakdown */}` block with:

```jsx
{/* Per-item breakdown */}
<ReportItemBreakdown
  groupByCategory={groupByCategory}
  fundamentals={fundamentals}
  songs={songs}
  breakdown={breakdown}
  timeUnit={timeUnit}
  renderCard={renderItemCard}
/>
```

- [ ] **Step 7: Verify no orphaned references**

Run: `grep -n "M15 19l-7-7\|M9 5l7 7-7" src/components/*Report.jsx`
Expected: no output (all chevron SVGs now live only in `ReportNavHeader.jsx`).

Run: `grep -n "categories.fundamentals" src/components/DailyReport.jsx src/components/WeeklyReport.jsx src/components/MonthlyReport.jsx src/components/YearlyReport.jsx`
Expected: no output (breakdown headers now only in `ReportItemBreakdown.jsx`).

- [ ] **Step 8: Build and test**

Run: `npm run build && npm run test`
Expected: build succeeds; all tests pass (156 prior + 6 new = 162).

- [ ] **Step 9: Commit**

```bash
git add src/components/ReportNavHeader.jsx src/components/ReportItemBreakdown.jsx \
  tests/reportNavHeader.test.jsx tests/reportItemBreakdown.test.jsx \
  src/components/DailyReport.jsx src/components/WeeklyReport.jsx \
  src/components/MonthlyReport.jsx src/components/YearlyReport.jsx
git commit -m "refactor(reports): extract ReportNavHeader and ReportItemBreakdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## COMMIT 2 — i18n for static aria-labels

### Task 4: Add the `accessibility` i18n block

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add the English block**

In `src/contexts/LanguageContext.jsx`, inside the `en: {` object, add an `accessibility` block. Place it immediately before the `analytics:` key (around line 283) to mirror the existing nesting style:

```js
    accessibility: {
      prevDay: 'Previous day',
      nextDay: 'Next day',
      prevWeek: 'Previous week',
      nextWeek: 'Next week',
      prevMonth: 'Previous month',
      nextMonth: 'Next month',
      prevYear: 'Previous year',
      nextYear: 'Next year',
      decreaseBpm: 'Decrease BPM',
      increaseBpm: 'Increase BPM',
      openSettings: 'Open settings',
      closeSettings: 'Close settings',
      aiCoach: 'AI Coach',
      dragToReorder: 'Drag to reorder',
    },
```

- [ ] **Step 2: Add the Chinese block**

Inside the `zh: {` object, before its `analytics:` key (around line 699), add:

```js
    accessibility: {
      prevDay: '前一天',
      nextDay: '后一天',
      prevWeek: '上一周',
      nextWeek: '下一周',
      prevMonth: '上个月',
      nextMonth: '下个月',
      prevYear: '上一年',
      nextYear: '下一年',
      decreaseBpm: '降低 BPM',
      increaseBpm: '提高 BPM',
      openSettings: '打开设置',
      closeSettings: '关闭设置',
      aiCoach: 'AI 教练',
      dragToReorder: '拖动以重新排序',
    },
```

- [ ] **Step 3: Verify the file still parses**

Run: `npm run lint`
Expected: no errors (no orphaned commas / unclosed objects).

- [ ] **Step 4: Do NOT commit yet** — commit after Task 7.

---

### Task 5: Decouple FloatingPracticeWidget from the settings-button label

This MUST land with Task 6's `openSettings` change so the widget keeps working in Chinese.

**Files:**
- Modify: `src/App.jsx:1716`
- Modify: `src/components/FloatingPracticeWidget.jsx:19`

- [ ] **Step 1: Add a stable hook + translate the App.jsx settings button**

In `src/App.jsx`, the settings button currently reads:

```jsx
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-blue-600 dark:bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors shrink-0"
              aria-label="Open settings"
            >
```

Replace with (adds `data-settings-button`, translates the label):

```jsx
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-blue-600 dark:bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors shrink-0"
              aria-label={t('accessibility.openSettings')}
              data-settings-button
            >
```

(`t` is already in scope in App.jsx via `useLanguage`.)

- [ ] **Step 2: Point the widget query at the stable attribute**

In `src/components/FloatingPracticeWidget.jsx`, line 19 currently reads:

```jsx
    const settingsBtn = document.querySelector('[aria-label="Open settings"]');
```

Replace with:

```jsx
    const settingsBtn = document.querySelector('[data-settings-button]');
```

- [ ] **Step 3: Verify nothing else queries the old label**

Run: `grep -rn 'aria-label="Open settings"' src/`
Expected: no output.

- [ ] **Step 4: Do NOT commit yet.**

---

### Task 6: Replace remaining hardcoded aria-labels with `t()`

**Files:**
- Modify: `src/components/DailyReport.jsx`, `WeeklyReport.jsx`, `MonthlyReport.jsx`, `YearlyReport.jsx` (the `prevLabel`/`nextLabel` props from Task 3)
- Modify: `src/components/BpmDial.jsx:153,253`
- Modify: `src/components/SettingsPanel.jsx:259`
- Modify: `src/components/EncouragementButton.jsx`
- Modify: `src/components/MultiMeterPage.jsx`, `GoalCard.jsx`, `PracticeItemList.jsx`, `SequencerPage.jsx` (drag handles)

- [ ] **Step 1: Report nav labels → t()**

In each report, change the `ReportNavHeader` props added in Task 3 from the hardcoded strings to translation keys:

- DailyReport: `prevLabel={t('accessibility.prevDay')}` / `nextLabel={t('accessibility.nextDay')}`
- WeeklyReport: `prevLabel={t('accessibility.prevWeek')}` / `nextLabel={t('accessibility.nextWeek')}`
- MonthlyReport: `prevLabel={t('accessibility.prevMonth')}` / `nextLabel={t('accessibility.nextMonth')}`
- YearlyReport: `prevLabel={t('accessibility.prevYear')}` / `nextLabel={t('accessibility.nextYear')}`

(`t` is already destructured from `useLanguage()` in all four report components.)

- [ ] **Step 2: BpmDial**

In `src/components/BpmDial.jsx`, change `aria-label="Decrease BPM"` to `aria-label={t('accessibility.decreaseBpm')}` and `aria-label="Increase BPM"` to `aria-label={t('accessibility.increaseBpm')}`. `t` is already in scope (component HAS useLanguage).

- [ ] **Step 3: SettingsPanel**

In `src/components/SettingsPanel.jsx`, change `aria-label="Close settings"` to `aria-label={t('accessibility.closeSettings')}`. `t` already in scope.

- [ ] **Step 4: EncouragementButton (needs useLanguage added)**

`src/components/EncouragementButton.jsx` does NOT currently use `useLanguage`. Add the import at the top of the file:

```jsx
import { useLanguage } from '../contexts/LanguageContext';
```

Inside the component body, add as the first line:

```jsx
  const { t } = useLanguage();
```

Then change `aria-label="AI Coach"` to `aria-label={t('accessibility.aiCoach')}`.

- [ ] **Step 5: Drag handles (4 files)**

In each of `src/components/PracticeItemList.jsx`, `SequencerPage.jsx`, `MultiMeterPage.jsx`, `GoalCard.jsx`, change `aria-label="Drag to reorder"` to `aria-label={t('accessibility.dragToReorder')}`. All four components already use `useLanguage` (verified). For `MultiMeterPage.jsx` and `SequencerPage.jsx` the drag handle lives in a small `DragHandle`/sortable sub-component — confirm `t` is in scope there:

Run: `grep -n "const { t }\|useLanguage" src/components/MultiMeterPage.jsx src/components/SequencerPage.jsx src/components/PracticeItemList.jsx src/components/GoalCard.jsx`

If the drag-handle sub-component is a separate function that does NOT call `useLanguage`, add `const { t } = useLanguage();` to that sub-component (the import already exists in the file). Otherwise no extra wiring needed.

- [ ] **Step 6: Verify no hardcoded labels remain**

Run: `grep -rn 'aria-label="[A-Z]' src/components/ src/App.jsx`
Expected: no output. (All static aria-labels now go through `t()`.)

- [ ] **Step 7: Build and test**

Run: `npm run build && npm run test`
Expected: build succeeds; all tests pass (162). No test asserts on these label strings, so none break.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/LanguageContext.jsx src/App.jsx \
  src/components/FloatingPracticeWidget.jsx \
  src/components/DailyReport.jsx src/components/WeeklyReport.jsx \
  src/components/MonthlyReport.jsx src/components/YearlyReport.jsx \
  src/components/BpmDial.jsx src/components/SettingsPanel.jsx \
  src/components/EncouragementButton.jsx src/components/MultiMeterPage.jsx \
  src/components/GoalCard.jsx src/components/PracticeItemList.jsx \
  src/components/SequencerPage.jsx
git commit -m "refactor(i18n): route static aria-labels through t()

Adds an accessibility translation block (en/zh) and decouples the
FloatingPracticeWidget DOM query from the settings-button label via a
data-settings-button attribute so the label can be translated.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## COMMIT 3 — Route localStorage through safeStorage

### Task 7: Add `removeItem` to safeStorage

**Files:**
- Modify: `src/utils/safeStorage.js`
- Modify: `tests/safeStorage.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/safeStorage.test.js`, update the import line and append two cases inside the `describe` block:

Change the import to:

```js
import { getItem, setItem, removeItem } from '../src/utils/safeStorage';
```

Append:

```js
  it('removes a stored value', () => {
    setItem('k', 'v');
    removeItem('k');
    expect(getItem('k')).toBe(null);
  });

  it('swallows errors when removeItem throws', () => {
    vi.spyOn(globalThis.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => removeItem('k')).not.toThrow();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/safeStorage.test.js`
Expected: FAIL — `removeItem is not a function` (or import resolves to undefined).

- [ ] **Step 3: Add the helper**

In `src/utils/safeStorage.js`, append:

```js
export function removeItem(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // best-effort; ignore
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/safeStorage.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Do NOT commit yet** — commit after Task 8.

---

### Task 8: Migrate App.jsx and LanguageContext to safeStorage

**Files:**
- Modify: `src/App.jsx` (import line 68 + 24 call sites)
- Modify: `src/contexts/LanguageContext.jsx` (lines 844, 850)

- [ ] **Step 1: Expand the App.jsx safeStorage import**

`src/App.jsx` line 68 currently reads:

```jsx
import { setItem } from './utils/safeStorage';
```

Replace with:

```jsx
import { getItem, setItem, removeItem } from './utils/safeStorage';
```

- [ ] **Step 2: Sweep the simple read sites**

Replace each `localStorage.getItem(` with `getItem(` and each `localStorage.setItem(` with `setItem(` in `src/App.jsx` for the straightforward sites. The init `useState` reads (lines ~95, 103, 111, 134, 145, 160, 169, 179, 200, 209, 218, 260, 270, 279, 288) and the goal/pending reads (541, 628) are direct mechanical swaps — the surrounding `JSON.parse` / `=== 'true'` logic stays unchanged. Example (line 111):

```jsx
// before
      return localStorage.getItem('drummate_compact_mode') === 'true';
// after
      return getItem('drummate_compact_mode') === 'true';
```

- [ ] **Step 3: Convert the removeItem sites**

Line ~548:

```jsx
// before
        if (legacyGoalRaw) localStorage.removeItem('drummate_goal');
// after
        if (legacyGoalRaw) removeItem('drummate_goal');
```

Line ~630:

```jsx
// before
      localStorage.removeItem('drummate_pending_log');
// after
      removeItem('drummate_pending_log');
```

- [ ] **Step 4: Remove the now-redundant try/catch wrappers**

`safeStorage` never throws, so the bespoke guards collapse.

Line ~239 (`kokoroEnabled` init):

```jsx
// before
    try { return localStorage.getItem('drummate_kokoro_tts') === 'true'; } catch { return false; }
// after
    return getItem('drummate_kokoro_tts') === 'true';
```

Line ~246 (`aiCoachEnabled` init):

```jsx
// before
    try { return localStorage.getItem('drummate_ai_coach_enabled') === 'true'; } catch { return false; }
// after
    return getItem('drummate_ai_coach_enabled') === 'true';
```

Lines ~1205 / ~1209 (`handleToggleKokoro`):

```jsx
// before
      setKokoroEnabled(false);
      localStorage.setItem('drummate_kokoro_tts', 'false');
      return;
    }
    setKokoroEnabled(true);
    localStorage.setItem('drummate_kokoro_tts', 'true');
// after
      setKokoroEnabled(false);
      setItem('drummate_kokoro_tts', 'false');
      return;
    }
    setKokoroEnabled(true);
    setItem('drummate_kokoro_tts', 'true');
```

Line ~2007 (`onToggleAiCoach`):

```jsx
// before
            const next = !prev;
            try { localStorage.setItem('drummate_ai_coach_enabled', String(next)); } catch { /* ignore */ }
            return next;
// after
            const next = !prev;
            setItem('drummate_ai_coach_enabled', String(next));
            return next;
```

- [ ] **Step 5: Verify App.jsx is fully migrated**

Run: `grep -n "localStorage\." src/App.jsx`
Expected: no output.

- [ ] **Step 6: Migrate LanguageContext**

`src/contexts/LanguageContext.jsx` — add the import at the top (after the existing React import on line 1):

```jsx
import { getItem, setItem } from '../utils/safeStorage';
```

Line ~844:

```jsx
// before
    return localStorage.getItem('drummate_language') || 'en';
// after
    return getItem('drummate_language') || 'en';
```

Line ~850:

```jsx
// before
      localStorage.setItem('drummate_language', next);
// after
      setItem('drummate_language', next);
```

- [ ] **Step 7: Verify LanguageContext is fully migrated**

Run: `grep -n "localStorage\." src/contexts/LanguageContext.jsx`
Expected: no output.

- [ ] **Step 8: Build and test**

Run: `npm run build && npm run test`
Expected: build succeeds; all tests pass (162).

---

### Task 9: Commit the safeStorage migration

- [ ] **Step 1: Commit**

```bash
git add src/utils/safeStorage.js tests/safeStorage.test.js \
  src/App.jsx src/contexts/LanguageContext.jsx
git commit -m "refactor: route remaining localStorage access through safeStorage

Adds safeStorage.removeItem and migrates the ~24 direct localStorage
calls in App.jsx plus the 2 in LanguageContext, removing now-redundant
inline try/catch guards.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual Verification (after all three commits)

1. **Reports identical:** Open Report tab; for Daily/Weekly/Monthly/Yearly confirm header arrows step the date, the center label is correct, category grouping toggle still splits Fundamentals/Songs with subtotals, and the "next" arrow is disabled on the current period. Check in both normal and compact mode, light and dark.
2. **i18n labels:** Press `C` to switch to Chinese. Inspect (DevTools) the report nav buttons, BpmDial ±, settings close (X), AI Coach button, and a drag handle — their `aria-label` attributes should be Chinese. Press `E` to switch back.
3. **Widget positioning:** With a practice timer running, switch to the Metronome tab so the floating practice pill appears; confirm it positions correctly (between the Drummate title and the settings avatar) in BOTH languages.
4. **Prefs persist:** Toggle time unit, group-by-category, compact mode, change metronome/sequencer/multimeter settings, toggle AI Coach and Kokoro TTS, switch language; reload the page and confirm every setting survives.
5. **Crash recovery:** Start a practice timer, close the tab mid-session, reopen — the unsaved log is recovered.

---

## Self-Review Notes

- **Spec coverage:** Opp 1 → Tasks 1–3; Opp 2 → Tasks 4–6 (+ decoupling in Task 5); Opp 3 → Tasks 7–8. All three spec sections map to tasks.
- **Type/name consistency:** `ReportNavHeader` props (`onPrev/onNext/nextDisabled/prevLabel/nextLabel/compactMode/children`) and `ReportItemBreakdown` props (`groupByCategory/fundamentals/songs/breakdown/timeUnit/renderCard`) are used identically in the component definitions (Tasks 1–2) and all four call sites (Task 3). `safeStorage` exports `getItem/setItem/removeItem` — used consistently in Tasks 7–8.
- **Decoupling ordering:** Task 5 (data-attribute) and Task 6 Step 1 (translate `openSettings`) are in the same commit, so the widget query never breaks.
