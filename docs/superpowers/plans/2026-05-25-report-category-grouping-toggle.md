# Report Category Grouping Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Group by Category" toggle in Settings that controls whether all four report views (daily, weekly, monthly, yearly) group items under Fundamentals/Songs section headers, and whether the daily generated report text includes category headers.

**Architecture:** A `groupByCategory` boolean is stored in `localStorage['drummate_group_by_category']` (default `true`) and held as state in `App.jsx`. It is passed as a prop to `SettingsPanel` and all four report components. Daily report already has grouped rendering; this makes it conditional. Weekly/monthly/yearly get the same pattern added behind the same condition.

**Tech Stack:** React 19, Tailwind v4, localStorage for persistence

---

## File Map

| File | Change |
|------|--------|
| `src/contexts/LanguageContext.jsx` | Add `groupByCategory` i18n key (en + zh) |
| `src/App.jsx` | Add state, localStorage read/write, pass prop to SettingsPanel + 4 report components |
| `src/components/SettingsPanel.jsx` | Add toggle row for groupByCategory |
| `src/components/DailyReport.jsx` | Gate existing grouped rendering + `generateReportText` on `groupByCategory` prop |
| `src/components/WeeklyReport.jsx` | Add `category` to breakdown map, extract renderItemCard, add conditional grouped rendering |
| `src/components/MonthlyReport.jsx` | Same as WeeklyReport |
| `src/components/YearlyReport.jsx` | Same as WeeklyReport |

---

### Task 1: Add i18n key

**Files:**
- Modify: `src/contexts/LanguageContext.jsx:45` (en block, near `timeUnit`)
- Modify: `src/contexts/LanguageContext.jsx:398` (zh block, near `timeUnit`)

- [ ] **Step 1: Add English key after `timeUnit: 'Time Unit'`**

Find line 45 in `src/contexts/LanguageContext.jsx`:
```js
    timeUnit: 'Time Unit',
```
Change to:
```js
    timeUnit: 'Time Unit',
    groupByCategory: 'Group by Category',
```

- [ ] **Step 2: Add Chinese key after `timeUnit: '时间单位'`**

Find the zh block line ~398 in `src/contexts/LanguageContext.jsx`:
```js
    timeUnit: '时间单位',
```
Change to:
```js
    timeUnit: '时间单位',
    groupByCategory: '按分类分组',
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add groupByCategory i18n key"
```

---

### Task 2: Add state and prop wiring in App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `groupByCategory` state after the `timeUnit` state block (around line 91)**

Find:
```js
  const [theme, setThemeState] = useState(getTheme);
```
Insert before it:
```js
  const [groupByCategory, setGroupByCategory] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_group_by_category');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
```

- [ ] **Step 2: Add localStorage persist effect after the existing timeUnit persist effect**

Find the block that contains:
```js
    localStorage.setItem('drummate_time_unit', timeUnit);
```
In that same `useEffect` (or near it), add a separate effect:
```js
  useEffect(() => {
    try { localStorage.setItem('drummate_group_by_category', String(groupByCategory)); } catch {}
  }, [groupByCategory]);
```

- [ ] **Step 3: Pass `groupByCategory` prop to DailyReport**

Find:
```jsx
                <DailyReport
                  items={items.filter(i => !i.trashed)}
                  allItems={items.filter(i => !i.trashed)}
                  reportDate={reportDate}
                  reportLogs={reportLogs}
                  onDateChange={handleReportDateChange}
                  onEditTime={handleEditTime}
                  onAddTime={handleAddTime}
                  onMergeToYesterday={handleMergeToYesterday}
                  timeUnit={timeUnit}
                />
```
Change to:
```jsx
                <DailyReport
                  items={items.filter(i => !i.trashed)}
                  allItems={items.filter(i => !i.trashed)}
                  reportDate={reportDate}
                  reportLogs={reportLogs}
                  onDateChange={handleReportDateChange}
                  onEditTime={handleEditTime}
                  onAddTime={handleAddTime}
                  onMergeToYesterday={handleMergeToYesterday}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                />
```

- [ ] **Step 4: Pass `groupByCategory` prop to WeeklyReport**

