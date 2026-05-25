# Note Date Picker Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<input type="date">` in the "New note" modal with `react-datepicker`, styled to match the app's dark mode palette.

**Architecture:** Install `react-datepicker`, import its CSS in `index.css` alongside `.dark` overrides, and swap the native input in `NoteEditModal.jsx` (create mode only). Date state stays as a `YYYY-MM-DD` string; conversion happens only at the picker boundary.

**Tech Stack:** React 19, Tailwind CSS v4, react-datepicker

---

## File Map

| File | Change |
|---|---|
| `package.json` | `react-datepicker` added as a dependency (via npm install) |
| `src/index.css` | `@import` for picker CSS + `.dark .react-datepicker*` overrides |
| `src/components/NoteEditModal.jsx` | Replace native date input with `<DatePicker>` |

---

### Task 1: Install react-datepicker

**Files:**
- Modify: `package.json` (automatically via npm)

- [ ] **Step 1: Install the package**

Run from the project root:
```bash
npm install react-datepicker
```
Expected: `added N packages` with no errors. `package.json` now lists `"react-datepicker"` under `dependencies`.

- [ ] **Step 2: Verify the build still passes**

```bash
npm run build
```
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-datepicker dependency

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add CSS import and dark mode overrides

**Files:**
- Modify: `src/index.css`

> The `.dark` class is applied to `<html>` by `themeService.js`. All dark overrides below are scoped to `.dark` so light mode is untouched. The z-index override is unscoped — the modal sits at `z-50` (50), so the popper must be higher regardless of theme.

- [ ] **Step 1: Add the CSS import and overrides to `src/index.css`**

Open `src/index.css`. After the existing `/* Allow selection in form inputs */` block at the end of the file, append:

```css
/* react-datepicker base import */
@import "react-datepicker/dist/react-datepicker.css";

/* Ensure popper floats above modal (z-50 = 50) */
.react-datepicker-popper {
  z-index: 60;
}

/* Dark mode overrides */
.dark .react-datepicker {
  background-color: #1e293b; /* slate-800 */
  border-color: #475569;     /* slate-600 */
  color: #f1f5f9;            /* slate-100 */
  font-family: inherit;
}

.dark .react-datepicker__triangle::before,
.dark .react-datepicker__triangle::after {
  border-bottom-color: #334155 !important; /* slate-700 = header bg */
}

.dark .react-datepicker__header {
  background-color: #334155; /* slate-700 */
  border-bottom-color: #475569; /* slate-600 */
}

.dark .react-datepicker__current-month,
.dark .react-datepicker__day-name {
  color: #f1f5f9; /* slate-100 */
}

.dark .react-datepicker__navigation-icon::before {
  border-color: #94a3b8; /* slate-400 */
}

.dark .react-datepicker__day {
  color: #f1f5f9; /* slate-100 */
}

.dark .react-datepicker__day:hover {
  background-color: #475569; /* slate-600 */
  border-radius: 0.3rem;
}

.dark .react-datepicker__day--selected,
.dark .react-datepicker__day--keyboard-selected {
  background-color: #4f46e5; /* indigo-600 */
  color: #ffffff;
}

.dark .react-datepicker__day--selected:hover,
.dark .react-datepicker__day--keyboard-selected:hover {
  background-color: #4338ca; /* indigo-700 */
}

.dark .react-datepicker__day--today {
  color: #818cf8; /* indigo-400 */
  font-weight: bold;
}

.dark .react-datepicker__day--disabled,
.dark .react-datepicker__day--outside-month {
  color: #64748b; /* slate-500 */
}

.dark .react-datepicker__day--disabled:hover {
  background-color: transparent;
}
```

- [ ] **Step 2: Verify the build passes**

```bash
npm run build
```
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add react-datepicker dark mode CSS overrides

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Replace native date input in NoteEditModal

**Files:**
- Modify: `src/components/NoteEditModal.jsx`

> `date` state is a `YYYY-MM-DD` string throughout the component. We convert to/from `Date` only at the picker boundary. Noon anchor (`T12:00:00`) prevents the date from drifting to the previous day due to UTC offset.

- [ ] **Step 1: Update the import block**

At the top of `src/components/NoteEditModal.jsx`, replace:
```js
import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
```
With:
```js
import { useState, useEffect, useMemo } from 'react';
import DatePicker from 'react-datepicker';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
```

- [ ] **Step 2: Add date conversion helpers inside the component**

Directly after the `const { t } = useLanguage();` line, add two helpers:
```js
const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null);

const fromPickerDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
```

- [ ] **Step 3: Replace the native date input with `<DatePicker>`**

Find and replace the entire `<input type="date" ...>` block (currently lines 105–111):
```jsx
<input
  type="date"
  value={date}
  onChange={(e) => setDate(e.target.value)}
  max={getTodayString()}
  className="w-full mb-3 px-3 py-2 border border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 rounded-md"
/>
```
Replace with:
```jsx
<DatePicker
  selected={toPickerDate(date)}
  onChange={(d) => setDate(fromPickerDate(d))}
  maxDate={new Date()}
  dateFormat="MM/dd/yyyy"
  className="w-full px-3 py-2 border border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 rounded-md"
  wrapperClassName="w-full mb-3"
  popperProps={{ strategy: 'fixed' }}
/>
```

> `popperProps={{ strategy: 'fixed' }}` tells Popper.js to use `position: fixed`, which prevents clipping inside the fixed-positioned modal backdrop.

- [ ] **Step 4: Verify the build passes**

```bash
npm run build
```
Expected: build completes with no errors and no TypeScript/ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/NoteEditModal.jsx
git commit -m "feat: replace native date input with react-datepicker in note modal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```
Open http://localhost:5173.

- [ ] **Step 2: Verify light mode**

1. Ensure app is in light mode (press `L` or use settings).
2. Go to the Notes tab.
3. Tap `+` to open "New note".
4. Click the date field — a calendar popup should appear with a white/light background.
5. Select a past date — the date field updates and the `YYYY-MM-DD` value feeds into the note on save.
6. Verify you cannot select a future date (tomorrow's date should be greyed/disabled).

- [ ] **Step 3: Verify dark mode**

1. Press `D` to switch to dark mode.
2. Open "New note" again.
3. Click the date field — calendar should appear with slate-800 background, slate-100 text, indigo-600 selected day, no light flash.
4. Verify today's date is highlighted in indigo-400.
5. Verify disabled/future dates are dimmed (slate-500).

- [ ] **Step 4: Verify save flow**

1. In dark mode, select a date, fill in the body, hit Save.
2. The note should appear in By Date view under the correct date.
3. Refresh the page — the note should still be there with the correct date.
