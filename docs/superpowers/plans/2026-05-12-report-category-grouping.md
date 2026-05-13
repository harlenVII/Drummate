# Report Category Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group practice items under "Fundamentals" and "Songs" section headers in DailyReport and ReportGeneratorModal, matching the Practice tab's visual language.

**Architecture:** Both components already receive `items` (with `category` field) from `App.jsx`. No new props or DB calls needed. DailyReport splits its `breakdown` array into two groups and renders a header row before each. ReportGeneratorModal's `buildReportText` does the same for plain-text output. Items with `category === undefined` are treated as Fundamentals.

**Tech Stack:** React 19, Tailwind CSS v4, existing `t()` i18n helper (keys `categories.fundamentals` / `categories.songs` already exist in both `en` and `zh`)

---

## Files

- Modify: `src/components/DailyReport.jsx`
- Modify: `src/components/ReportGeneratorModal.jsx`

---

### Task 1: DailyReport — add category to breakdown and render grouped sections

**Files:**
- Modify: `src/components/DailyReport.jsx`

- [ ] **Step 1: Add `category` to the breakdown map**

In [DailyReport.jsx:34](src/components/DailyReport.jsx#L34), change the `.map()` call from:

```js
const breakdown = items
  .map((item) => ({ id: item.id, name: item.name, duration: Math.max(0, itemTotals[item.id] || 0) }))
  .filter((e) => e.duration > 0)
  .sort((a, b) => b.duration - a.duration);
```

to:

```js
const breakdown = items
  .map((item) => ({ id: item.id, name: item.name, category: item.category, duration: Math.max(0, itemTotals[item.id] || 0) }))
  .filter((e) => e.duration > 0)
  .sort((a, b) => b.duration - a.duration);
```

- [ ] **Step 2: Derive grouped arrays below the `breakdown` declaration**

Add these two lines immediately after the `breakdown` declaration (after line 36):

```js
const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
const songs = breakdown.filter((e) => e.category === 'songs');
```

- [ ] **Step 3: Extract a helper to render an item card**

Add this function inside `DailyReport` (before the `return` statement) to avoid repeating JSX for both groups:

```js
function renderItemCard(entry) {
  const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
  return (
    <div
      key={entry.id}
      className={`bg-white rounded-lg shadow-sm p-4 transition-colors ${
        editMode ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''
      }`}
      onClick={editMode ? () => onEditTime(entry.id, entry.name, entry.duration) : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-800">{entry.name}</span>
        <div className="text-right text-gray-600">
          <div>{formatDuration(entry.duration, timeUnit)} {t(timeUnit)}</div>
          {entry.duration > 0 && (
            <div className="text-xs text-gray-500">({percentage}%)</div>
          )}
        </div>
      </div>
      {grandTotal > 0 && (
        <div className="mt-2 bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-blue-500 rounded-full h-1.5"
            style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace the flat `breakdown.map(...)` render with grouped sections**

Find the comment `{/* Per-item breakdown */}` and the `breakdown.map(...)` block that follows it (lines 131–165 in the original). Replace that entire block with:

```jsx
{/* Per-item breakdown */}
{fundamentals.length > 0 && (
  <>
    <div className="flex justify-between items-center px-1 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t('categories.fundamentals')}
      </span>
      <span className="text-xs text-gray-400">
        {formatDuration(fundamentals.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
      </span>
    </div>
    {fundamentals.map(renderItemCard)}
  </>
)}

{songs.length > 0 && (
  <>
    <div className="flex justify-between items-center px-1 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t('categories.songs')}
      </span>
      <span className="text-xs text-gray-400">
        {formatDuration(songs.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
      </span>
    </div>
    {songs.map(renderItemCard)}
  </>
)}
```

- [ ] **Step 5: Verify build succeeds**

```bash
npm run build
```

Expected: exits with code 0, no errors.

- [ ] **Step 6: Start dev server and manually verify**

```bash
npm run dev
```

Open `http://localhost:5173`, go to Report → Daily tab.
- If you have items in both categories with logs today, confirm "FUNDAMENTALS" header appears above its items and "SONGS" above its items.
- Each header shows the subtotal for that category.
- Grand total card at top is unchanged.
- If only one category has logs, only that header appears.

- [ ] **Step 7: Commit**

```bash
git add src/components/DailyReport.jsx
git commit -m "feat: group daily report items by category with section headers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: DailyReport — update `generateReportText` for grouped plain-text output

**Files:**
- Modify: `src/components/DailyReport.jsx`

- [ ] **Step 1: Replace `generateReportText` with grouped output**

Find the `generateReportText` function at the bottom of [DailyReport.jsx](src/components/DailyReport.jsx) (after the component export) and replace it entirely with:

```js
function generateReportText(reportDate, grandTotal, breakdown, t, timeUnit) {
  const [year, month, day] = reportDate.split('-');
  const formattedDate = `${year}/${month}/${day}`;
  const fmt = (d) => `${formatDuration(d, timeUnit)} ${t(timeUnit)}`;

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');

  const lines = [
    `${t('date')}: ${formattedDate}`,
    `${t('total')}: ${fmt(grandTotal)}`,
  ];

  if (fundamentals.length > 0) {
    lines.push('');
    lines.push(`${t('categories.fundamentals')}:`);
    for (const entry of fundamentals) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  if (songs.length > 0) {
    lines.push('');
    lines.push(`${t('categories.songs')}:`);
    for (const entry of songs) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exits with code 0, no errors.

- [ ] **Step 3: Manually verify the report modal**

With the dev server running, on the Daily Report page (with logged items in both categories):
- Click "Generate Report".
- Confirm the modal shows grouped plain text, e.g.:
  ```
  Date: 2026/05/12
  Total: 90 min

  Fundamentals:
  Rudiments: 45 min

  Songs:
  Enter Sandman: 45 min
  ```
- Click "Copy to Clipboard" and paste somewhere to confirm the grouped text is what's copied.

- [ ] **Step 4: Commit**

```bash
git add src/components/DailyReport.jsx
git commit -m "feat: group daily report plain-text output by category

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: ReportGeneratorModal — update `buildReportText` for grouped output

**Files:**
- Modify: `src/components/ReportGeneratorModal.jsx`

- [ ] **Step 1: Add `category` to the breakdown map in `buildReportText`**

Find `buildReportText` at the bottom of [ReportGeneratorModal.jsx](src/components/ReportGeneratorModal.jsx). Change the breakdown `.map()` from:

```js
const breakdown = Object.entries(totals)
  .map(([itemId, duration]) => ({
    name: items.find((i) => i.id === Number(itemId))?.name,
    duration,
  }))
  .filter((e) => e.name != null && e.duration > 0)
  .sort((a, b) => b.duration - a.duration);
```

to:

```js
const breakdown = Object.entries(totals)
  .map(([itemId, duration]) => {
    const item = items.find((i) => i.id === Number(itemId));
    return { name: item?.name, category: item?.category, duration };
  })
  .filter((e) => e.name != null && e.duration > 0)
  .sort((a, b) => b.duration - a.duration);
```

- [ ] **Step 2: Replace the return statement in `buildReportText` with grouped output**

Find the existing return block:

```js
return [
  `${t('date')}: ${dateLabel}`,
  `${t('total')}: ${fmt(grandTotal)}`,
  ...breakdown.map((e) => `${e.name}: ${fmt(e.duration)}`),
].join('\n');
```

Replace it with:

```js
const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
const songs = breakdown.filter((e) => e.category === 'songs');

const lines = [
  `${t('date')}: ${dateLabel}`,
  `${t('total')}: ${fmt(grandTotal)}`,
];

if (fundamentals.length > 0) {
  lines.push('');
  lines.push(`${t('categories.fundamentals')}:`);
  for (const entry of fundamentals) {
    lines.push(`${entry.name}: ${fmt(entry.duration)}`);
  }
}

if (songs.length > 0) {
  lines.push('');
  lines.push(`${t('categories.songs')}:`);
  for (const entry of songs) {
    lines.push(`${entry.name}: ${fmt(entry.duration)}`);
  }
}

return lines.join('\n');
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: exits with code 0, no errors.

- [ ] **Step 4: Manually verify the Report Generator modal**

With the dev server running, go to Report → Stats tab → "Generate Report" button.
- Set a date range that includes logs for both categories.
- Click "Generate".
- Confirm the `<pre>` block shows:
  ```
  Date: 2026/05/01 – 2026/05/12
  Total: 5h 30min

  Fundamentals:
  Rudiments: 3h 10min

  Songs:
  Enter Sandman: 2h 20min
  ```
- Click "Copy to Clipboard" and paste somewhere to confirm the grouped text is copied.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportGeneratorModal.jsx
git commit -m "feat: group date-range report plain-text output by category

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