Find:
```jsx
                <WeeklyReport
                  items={items.filter(i => !i.trashed)}
                  weekStart={weekStart}
                  weekLogs={weekLogs}
                  onWeekChange={handleWeekChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                />
```
Change to:
```jsx
                <WeeklyReport
                  items={items.filter(i => !i.trashed)}
                  weekStart={weekStart}
                  weekLogs={weekLogs}
                  onWeekChange={handleWeekChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                />
```

- [ ] **Step 5: Pass `groupByCategory` prop to MonthlyReport**

Find:
```jsx
                <MonthlyReport
                  items={items.filter(i => !i.trashed)}
                  monthStart={monthStart}
                  monthLogs={monthLogs}
                  onMonthChange={handleMonthChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                />
```
Change to:
```jsx
                <MonthlyReport
                  items={items.filter(i => !i.trashed)}
                  monthStart={monthStart}
                  monthLogs={monthLogs}
                  onMonthChange={handleMonthChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                />
```

- [ ] **Step 6: Pass `groupByCategory` prop to YearlyReport**

Find:
```jsx
                <YearlyReport
                  items={items.filter(i => !i.trashed)}
                  yearStart={yearStart}
                  yearLogs={yearLogs}
                  onYearChange={handleYearChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                />
```
Change to:
```jsx
                <YearlyReport
                  items={items.filter(i => !i.trashed)}
                  yearStart={yearStart}
                  yearLogs={yearLogs}
                  onYearChange={handleYearChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                />
```

- [ ] **Step 7: Pass `groupByCategory` and `onToggleGroupByCategory` to SettingsPanel**

Find the SettingsPanel usage block that ends with:
```jsx
        theme={theme}
        onThemeChange={setTheme}
      />
```
Add before `theme={theme}`:
```jsx
        groupByCategory={groupByCategory}
        onToggleGroupByCategory={() => setGroupByCategory((v) => !v)}
```

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire groupByCategory state and props in App"
```

---

### Task 3: Add toggle in SettingsPanel

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add props to function signature**

Find:
```js
function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  theme,
  onThemeChange,
  user,
  timeUnit,
  onToggleTimeUnit,
```
Change to:
```js
function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  theme,
  onThemeChange,
  user,
  timeUnit,
  onToggleTimeUnit,
  groupByCategory,
  onToggleGroupByCategory,
```

- [ ] **Step 2: Add the toggle row after the Time Unit row**

Find the closing of the Time Unit section:
```jsx
          </div>

          {/* AI Coach */}
