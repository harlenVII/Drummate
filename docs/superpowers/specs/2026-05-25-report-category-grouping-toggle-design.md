# Report Category Grouping Toggle Design

**Date:** 2026-05-25
**Feature:** Settings toggle to control category grouping across all report views

## Context

`DailyReport` already groups items under "Fundamentals" / "Songs" section headers (implemented in the earlier 2026-05-12 spec). The generated report text (`generateReportText`) also includes category headers.

`WeeklyReport`, `MonthlyReport`, and `YearlyReport` currently show a flat duration-sorted list with no category grouping.

This spec adds a user-controlled toggle in Settings that:
- When **ON**: all four report views group by category (daily keeps existing behavior; weekly/monthly/yearly adopt the same pattern).
- When **OFF**: all four report views show a flat sorted list; daily loses its current always-on grouping.

The generated report text produced by DailyReport's "Generate Report" modal follows the same toggle.

## Setting

**Label:** "Group by Category" (i18n key `groupByCategory`)
**Storage:** `localStorage['drummate_group_by_category']` — `'true'` / `'false'`, default `true` (preserves the existing always-on grouping in DailyReport for users who never open Settings).
**Toggle UI:** Standard on/off switch in `SettingsPanel`, matching the AI Coach / Hands-Free pattern (no description text needed).

## Data Flow

```
App.jsx
  ├─ groupByCategory state ← localStorage['drummate_group_by_category']
  ├─ SettingsPanel  (groupByCategory, onToggleGroupByCategory)
  ├─ DailyReport    (groupByCategory)
  ├─ WeeklyReport   (groupByCategory)
  ├─ MonthlyReport  (groupByCategory)
  └─ YearlyReport   (groupByCategory)
```

`onToggleGroupByCategory` flips state and writes the new value to localStorage.

## Grouping Logic (shared across all reports)

After building each report's `breakdown` array:
1. Split into `fundamentals` (`category === 'fundamentals'` or `!category`) and `songs` (`category === 'songs'`).
2. Each group sorted by duration descending (already the case for the overall breakdown).
3. Only render a section if the group is non-empty.

**Section header** (same style as DailyReport already uses):
- Small gray uppercase label (left) + subtotal with unit (right)
- No card/shadow — plain row of text

**When OFF:** render `breakdown` as a flat list in the existing style (no section headers).

## Changes Per File

### `src/App.jsx`

- Read `localStorage['drummate_group_by_category']` on init (default `true`).
- `groupByCategory` state + `handleToggleGroupByCategory` callback.
- Pass both to `SettingsPanel` and pass `groupByCategory` to all four report components.

### `src/components/SettingsPanel.jsx`

- Accept `groupByCategory` and `onToggleGroupByCategory` props.
- Add toggle row after the Time Unit row (they are visually related report-display settings).

### `src/components/DailyReport.jsx`

- Accept `groupByCategory` prop.
- Existing category-split rendering (`fundamentals`/`songs` sections) is already present — wrap it in `groupByCategory ?  grouped : flat` conditional.
- `generateReportText`: pass `groupByCategory` through and gate the existing category-header branches on it.

### `src/components/WeeklyReport.jsx`

- Accept `groupByCategory` prop.
- Add `category` to the `breakdown` map (currently omitted).
- Split into `fundamentals` / `songs` arrays (same logic as DailyReport).
- Render: when ON, two labeled sections; when OFF, existing flat `breakdown.map(...)`.

### `src/components/MonthlyReport.jsx`

- Same changes as WeeklyReport.

### `src/components/YearlyReport.jsx`

- Same changes as WeeklyReport.

## i18n

Add one new key to `en` and `zh` in `LanguageContext.jsx`:

```
en: { groupByCategory: 'Group by Category' }
zh: { groupByCategory: '按分类分组' }
```

No other new keys needed. Section labels use the existing `categories.fundamentals` / `categories.songs`.

## Edge Cases

- Items with no `category` field (legacy data) fall into Fundamentals.
- If a period has data for only one category, only that section header is rendered.
- If grand total is zero, the existing empty-state message is shown; no category sections rendered.
- The ReportGeneratorModal (date-range report) is out of scope — it already has its own category-grouping logic from the 2026-05-12 spec and does not need to change.

## Non-Goals

- No cloud sync for this preference — it is device-local like `timeUnit` and `theme`.
- No change to the Stats subpage.
- No change to how items are stored or categorized.
