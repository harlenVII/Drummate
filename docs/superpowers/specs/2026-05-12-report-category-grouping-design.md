# Report Category Grouping Design

**Date:** 2026-05-12  
**Feature:** Group items by category (Fundamentals / Songs) in DailyReport and ReportGeneratorModal

## Overview

Both the Daily Report view and the date-range Report Generator Modal currently list practice items sorted by duration descending, with no category distinction. This change adds section headers ("Fundamentals", "Songs") that group items within each view, mirroring the Practice tab's category layout.

## Approach

**Option A — Section headers in the flat list.** A labeled header row (with category name and subtotal) is inserted before each group. Items within each group remain sorted by duration descending. The grand total card at the top is unchanged. This is the same visual pattern already used in `PracticeItemList`.

## Scope

Two files change:

- `src/components/DailyReport.jsx`
- `src/components/ReportGeneratorModal.jsx`

No new props, no new DB calls, no new context. Both components already receive `items` (with `category` field) from `App.jsx`.

## DailyReport

### Grouping logic

After building `breakdown` (items with `duration > 0`, each with `{ id, name, duration, category }`), split into two ordered groups:

1. **Fundamentals** — `category === 'fundamentals'` or `category === undefined` (legacy/unset)
2. **Songs** — `category === 'songs'`

Each group is sorted by duration descending. Groups with zero entries are omitted entirely (no empty header rendered).

`breakdown` must carry `category` from the source `items` array. Currently it maps only `{ id, name, duration }` — add `category` to the map.

### Rendering

Replace the flat `breakdown.map(...)` with two passes, one per non-empty group:

```
[Section header: "Fundamentals · {subtotal} {unit}"]
  item card
  item card
[Section header: "Songs · {subtotal} {unit}"]
  item card
```

Section header style: small gray uppercase label with subtotal on the right, consistent with category headers in `PracticeItemList`. No card/shadow — just a row of text.

### Plain-text report (`generateReportText`)

Update to group items under category labels:

```
Date: 2026/05/12
Total: 90 min

Fundamentals:
Rudiments: 45 min
Single strokes: 20 min

Songs:
Enter Sandman: 25 min
```

If a category has no items, omit that section entirely.

## ReportGeneratorModal

### `buildReportText` changes

Currently looks up items by `itemId` to get `name`. Also look up `category` from the same item object.

Group breakdown entries into Fundamentals (category `'fundamentals'` or `undefined`) and Songs (`'songs'`), each sorted by duration descending.

Plain-text output format mirrors DailyReport above:

```
Date: 2026/05/01 – 2026/05/12
Total: 5h 30min

Fundamentals:
Rudiments: 3h 10min

Songs:
Enter Sandman: 2h 20min
```

The `<pre>` preview block in the modal shows this same text. The copy button copies it as-is — no additional changes needed there.

## Uncategorized items

Items with `category === undefined` (legacy data) are treated as Fundamentals.

## Translations

No new translation keys needed. `t('categories.fundamentals')` and `t('categories.songs')` already exist in both `en` and `zh`.

## No-data cases

- If only one category has logged time for the period, only that section header is shown.
- If no time is logged at all, the existing "No practice recorded" message is shown unchanged.