```
Insert between them:
```jsx
          {/* Group by Category */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{t('groupByCategory')}</span>
            <button
              onClick={onToggleGroupByCategory}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                groupByCategory ? 'bg-blue-600 dark:bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'
              } cursor-pointer`}
              role="switch"
              aria-checked={groupByCategory}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  groupByCategory ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

```

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat: add Group by Category toggle in Settings"
```

---

### Task 4: Gate DailyReport grouped rendering on prop

**Files:**
- Modify: `src/components/DailyReport.jsx`

- [ ] **Step 1: Add `groupByCategory` to function signature**

Find:
```js
function DailyReport({ items, allItems, reportDate, reportLogs, onDateChange, onEditTime, onAddTime, onMergeToYesterday, timeUnit }) {
```
Change to:
```js
function DailyReport({ items, allItems, reportDate, reportLogs, onDateChange, onEditTime, onAddTime, onMergeToYesterday, timeUnit, groupByCategory }) {
```

- [ ] **Step 2: Replace the per-item breakdown section with a conditional**

Find the per-item breakdown section (the block starting after the grand total card, before the "Add time button"):
```jsx
      {/* Per-item breakdown */}
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
          {fundamentals.map(renderItemCard)}
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
          {songs.map(renderItemCard)}
        </>
      )}

      {items.length === 0 && (
```
Replace with:
```jsx
      {/* Per-item breakdown */}
      {groupByCategory ? (
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
              {fundamentals.map(renderItemCard)}
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
              {songs.map(renderItemCard)}
            </>
          )}
        </>
      ) : (
        breakdown.map(renderItemCard)
      )}

      {items.length === 0 && (
```

- [ ] **Step 3: Gate `generateReportText` category output on `groupByCategory`**

Find the `generateReportText` function signature:
```js
function generateReportText(reportDate, grandTotal, breakdown, t, timeUnit) {
```
Change to:
```js
function generateReportText(reportDate, grandTotal, breakdown, t, timeUnit, groupByCategory) {
```

Find the body of `generateReportText` that builds the lines array. Replace everything after `const lines = [...]`:
```js
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
```
Change to:
```js
  const lines = [
    `${t('date')}: ${formattedDate}`,
    `${t('total')}: ${fmt(grandTotal)}`,
  ];

  if (groupByCategory) {
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
  } else {
    lines.push('');
    for (const entry of breakdown) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  return lines.join('\n');
```

- [ ] **Step 4: Pass `groupByCategory` to the two `generateReportText` call sites**

Find both occurrences of `generateReportText(reportDate, grandTotal, breakdown, t, timeUnit)` in the JSX (inside `showModal` block) and change each to:
```js
generateReportText(reportDate, grandTotal, breakdown, t, timeUnit, groupByCategory)
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DailyReport.jsx
git commit -m "feat: gate DailyReport category grouping on groupByCategory prop"
```

---

### Task 5: Add conditional grouping to WeeklyReport

**Files:**
- Modify: `src/components/WeeklyReport.jsx`

- [ ] **Step 1: Add `groupByCategory` to function signature**

Find:
```js
function WeeklyReport({ items, weekStart, weekLogs, onWeekChange, onDayClick, timeUnit }) {
```
Change to:
```js
function WeeklyReport({ items, weekStart, weekLogs, onWeekChange, onDayClick, timeUnit, groupByCategory }) {
```

- [ ] **Step 2: Add `category` to the breakdown map**

Find:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);
```
Change to:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');
```

- [ ] **Step 3: Extract inline item render to a named function**

Before the `return (` statement, add:

```js
  function renderItemCard(entry) {
    const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
    return (
      <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <span
            className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
          >
            {entry.name}
          </span>
          <div
            className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
          >
            <div>
              {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
              {t(timeUnit)}
            </div>
            {entry.duration > 0 && (
              <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
            )}
          </div>
        </div>
        {entry.duration > 0 && grandTotal > 0 && (
          <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
              style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 4: Replace the per-item breakdown section**

Find:
```jsx
      {/* Per-item breakdown */}
      {breakdown.map((entry) => {
        const percentage =
          grandTotal > 0
            ? Math.round((entry.duration / grandTotal) * 100)
            : 0;
        return (
          <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
              >
                {entry.name}
              </span>
              <div
                className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <div>
                  {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
                  {t(timeUnit)}
                </div>
                {entry.duration > 0 && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
                )}
              </div>
            </div>
            {entry.duration > 0 && grandTotal > 0 && (
              <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
                  style={{
                    width: `${(entry.duration / grandTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
```
Replace with:
```jsx
      {/* Per-item breakdown */}
      {groupByCategory ? (
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
              {fundamentals.map(renderItemCard)}
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
              {songs.map(renderItemCard)}
            </>
          )}
        </>
      ) : (
        breakdown.map(renderItemCard)
      )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/WeeklyReport.jsx
git commit -m "feat: add conditional category grouping to WeeklyReport"
```

---

### Task 6: Add conditional grouping to MonthlyReport

**Files:**
- Modify: `src/components/MonthlyReport.jsx`

- [ ] **Step 1: Add `groupByCategory` to function signature**

Find:
```js
function MonthlyReport({ items, monthStart, monthLogs, onMonthChange, onDayClick, timeUnit }) {
```
Change to:
```js
function MonthlyReport({ items, monthStart, monthLogs, onMonthChange, onDayClick, timeUnit, groupByCategory }) {
```

- [ ] **Step 2: Add `category` to the breakdown map and split into groups**

Find:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);
```
Change to:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');
```

- [ ] **Step 3: Extract inline item render to a named function**

Before the `return (` statement, add:

```js
  function renderItemCard(entry) {
    const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
    return (
      <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <span
            className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
          >
            {entry.name}
          </span>
          <div
            className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
          >
            <div>
              {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
              {t(timeUnit)}
            </div>
            {entry.duration > 0 && (
              <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
            )}
          </div>
        </div>
        {entry.duration > 0 && grandTotal > 0 && (
          <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
              style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 4: Replace the per-item breakdown section**

Find:
```jsx
      {/* Per-item breakdown */}
      {breakdown.map((entry) => {
        const percentage =
          grandTotal > 0
            ? Math.round((entry.duration / grandTotal) * 100)
            : 0;
        return (
          <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
              >
                {entry.name}
              </span>
              <div
                className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <div>
                  {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
                  {t(timeUnit)}
                </div>
                {entry.duration > 0 && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
                )}
              </div>
            </div>
            {entry.duration > 0 && grandTotal > 0 && (
              <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
                  style={{
                    width: `${(entry.duration / grandTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
```
Replace with:
```jsx
      {/* Per-item breakdown */}
      {groupByCategory ? (
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
              {fundamentals.map(renderItemCard)}
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
              {songs.map(renderItemCard)}
            </>
          )}
        </>
      ) : (
        breakdown.map(renderItemCard)
      )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthlyReport.jsx
git commit -m "feat: add conditional category grouping to MonthlyReport"
```

---

### Task 7: Add conditional grouping to YearlyReport

**Files:**
- Modify: `src/components/YearlyReport.jsx`

- [ ] **Step 1: Add `groupByCategory` to function signature**

Find:
```js
function YearlyReport({ items, yearStart, yearLogs, onYearChange, onDayClick, timeUnit }) {
```
Change to:
```js
function YearlyReport({ items, yearStart, yearLogs, onYearChange, onDayClick, timeUnit, groupByCategory }) {
```

- [ ] **Step 2: Add `category` to the breakdown map and split into groups**

Find:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);
```
Change to:
```js
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      duration: itemTotals[item.id] || 0,
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');
```

- [ ] **Step 3: Extract inline item render to a named function**

Before the `return (` statement, add:

```js
  function renderItemCard(entry) {
    const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
    return (
      <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <span
            className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
          >
            {entry.name}
          </span>
          <div
            className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
          >
            <div>
              {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
              {t(timeUnit)}
            </div>
            {entry.duration > 0 && (
              <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
            )}
          </div>
        </div>
        {entry.duration > 0 && grandTotal > 0 && (
          <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
              style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 4: Replace the per-item breakdown section**

Find:
```jsx
      {/* Per-item breakdown */}
      {breakdown.map((entry) => {
        const percentage =
          grandTotal > 0
            ? Math.round((entry.duration / grandTotal) * 100)
            : 0;
        return (
          <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${entry.duration > 0 ? 'text-gray-800 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}`}
              >
                {entry.name}
              </span>
              <div
                className={`text-right ${entry.duration > 0 ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <div>
                  {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
                  {t(timeUnit)}
                </div>
                {entry.duration > 0 && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
                )}
              </div>
            </div>
            {entry.duration > 0 && grandTotal > 0 && (
              <div className="mt-2 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
                  style={{
                    width: `${(entry.duration / grandTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
```
Replace with:
```jsx
      {/* Per-item breakdown */}
      {groupByCategory ? (
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
              {fundamentals.map(renderItemCard)}
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
              {songs.map(renderItemCard)}
            </>
          )}
        </>
      ) : (
        breakdown.map(renderItemCard)
      )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/YearlyReport.jsx
git commit -m "feat: add conditional category grouping to YearlyReport"
```

---

### Task 8: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run build**

```bash
npm run build
```
Expected: exits with code 0, no TypeScript/ESLint errors, dist/ generated.

- [ ] **Step 2: Run dev server and verify manually**

```bash
npm run dev
```

Open http://localhost:5173 and check:
1. Open Settings → confirm "Group by Category" toggle appears between Time Unit and AI Coach rows.
2. Toggle is ON by default. Switch to Report tab → Daily/Weekly/Monthly/Yearly all show category section headers (Fundamentals / Songs) with subtotals.
3. In Daily report, click "Generate Report" → confirm the text includes "Fundamentals:" and "Songs:" sections.
4. Turn toggle OFF → all four report views show a flat sorted list with no section headers.
5. In Daily report, click "Generate Report" while toggle is OFF → confirm flat list (no category headers).
6. Refresh page → toggle state persists.

- [ ] **Step 3: Commit plan + docs**

```bash
git add docs/superpowers/plans/2026-05-25-report-category-grouping-toggle.md
git commit -m "docs: add implementation plan for report category grouping toggle"
```
