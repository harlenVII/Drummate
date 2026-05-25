# Note Date Picker Dark Mode — Design Spec

**Date:** 2026-05-25
**Status:** Approved

## Problem

The "New note" modal uses a native `<input type="date">`. The browser's built-in calendar popup is rendered outside the DOM and cannot be styled — it always appears light-themed regardless of the app's dark mode setting.

## Scope

Single file change: `src/components/NoteEditModal.jsx`, create-mode date field only (lines 105–111). Edit mode has no date field; nothing else in the modal changes.

## Solution

Replace the native date input with `react-datepicker`, styled to match the existing slate-700/slate-800 dark palette.

### Dependencies

- Install `react-datepicker` (React 19 compatible, no extra peer deps)

### State Contract

`date` state remains a `YYYY-MM-DD` string — no changes to `canSave`, `onSave` payload, or any caller. Conversion happens only at the picker boundary:

- **String → Date (display):** `new Date(dateStr + 'T12:00:00')` — noon anchor avoids off-by-one TZ edge cases
- **Date → String (onChange):** manual `YYYY-MM-DD` formatting from the returned Date object

### Constraints Preserved

- `maxDate={new Date()}` — replaces `max={getTodayString()}`, same "no future dates" behavior
- Inline popper (default, `withPortal={false}`) — avoids z-index conflicts with modal backdrop

### Dark Mode CSS

Import `react-datepicker/dist/react-datepicker.css` in `src/index.css`. Add `.dark .react-datepicker { … }` overrides beneath the import using the existing slate palette:

| Element | Dark value |
|---|---|
| Calendar background | `slate-800` (`#1e293b`) |
| Header background | `slate-700` (`#334155`) |
| Day hover | `slate-600` (`#475569`) |
| Selected day | `indigo-600` (`#4f46e5`) |
| Text | `slate-100` (`#f1f5f9`) |
| Muted (prev/next month days) | `slate-500` (`#64748b`) |
| Border | `slate-600` (`#475569`) |
| Triangle/arrow | match header bg |

All overrides are scoped to `.dark` so light mode is unaffected.

## Files Changed

| File | Change |
|---|---|
| `package.json` | add `react-datepicker` dependency |
| `src/components/NoteEditModal.jsx` | replace native date input with `<DatePicker>` |
| `src/index.css` | import picker CSS + add `.dark` overrides |
