# Trend Line Chart Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Weekly bar chart, Monthly line chart, and Yearly bar chart with a single shared `TrendLineChart` line-chart component that always renders a point per period (zeros included) and drills down on click.

**Architecture:** A new presentational `TrendLineChart` component owns the card + title + SVG. Each report maps its existing per-period totals into a `points[]` array. Clicking a point navigates one level down (day→daily, week→weekly, month→monthly) via a generalized `onNavigateToSubpage` ref already pattern-established in `App.jsx`.

**Tech Stack:** React 19, hand-rolled SVG (no charting lib), Tailwind v4, Vitest + @testing-library/react.

**Spec:** [docs/superpowers/specs/2026-06-01-trend-line-chart-design.md](../specs/2026-06-01-trend-line-chart-design.md)

---

## File Structure

- **Create** `src/components/TrendLineChart.jsx` — shared line chart (card + title + SVG).
- **Create** `tests/trendLineChart.test.jsx` — component tests.
- **Modify** `src/contexts/LanguageContext.jsx` — add `analytics.dailyTrend` + `analytics.weekShort` (en + zh).
- **Modify** `src/hooks/useReports.js` — rename `onNavigateToDaily`→`onNavigateToSubpage`; add `handleWeekClick`, `handleMonthClick`.
- **Modify** `tests/useReports.test.js` — update for rename, add 2 tests.
- **Modify** `src/App.jsx` — generalize the nav ref to take a subpage arg.
- **Modify** `src/components/ReportTab.jsx` — thread `onWeekClick`/`onMonthClick`.
- **Modify** `src/components/WeeklyReport.jsx` — replace bar chart with `TrendLineChart`.
- **Modify** `src/components/MonthlyReport.jsx` — replace line chart with `TrendLineChart`; add `onWeekClick`.
- **Modify** `src/components/YearlyReport.jsx` — replace bar chart with `TrendLineChart`; add `onMonthClick`.

---

### Task 1: i18n keys  [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx` (en block ~line 309, zh block ~line 741)

- [ ] **Step 1: Add English keys**

In the `en` `analytics` object, immediately after the `monthlyTrend: 'Monthly Trend',` line (~309), add:

```js
      dailyTrend: 'Daily Trend',
      weekShort: 'W{n}',
```

- [ ] **Step 2: Add Chinese keys**

In the `zh` `analytics` object, immediately after the `monthlyTrend: '每月趋势',` line (~741), add:

```js
      dailyTrend: '每日趋势',
      weekShort: '第{n}周',
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add dailyTrend and weekShort i18n keys"
```

---

### Task 2: TrendLineChart component  [model: claude-sonnet-4-6]

**Files:**
- Create: `src/components/TrendLineChart.jsx`
- Test: `tests/trendLineChart.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/trendLineChart.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrendLineChart from '../src/components/TrendLineChart';

vi.mock('../src/hooks/useIsDarkMode', () => ({
  useIsDarkMode: () => false,
}));

const basePoints = [
  { key: 'mon', value: 1800, xLabel: 'Mon', highlight: true },
  { key: 'tue', value: 0, xLabel: 'Tue' },
];

describe('TrendLineChart', () => {
  it('renders the title', () => {
    render(<TrendLineChart title="Daily Trend" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('Daily Trend')).toBeInTheDocument();
  });

  it('renders a value label for every point including zero', () => {
    render(<TrendLineChart title="t" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('30')).toBeInTheDocument(); // 1800s -> 30 min
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders an x-axis label for every point', () => {
    render(<TrendLineChart title="t" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
  });

  it('calls a point onClick when clicked', () => {
    const onClick = vi.fn();
    const points = [{ key: 'mon', value: 1800, xLabel: 'Mon', onClick }];
    render(<TrendLineChart title="t" points={points} timeUnit="minutes" />);
    fireEvent.click(screen.getByText('Mon'));
    expect(onClick).toHaveBeenCalled();
  });

  it('returns null for empty points', () => {
    const { container } = render(<TrendLineChart title="t" points={[]} timeUnit="minutes" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/trendLineChart.test.jsx`
Expected: FAIL — cannot resolve `../src/components/TrendLineChart`.

- [ ] **Step 3: Write the component**

Create `src/components/TrendLineChart.jsx`:

