---
title: Practice Tab Focus Persistence & Click-to-Focus
date: 2026-05-07
status: approved
---

# Practice Tab Focus Persistence & Click-to-Focus

## Problem

The keyboard focus highlight (gray ring) on practice items is stored as a local index in `PracticeItemList`. Because `PracticeItemList` unmounts when the user switches tabs, `focusedIndex` resets to `null` every time the user returns to the Practice tab. Additionally, there is no way to focus an item by clicking on it — only arrow keys work.

## Goals

1. Persist the focused item across tab switches.
2. Let the user click anywhere on an item row (not just Start/Stop) to focus it.

## Non-Goals

- Clicking does **not** start or stop the timer — focus only.
- No changes to the Space / arrow key behavior.

## Design

### Approach: Lift focused item ID to App.jsx (Option A)

Store focus as a **stable item ID** in `App.jsx` state rather than a transient index in `PracticeItemList`. Because `App.jsx` never unmounts, the ID survives tab switches. `PracticeItemList` derives the display index from the ID each render.

### State change — App.jsx

```js
const [focusedPracticeItemId, setFocusedPracticeItemId] = useState(null);
```

Pass to `<PracticeItemList>`:
```jsx
<PracticeItemList
  ...
  focusedItemId={focusedPracticeItemId}
  onFocusChange={setFocusedPracticeItemId}
/>
```

### PracticeItemList refactor

Remove: `const [focusedIndex, setFocusedIndex] = useState(null)`

Replace with a derived value (no state, no effects for bounds/restore):
```js
const orderedActive = [...fundamentalsItems, ...songsItems];
const rawFocusedIndex = focusedItemId != null
  ? orderedActive.findIndex(i => i.id === focusedItemId)
  : null;
const focusedIndex = rawFocusedIndex === -1 ? null : rawFocusedIndex;
```

All `setFocusedIndex(idx)` call-sites become:
```js
onFocusChange(orderedActive[idx]?.id ?? null);
```

The three existing `useEffect`s that managed `focusedIndex` are removed:
- "Restore focus to active item" — adapted: one effect watches `activeItemId`; if `focusedItemId` is null and `activeItemId` is set, call `onFocusChange(activeItemId)`.
- "Keep focusedIndex in bounds" — not needed; a deleted item's ID yields `rawFocusedIndex === -1`, which maps to `focusedIndex === null` (no highlight shown).

### Click-to-focus

Add `onClick` to the row wrapper `div` inside `renderRow`:
```js
onClick={() => onFocusChange(item.id)}
```

The cursor changes to `cursor-pointer` on the row to signal interactivity.

## Behavior Summary

| Action | Result |
|--------|--------|
| Arrow Up / Down | Moves focus; ID updated in App.jsx |
| Click item row | Focus jumps to that item |
| Switch tab | `focusedPracticeItemId` unchanged in App.jsx |
| Return to Practice tab | Derived index restores highlight from stored ID |
| Delete focused item | ID yields `-1` → no highlight (graceful) |
| Start timer with no focus | Auto-focuses to active item via `activeItemId` effect |

## Files Changed

| File | Change |
|------|--------|
| `src/App.jsx` | Add `focusedPracticeItemId` state; pass as props to PracticeItemList |
| `src/components/PracticeItemList.jsx` | Accept `focusedItemId`/`onFocusChange` props; derive index; add click handler; remove local focus state and old effects |
