# Practice List UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-time dash (replace `00:00:00` with `—` on un-practiced items) and a persistent compact-mode toggle (in Settings → Display) to the Practice tab's item list.

**Architecture:** Both features are isolated to three files: `LanguageContext.jsx` (i18n strings), `PracticeItemList.jsx` (rendering), and `App.jsx` (state) + `SettingsPanel.jsx` (toggle UI). No new files are created. `compactMode` follows the exact same localStorage-init / useEffect-persist / prop-pass-down pattern as the existing `groupByCategory` preference.

**Tech Stack:** React 19, Tailwind v4, Vite 7. No new dependencies.

---

## File Map

| File | Change |
|------|--------|
| `src/contexts/LanguageContext.jsx` | Add `compactList` key in EN + ZH translations |
| `src/components/PracticeItemList.jsx` | Accept `compactMode` prop; render `—` for zero time; apply compact Tailwind classes |
| `src/App.jsx` | Add `compactMode` state, persist to localStorage, pass to `PracticeItemList` + `SettingsPanel` |
| `src/components/SettingsPanel.jsx` | Accept `compactMode` + `onToggleCompactMode` props; add Toggle row in DISPLAY section |
| `CLAUDE.md` | Add `drummate_compact_mode` row to the localStorage table |

---

## Task 1: Add i18n keys [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add EN key**

Find the line `groupByCategory: 'Group by Category',` (around line 46) and add the new key directly after it:

```js
groupByCategory: 'Group by Category',
compactList: 'Compact List',
```

- [ ] **Step 2: Add ZH key**

Find the line `groupByCategory: '按分类分组',` (around line 408) and add after it:

```js
groupByCategory: '按分类分组',
compactList: '紧凑列表',
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(i18n): add compactList translation key

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Zero-time dash in PracticeItemList [model: haiku]

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

There is no extractable pure function for the dash logic (it's a one-liner ternary in JSX). Verification is visual + build.

- [ ] **Step 1: Update `renderRow` timer display**

Locate the `renderRow` function (~line 570). Find this span:

```jsx
<span className="font-mono text-lg text-gray-600 dark:text-slate-400">
  {formatTime(displayTime)}