```jsx
import { formatDuration } from '../utils/formatTime';
import { useIsDarkMode } from '../hooks/useIsDarkMode';

// SVG layout constants (viewBox units, scaled to container width).
const PAD_X = 12; // horizontal padding so edge dots/labels are not clipped
const PAD_TOP = 16; // space above dots for value labels
const PAD_BOTTOM = 18; // space below for x-axis labels
const PLOT_W = 280;
const PLOT_H = 60;

/**
 * Shared trend line chart for the Weekly / Monthly / Yearly reports.
 *
 * points: array of { key, value (seconds), xLabel, highlight?, onClick? }.
 * Every point is rendered, including value === 0 (sits on the baseline).
 */
export default function TrendLineChart({ title, points, timeUnit, compactMode = false }) {
  const isDarkMode = useIsDarkMode();
  if (!points || points.length === 0) return null;

  const accent = isDarkMode ? '#6366f1' : '#3b82f6';
  const accentLight = isDarkMode ? '#a5b4fc' : '#93c5fd';

  const n = points.length;
  const maxVal = Math.max(...points.map((p) => p.value), 1);

  const coords = points.map((p, i) => ({
    ...p,
    x: n === 1 ? (PLOT_W + PAD_X * 2) / 2 : PAD_X + (i / (n - 1)) * PLOT_W,
    y: PAD_TOP + PLOT_H - (p.value / maxVal) * PLOT_H,
  }));

  const polylineStr = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const viewW = PLOT_W + PAD_X * 2;
  const viewH = PAD_TOP + PLOT_H + PAD_BOTTOM;

  return (
    <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
      <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-2">{title}</p>
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full">
        <polyline
          points={polylineStr}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((p, i) => {
          // Anchor end value labels inward so they don't clip at the edges.
          const valueAnchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
          return (
            <g
              key={p.key}
              onClick={p.onClick}
              style={{ cursor: p.onClick ? 'pointer' : 'default' }}
            >
              {/* Invisible hit area widens the tap target around the dot. */}
              <rect x={p.x - PAD_X} y={0} width={PAD_X * 2} height={viewH} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={p.highlight ? 5 : 4}
                fill={p.highlight ? accent : accentLight}
              />
              <text x={p.x} y={p.y - 8} textAnchor={valueAnchor} fontSize="9" fill="#6b7280">
                {formatDuration(p.value, timeUnit)}
              </text>
              <text
                x={p.x}
                y={PAD_TOP + PLOT_H + 14}
                textAnchor="middle"
                fontSize="9"
                fill={p.highlight ? accent : '#9ca3af'}
              >
                {p.xLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/trendLineChart.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/TrendLineChart.jsx tests/trendLineChart.test.jsx
git commit -m "feat: add shared TrendLineChart component"
```

---

### Task 3: Navigation plumbing (drill-down)  [model: claude-sonnet-4-6]

**Files:**
- Modify: `src/hooks/useReports.js` (signature line 22; `handleDayClick` ~111-118; return ~135-144)
- Modify: `src/App.jsx` (`useReports({...})` ~90-94; ref assignment ~102; comment ~85-88)
- Test: `tests/useReports.test.js` (lines 22-34)

- [ ] **Step 1: Update the useReports test (rename + new tests)**

In `tests/useReports.test.js`, replace the existing `handleReportDateChange` renderHook call (line ~23) — change `onNavigateToDaily: vi.fn()` to `onNavigateToSubpage: vi.fn()`. Then replace the whole `handleDayClick` test (lines ~29-35) with:

```js
  it('handleDayClick navigates to daily', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleDayClick('2026-01-10'); });
    expect(result.current.reportDate).toBe('2026-01-10');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('daily');
  });

  it('handleWeekClick sets weekStart and navigates to weekly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleWeekClick('2026-01-05'); });
    expect(result.current.weekStart).toBe('2026-01-05');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('weekly');
  });

  it('handleMonthClick sets monthStart and navigates to monthly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleMonthClick('2026-03-01'); });
    expect(result.current.monthStart).toBe('2026-03-01');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('monthly');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/useReports.test.js`
