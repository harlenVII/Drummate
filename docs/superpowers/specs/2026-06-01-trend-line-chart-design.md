# Trend Line Chart Consolidation — Design

**Date:** 2026-06-01
**Status:** Approved

## Problem

The Weekly, Monthly, and Yearly report tabs each render a hand-rolled SVG
"trend" chart, but they are inconsistent:

- **Weekly** ([WeeklyReport.jsx](../../../src/components/WeeklyReport.jsx)) — bar chart, 7 per-day bars.
- **Yearly** ([YearlyReport.jsx](../../../src/components/YearlyReport.jsx)) — bar chart, 12 per-month bars (with a gray background track behind each).
- **Monthly** ([MonthlyReport.jsx](../../../src/components/MonthlyReport.jsx)) — line chart (polyline + dots), week-by-week totals, only shown when there are 2+ weeks.

We want one consistent chart across all three. **The line chart is the golden
standard** — all three should use a shared line-chart component.

## Solution

A single reusable `TrendLineChart` component used by Weekly, Monthly, and
Yearly. It always renders a point per period — including periods with **zero**
practice (a point on the baseline) — connected by a polyline.

### New component: `src/components/TrendLineChart.jsx`

Owns the card wrapper, title, and the SVG chart so all three reports look
identical.

```jsx
<TrendLineChart
  title={t('analytics.dailyTrend')}        // per-report title
  points={[{ key, value, xLabel, highlight, onClick }]}  // one entry per period
  timeUnit={timeUnit}
  compactMode={compactMode}
/>
```

`points[]` entry shape:

| Field | Type | Meaning |
|-------|------|---------|
| `key` | string | React key |
| `value` | number | duration in **seconds** for that period (0 allowed) |
| `xLabel` | string | label drawn below the point |
| `highlight` | boolean | true for the "current" period (today / current week / current month) |
| `onClick` | function | called when the point is tapped/clicked |

Rendering rules:

- **Always render every point**, including `value === 0`. Zero points sit on the
  baseline.
- A **polyline** connects all points in order.
- A **dot** at each point. The `highlight` point uses the solid accent color
  (`#3b82f6` light / `#6366f1` dark) and a slightly larger radius; non-highlight
  points use the lighter accent (`#93c5fd` light / `#a5b4fc` dark).
- A **value label above every point**, including `"0"`, via
  `formatDuration(value, timeUnit)`. Small font (~7–9px) to limit crowding.
- An **x-axis label below every point** (`xLabel`).
- Each point is **clickable**: render an invisible padded hit-rect around the
  dot so it is easy to tap, wired to `point.onClick`.
- Dark mode resolved internally via `useIsDarkMode()` (no `isDarkMode` prop).
- Single-point edge case: if there is exactly one point, center it horizontally
  (mirrors the existing monthly `weekTotals.length === 1` centering).

The **card renders only when `grandTotal > 0`** (the per-report total card
already shows a "no data this period" message for the empty case). Within the
card, every period point is still drawn even at zero.

### Per-report wiring

| Report | Points | `xLabel` | `highlight` | `onClick` → |
|--------|--------|----------|-------------|-------------|
| Weekly | 7 days | weekday name (`analytics.weekdays.*`) | today | daily report for that day (existing `handleDayClick`) |
| Monthly | 4–5 weeks | `W1`, `W2`, … (`analytics.weekShort`) | week containing today (current month only) | **weekly** report for that week (new `handleWeekClick`) |
| Yearly | 12 months | month name (`analytics.months.*`) | current month (current year only) | **monthly** report for that month (new `handleMonthClick`) |

Each report keeps its existing per-period total computation (`dayTotals`,
`weekTotals`, `monthTotals`) and maps it into the `points[]` shape. The old
inline bar/line SVG blocks are removed. Heatmaps in Monthly and Yearly are
untouched.

### Navigation plumbing (drill-down)

Generalize the existing single-purpose ref in
[App.jsx](../../../src/App.jsx) (lines ~89–102): rename `onNavigateToDaily`
to `onNavigateToSubpage(subpage)` and assign
`reportSubpageNavRef.current = (subpage) => nav.setReportSubpage(subpage)`.

In [useReports.js](../../../src/hooks/useReports.js):

- Refactor `handleDayClick` to call `onNavigateToSubpage('daily')`.
- Add `handleWeekClick(weekStart)` → `setWeekStart` + `onNavigateToSubpage('weekly')` + `loadWeekData(weekStart)`.
- Add `handleMonthClick(monthStart)` → `setMonthStart` + `onNavigateToSubpage('monthly')` + `loadMonthData(monthStart)`.

Export the two new handlers and thread them through
[ReportTab.jsx](../../../src/components/ReportTab.jsx) to Monthly (`onWeekClick`)
and Yearly (`onMonthClick`).

### i18n

Add to both `en` and `zh` in
[LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx):

- `analytics.dailyTrend` — Weekly chart title (e.g. "Daily breakdown" / "每日明细").
- `analytics.weekShort` — `"W{n}"` (en) / `"第{n}周"` (zh), interpolated per week index.

Reuse existing `analytics.weeklyTrend` (Monthly title) and
`analytics.monthlyTrend` (Yearly title).

## Trade-offs / Notes

- **Label crowding (Yearly):** 12 points each with a value label, at ~7px font
  (matching today's yearly bar labels). Tight but legible; revisit if testing
  shows overlap.
- **All-clickable points:** previously only Weekly bars were clickable. Now
  Monthly week points and Yearly month points drill down one level
  (week → weekly, month → monthly), which is new navigation behavior.
- Scope: one new component plus edits to 3 reports, `useReports`, `App`,
  `ReportTab`, and the i18n file. **No DB or sync changes.**

## Out of Scope

- Daily and Stats report subpages.
- Any charting library — charts stay hand-rolled SVG.
- Heatmaps (Monthly/Yearly) remain as-is.

## Testing

- `npm run build` and `npm run lint` pass.
- Weekly/Monthly/Yearly each show the line chart with a point per period,
  including zero days/weeks/months.
- Value labels appear above every point including "0".
- Clicking a Weekly day → daily report for that day; a Monthly week → weekly
  report for that week; a Yearly month → monthly report for that month.
- Current period (today / current week / current month) is visually highlighted.
- Chart hidden when the period has no data at all (grandTotal === 0).
- Dark mode and language toggle both render correctly.
- Manual verification only (no browser automation), per project convention.