</span>
```

Replace it with:

```jsx
<span className={`font-mono text-lg ${displayTime === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
  {displayTime === 0 ? '—' : formatTime(displayTime)}
</span>
```

- [ ] **Step 2: Update archived-items timer display**

Locate the archived items section in normal mode (~line 648). Find this span:

```jsx
<span className="font-mono text-lg text-gray-600 dark:text-slate-400">
  {formatTime(savedTotal)}
</span>
```

Replace it with:

```jsx
<span className={`font-mono text-lg ${savedTotal === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
  {savedTotal === 0 ? '—' : formatTime(savedTotal)}
</span>
```

- [ ] **Step 3: Verify build and existing tests pass**

```bash
npm run build && npm run test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "feat(practice): show dash instead of 00:00:00 for un-practiced items

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add compactMode state in App.jsx [model: haiku]

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add compactMode state**

Find the `groupByCategory` state declaration (~line 92):

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

Add the following directly after it:

```js
const [compactMode, setCompactMode] = useState(() => {
  try {
    return localStorage.getItem('drummate_compact_mode') === 'true';
  } catch {
    return false;
  }
});
```

- [ ] **Step 2: Persist compactMode to localStorage**

Find the useEffect that persists `groupByCategory` (~line 319):

```js
useEffect(() => {
  localStorage.setItem('drummate_group_by_category', String(groupByCategory));
}, [groupByCategory]);
```

Add directly after it:

```js
useEffect(() => {
  localStorage.setItem('drummate_compact_mode', String(compactMode));
}, [compactMode]);
```

- [ ] **Step 3: Pass compactMode to PracticeItemList**

Find the `<PracticeItemList` usage (~line 1599). It currently ends with:

```jsx
goalRefreshKey={goalRefreshKey}
```

Add two more props so the block ends with:

```jsx
goalRefreshKey={goalRefreshKey}
compactMode={compactMode}
```

- [ ] **Step 4: Pass compactMode to SettingsPanel**

Find the `<SettingsPanel` usage (~line 1844). It currently has a line:

```jsx
onToggleGroupByCategory={() => setGroupByCategory((v) => !v)}
```

Add two props directly after that line:

```jsx
onToggleGroupByCategory={() => setGroupByCategory((v) => !v)}
compactMode={compactMode}
onToggleCompactMode={() => setCompactMode((v) => !v)}
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

Expected: no errors. (React will warn in dev if props aren't consumed yet — that's fine; Task 4 and 5 will consume them.)

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(practice): add compactMode state and localStorage persistence

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Add compact toggle to SettingsPanel [model: haiku]

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add props to the SettingsPanel function signature**

Find the `function SettingsPanel({` declaration (~line 105). The props list currently ends with:

```js
onShowPending,
```

Add two new props:

```js
onShowPending,
compactMode,
onToggleCompactMode,
```

- [ ] **Step 2: Add the Toggle row in the DISPLAY section**

Find the Time Unit row in the DISPLAY section (~line 300):

```jsx
<Row
  label={t('timeUnit')}
  control={
    <PillGroup
      options={[
        { value: 'minutes', label: t('timeUnitMin') },
        { value: 'hours', label: t('timeUnitHr') },
      ]}
      value={timeUnit}
      onSelect={() => onToggleTimeUnit()}
    />
  }
/>
```

Add the compact list row directly after the closing `/>` of that Row:

```jsx
<Row
  label={t('compactList')}
  control={<Toggle checked={compactMode} onChange={onToggleCompactMode} />}
/>
```

- [ ] **Step 3: Verify build and tests pass**

```bash
npm run build && npm run test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat(settings): add Compact List toggle in Display section

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Apply compact styles in PracticeItemList [model: haiku]

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

- [ ] **Step 1: Add compactMode to PracticeItemList props**

Find the `function PracticeItemList({` declaration (~line 88). The props list currently ends with:

```js
goalRefreshKey,
```

Add the new prop:

```js
goalRefreshKey,
compactMode = false,
```

- [ ] **Step 2: Apply compact styles to normal-mode renderRow**

In `renderRow` (~line 570), find the card div's className:

```jsx
className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex items-center justify-between transition-colors cursor-pointer ${
  isActive ? 'ring-2 ring-blue-500 dark:ring-indigo-500' : isFocused ? 'ring-2 ring-gray-300 dark:ring-slate-600' : ''
}`}
```

Replace with:

```jsx
className={`bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between transition-colors cursor-pointer ${
  compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'
} ${
  isActive ? 'ring-2 ring-blue-500 dark:ring-indigo-500' : isFocused ? 'ring-2 ring-gray-300 dark:ring-slate-600' : ''
}`}
```

Also update the timer font size inside `renderRow` to shrink in compact mode. Find:

```jsx
<span className={`font-mono text-lg ${displayTime === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
```

Replace with:

```jsx
<span className={`font-mono ${compactMode ? 'text-sm' : 'text-lg'} ${displayTime === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
```

- [ ] **Step 3: Apply compact gap to the normal-mode column containers**

In the normal-mode return block (~line 608), find the two `flex flex-col gap-2` column wrappers inside the grid. Both look like:

```jsx
<div className="flex flex-col gap-2">
```

There are two of them (one for fundamentals, one for songs). Replace both with:

```jsx
<div className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
```

- [ ] **Step 4: Apply compact styles to archived items in normal mode**

In the archived section (~line 648), find:

```jsx
<div className="flex flex-col gap-2 mt-1">
```

Replace with:

```jsx
<div className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'} mt-1`}>
```

And the archived card div:

```jsx
className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex items-center justify-between opacity-50"
```

Replace with:

```jsx
className={`bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between opacity-50 ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}
```

And the archived timer span:

```jsx
<span className={`font-mono text-lg ${savedTotal === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
```

Replace with:

```jsx
<span className={`font-mono ${compactMode ? 'text-sm' : 'text-lg'} ${savedTotal === 0 ? 'text-gray-300 dark:text-slate-700' : 'text-gray-600 dark:text-slate-400'}`}>
```

- [ ] **Step 5: Apply compact styles to edit-mode SortableItem cards**

In `SortableItem` (~line 25), find:

```jsx
<div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex items-center">
```

`SortableItem` doesn't currently receive a `compactMode` prop. The simplest fix is to pass it through. Update `SortableItem` to accept and use it:

```jsx
function SortableItem({ item, children, compactMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`bg-white dark:bg-slate-800 shadow-sm flex items-center ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
        <DragHandle listeners={listeners} attributes={attributes} />
        {children}
      </div>
    </div>
  );
}
```

Then update every call to `<SortableItem` in `renderEditRow` (there is one):

```jsx
<SortableItem key={item.id} item={item} compactMode={compactMode}>
```

Also update the two `flex flex-col gap-2` wrappers in edit mode (~line 421):

```jsx
<div className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
```

(There are two — one for each category column.)

- [ ] **Step 6: Verify build and tests pass**

```bash
npm run build && npm run test
```

Expected: build succeeds, all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "feat(practice): add compact mode layout (tighter padding, gap, font size)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update CLAUDE.md localStorage table [model: haiku]

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add row to the localStorage table**

Find the table in the "UI preferences in localStorage" section. It currently ends with:

```
| `drummate_pending_log` | JSON log | absent | crash-recovery log |
```

Add a new row:

```
| `drummate_compact_mode` | `'true'` \| `'false'` | `'false'` | compact practice list |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add drummate_compact_mode to localStorage table in CLAUDE.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Final verification [model: sonnet]

- [ ] **Step 1: Run full build and test suite**

```bash
npm run build && npm run test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 2: Smoke-test in the browser**

Start dev server:

```bash
npm run dev
```

Open `http://localhost:5173` and verify:

1. Items with zero time show `—` in muted color; items with time show the normal timer.
2. Open Settings → scroll to Display section → "Compact List" toggle is present.
3. Toggle compact mode on → list cards shrink (less padding, smaller timer text, tighter gaps).
4. Refresh page → compact preference is preserved.
5. Toggle compact mode off → normal spacing restored.
6. Switch to dark mode → dash color is visually recessed (not the same as active timer text).
7. Run existing tests once more to confirm no regressions: `npm run test`.