Expected: FAIL — `result.current.handleWeekClick` is not a function (and the daily test asserts a call that doesn't yet pass a `'daily'` arg).

- [ ] **Step 3: Update useReports.js signature and handlers**

In `src/hooks/useReports.js`:

3a. Change the signature (line ~22):

```js
export function useReports({ loadData, onNavigateToSubpage, items = [] }) {
```

3b. Replace the `handleDayClick` definition (lines ~111-118) with the three handlers:

```js
  const handleDayClick = useCallback(
    async (dateString) => {
      setReportDate(dateString);
      onNavigateToSubpage('daily');
      await loadReportData(dateString);
    },
    [loadReportData, onNavigateToSubpage],
  );

  const handleWeekClick = useCallback(
    async (newWeekStart) => {
      setWeekStart(newWeekStart);
      onNavigateToSubpage('weekly');
      await loadWeekData(newWeekStart);
    },
    [loadWeekData, onNavigateToSubpage],
  );

  const handleMonthClick = useCallback(
    async (newMonthStart) => {
      setMonthStart(newMonthStart);
      onNavigateToSubpage('monthly');
      await loadMonthData(newMonthStart);
    },
    [loadMonthData, onNavigateToSubpage],
  );
```

3c. In the returned object, add `handleWeekClick, handleMonthClick` to the line that currently reads:

```js
    handleEditTime, handleAddTime, handleDayClick,
```

so it becomes:

```js
    handleEditTime, handleAddTime, handleDayClick, handleWeekClick, handleMonthClick,
```

- [ ] **Step 4: Update App.jsx**

In `src/App.jsx`:

4a. Replace the comment block (lines ~85-88) and the `useReports` call (lines ~90-94) so the prop is `onNavigateToSubpage`:

```js
  // reportSubpageNavRef breaks the wiring cycle between useReports and useNavigation:
  // useNavigation owns setReportSubpage, but useReports needs onNavigateToSubpage which
  // calls setReportSubpage. We forward the call through a stable ref that gets assigned
  // after nav is created below.
  const reportSubpageNavRef = useRef(() => {});
  const reports = useReports({
    loadData,
    onNavigateToSubpage: (subpage) => reportSubpageNavRef.current(subpage),
    items,
  });
```

4b. Replace the ref assignment (line ~102):

```js
  reportSubpageNavRef.current = (subpage) => nav.setReportSubpage(subpage); // eslint-disable-line react-hooks/refs
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/useReports.test.js`
Expected: PASS (all tests including the 3 nav tests).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useReports.js src/App.jsx tests/useReports.test.js
git commit -m "feat: generalize report nav to onNavigateToSubpage with week/month drill-down"
```

---

### Task 4: Thread drill-down handlers through ReportTab  [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `src/components/ReportTab.jsx` (destructure ~18-25; MonthlyReport ~77-88; YearlyReport ~90-101)

- [ ] **Step 1: Destructure the new handlers**

In `src/components/ReportTab.jsx`, in the `const { ... } = reports;` block, add `handleWeekClick, handleMonthClick` to the existing line:

```js
    handleDayClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    handleWeekClick, handleMonthClick,
```

- [ ] **Step 2: Pass onWeekClick to MonthlyReport**

In the `<MonthlyReport ... />` element, add a prop after `onDayClick={handleDayClick}`:

```jsx
          onWeekClick={handleWeekClick}
```

- [ ] **Step 3: Pass onMonthClick to YearlyReport**

In the `<YearlyReport ... />` element, add a prop after `onDayClick={handleDayClick}`:

```jsx
          onMonthClick={handleMonthClick}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportTab.jsx
git commit -m "feat: pass week/month drill-down handlers to Monthly/Yearly reports"
```

---

### Task 5: WeeklyReport → TrendLineChart  [model: claude-sonnet-4-6]

**Files:**
- Modify: `src/components/WeeklyReport.jsx` (imports ~1-13; bar-chart consts ~53-58; chart JSX ~89-145; `maxDay` ~32)

- [ ] **Step 1: Add the import**

After the existing `import ReportItemBreakdown from './ReportItemBreakdown';` line, add:

```js
import TrendLineChart from './TrendLineChart';
```

- [ ] **Step 2: Remove obsolete chart math**

Delete the `maxDay` line (~32):

```js
  const maxDay = Math.max(...weekDays.map((d) => dayTotals[d] || 0), 1);
```

and delete the bar-chart dimension block (~53-58):

```js
  // Bar chart dimensions
  const BAR_W = 24;
  const BAR_GAP = 16;
  const CHART_W = 7 * (BAR_W + BAR_GAP);
  const CHART_H = 80;
  const LABEL_TOP = 16; // space above bars for minute labels
```

- [ ] **Step 3: Build the points array**

Immediately before the `return (` statement, add:

```js
  const trendPoints = weekDays.map((day, i) => ({
    key: day,
    value: dayTotals[day] || 0,
    xLabel: t(`analytics.weekdays.${WEEKDAY_KEYS[i]}`),
    highlight: day === today,
    onClick: () => onDayClick(day),
  }));
```

- [ ] **Step 4: Replace the bar-chart JSX**

Replace the entire `{/* Bar chart */}` block (the `{grandTotal > 0 && ( <div ...><svg ...> ... </svg></div> )}` spanning ~89-145) with:

```jsx
      {/* Trend chart */}
      {grandTotal > 0 && (
        <TrendLineChart
          title={t('analytics.dailyTrend')}
          points={trendPoints}
          timeUnit={timeUnit}
          compactMode={compactMode}
        />
      )}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds with no "is not defined" errors (confirms no leftover references to `BAR_W`, `maxDay`, etc).

- [ ] **Step 6: Commit**

```bash
git add src/components/WeeklyReport.jsx
git commit -m "feat: use TrendLineChart for Weekly report"
```

---

### Task 6: MonthlyReport → TrendLineChart  [model: claude-sonnet-4-6]

**Files:**
- Modify: `src/components/MonthlyReport.jsx` (signature ~20; imports ~1-16; trend-chart math ~92-107; chart JSX ~211-249)

- [ ] **Step 1: Add the import**

After `import ReportItemBreakdown from './ReportItemBreakdown';`, add:

```js
import TrendLineChart from './TrendLineChart';
```

- [ ] **Step 2: Add onWeekClick to the signature**

Change the component signature (~20) to include `onWeekClick`:

```js
function MonthlyReport({ items, monthStart, monthLogs, onMonthChange, onDayClick, onWeekClick, timeUnit, groupByCategory, compactMode = false }) {
```

- [ ] **Step 3: Remove obsolete trend math**

Delete the trend-dimension block (`maxWeek` through `polylineStr`, ~92-107):

```js
  const maxWeek = Math.max(...weekTotals, 1);
  const TREND_PAD_X = 6; // horizontal padding for dot radius
  const TREND_PAD_TOP = 16; // space for label text above dots
  const TREND_PAD_BOTTOM = 6;
  const TREND_W = 280;
  const TREND_H = 60;

  const trendPoints = weekTotals.map((v, i) => ({
    x:
      weekTotals.length === 1
        ? (TREND_W + TREND_PAD_X * 2) / 2
        : TREND_PAD_X + (i / (weekTotals.length - 1)) * TREND_W,
    y: TREND_PAD_TOP + TREND_H - (v / maxWeek) * TREND_H,
  }));

  const polylineStr = trendPoints.map((p) => `${p.x},${p.y}`).join(' ');
```

- [ ] **Step 4: Build the points array**

In the same spot (where the deleted block was), add. Note `weekStarts` and `weekTotals` are already computed above (~77-90):

```js
  const trendPoints = weekStarts.map((wStart, i) => {
    const wEnd = shiftDate(wStart, 6);
    return {
      key: wStart,
      value: weekTotals[i],
      xLabel: t('analytics.weekShort', { n: i + 1 }),
      highlight: isCurrentMonth && today >= wStart && today <= wEnd,
      onClick: () => onWeekClick(wStart),
    };
  });
```

- [ ] **Step 5: Replace the trend-chart JSX**

Replace the entire `{/* Weekly trend chart */}` block (the `{grandTotal > 0 && weekTotals.length > 1 && ( ... )}` spanning ~211-249) with:

```jsx
      {/* Weekly trend chart */}
      {grandTotal > 0 && (
        <TrendLineChart
          title={t('analytics.weeklyTrend')}
          points={trendPoints}
          timeUnit={timeUnit}
          compactMode={compactMode}
        />
      )}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds; no leftover references to `polylineStr`, `TREND_W`, `maxWeek`.

- [ ] **Step 7: Commit**

```bash
git add src/components/MonthlyReport.jsx
git commit -m "feat: use TrendLineChart for Monthly report with week drill-down"
```

---

### Task 7: YearlyReport → TrendLineChart  [model: claude-sonnet-4-6]

**Files:**
- Modify: `src/components/YearlyReport.jsx` (signature ~21; imports ~1-16; bar-chart math ~98-105; chart JSX ~257-318)

- [ ] **Step 1: Add the import**

After `import ReportItemBreakdown from './ReportItemBreakdown';`, add:

```js
import TrendLineChart from './TrendLineChart';
```

- [ ] **Step 2: Add onMonthClick to the signature**

Change the component signature (~21) to include `onMonthClick`:

```js
function YearlyReport({ items, yearStart, yearLogs, onYearChange, onDayClick, onMonthClick, timeUnit, groupByCategory, compactMode = false }) {
```

- [ ] **Step 3: Remove obsolete bar-chart dimensions**

Delete the bar-chart dimension block (~98-105):

```js
  const maxMonth = Math.max(...monthTotals, 1);
  const BAR_W = 20;
  const BAR_GAP = 4;
  const CHART_H = 80;
  const CHART_PAD_TOP = 18;
  const CHART_PAD_BOTTOM = 18;
  const chartW = 12 * (BAR_W + BAR_GAP) - BAR_GAP;
  const chartTotalH = CHART_PAD_TOP + CHART_H + CHART_PAD_BOTTOM;
```

Keep the `monthShortLabels` line (~107) — it is still used.

- [ ] **Step 4: Build the points array**

Immediately after the `const monthShortLabels = ...` line, add:

```js
  const trendPoints = monthTotals.map((total, i) => {
    const mStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
    return {
      key: mStart,
      value: total,
      xLabel: monthShortLabels[i],
      highlight: isCurrentYear && mStart.slice(0, 7) === today.slice(0, 7),
      onClick: () => onMonthClick(mStart),
    };
  });
```

- [ ] **Step 5: Replace the bar-chart JSX**

Replace the entire `{/* Monthly bar chart */}` block (the `{grandTotal > 0 && ( <div ...><svg ...> ... </svg></div> )}` spanning ~257-318) with:

```jsx
      {/* Monthly trend chart */}
      {grandTotal > 0 && (
        <TrendLineChart
          title={t('analytics.monthlyTrend')}
          points={trendPoints}
          timeUnit={timeUnit}
          compactMode={compactMode}
        />
      )}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds; no leftover references to `chartW`, `BAR_W`, `maxMonth`.

- [ ] **Step 7: Commit**

```bash
git add src/components/YearlyReport.jsx
git commit -m "feat: use TrendLineChart for Yearly report with month drill-down"
```

---

### Task 8: Full verification  [model: claude-haiku-4-5-20251001]

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (includes `trendLineChart` and `useReports`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (no unused vars from removed chart code).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Provide manual verification steps to the user**

Print this checklist for the user (manual, per project convention — no browser automation):

1. Report → Weekly: line chart with 7 day points (zeros on baseline), value label above every point incl. "0", weekday labels below, today highlighted. Click a day → Daily report for that day.
2. Report → Monthly: line chart with one point per week (W1, W2…), the week containing today highlighted (current month only). Click a week → Weekly report for that week.
3. Report → Yearly: line chart with 12 month points, current month highlighted (current year only). Click a month → Monthly report for that month.
4. A period with no practice still shows a point at zero (with "0" label).
5. Empty period (no data at all): chart hidden, "No practice this …" message shows.
6. Toggle dark mode and language (E/C) — chart colors and labels update.

---

## Self-Review Notes

- **Spec coverage:** shared component (Task 2), zero points always rendered (Task 2 Step 3 — every point mapped), value label every point incl "0" (Task 2), x-labels per report (Tasks 5/6/7), highlight current period (Tasks 5/6/7), all points clickable + drill-down (Tasks 3/4/5/6/7), i18n keys (Task 1), `grandTotal > 0` card gate (Tasks 5/6/7). All covered.
- **Type consistency:** `points[]` shape `{ key, value, xLabel, highlight?, onClick? }` is identical across component and all three producers. Handler names `handleWeekClick`/`handleMonthClick` and props `onWeekClick`/`onMonthClick` consistent across useReports → ReportTab → reports.
- **Naming:** Weekly reuses the variable name `trendPoints` (its old bar code did not use that name; Monthly's old `trendPoints` is deleted in Task 6 Step 3 before the new one is added in Step 4 — no collision).
