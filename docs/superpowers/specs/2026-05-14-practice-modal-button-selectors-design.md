# Design: Button Selectors in PracticeEditModal

**Date:** 2026-05-14  
**Status:** Approved

## Summary

Replace the three `<select>` dropdowns in `PracticeEditModal.jsx` with button groups, matching the existing button-selector style used in `Metronome.jsx`.

## Scope

Single file change: `src/components/PracticeEditModal.jsx`

No new state, no new props, no new components. `SubdivisionIcon` is already used in the project.

## Changes

### 1. Time Signature

Replace `<select>` with a `flex-wrap` button group. Six options: `2/4`, `3/4`, `4/4`, `5/4`, `6/8`, `7/8`. Each button shows `beats/noteValue` as text. Active state: `bg-blue-600 text-white`. Inactive: `bg-white text-gray-600 border border-gray-300 hover:bg-gray-100`.

### 2. Subdivision

Replace `<select>` with a `flex-wrap` button group. Nine options from `SUBDIVISIONS`, filtered to exclude `rest` (pattern is null). Each button renders `<SubdivisionIcon type={key} />`. Same active/inactive styling as above.

### 3. Sound Type

Replace `<select>` with a `flex-wrap` button group. Five options: `click`, `woodBlock`, `hiHat`, `rimshot`, `beep`. Each button label uses `t('soundTypes.key')`. Same styling.

## Layout

Each selector keeps its existing `<label>` wrapper with a section title. The button group replaces only the `<select>` element. Buttons use `flex-wrap justify-start` so they wrap naturally within the modal's `max-w-md` width.

## No-Change Items

- Numeric inputs (startBpm, endBpm, bpmIncrement, barsPerStep) remain as `<input type="number">`
- Name field remains as `<input type="text">`
- Validation logic unchanged
- Save/Cancel/Delete buttons unchanged
