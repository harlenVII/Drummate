# Practice List UX Improvements

**Date:** 2026-05-25
**Scope:** Two independent UI improvements to the Practice tab's item list.

---

## 1. Zero-time dash

### Problem
Every practice item shows `00:00:00` when it hasn't been practiced yet. On a list of 8+ items this creates visual noise — monospace zeros compete for attention with items that are actually running.

### Solution
In `renderRow` (normal mode) and the archived section of `PracticeItemList.jsx`, replace `formatTime(displayTime)` with a `—` glyph when `displayTime === 0`. The dash occupies the same `font-mono text-lg` slot so no layout shift occurs when the timer starts ticking.

**Styling:** The `—` uses a heavily muted color (`text-gray-300 dark:text-slate-700`) to recede visually. Once the item is active (`displayTime > 0`) the normal `text-gray-600 dark:text-slate-400` timer color returns.

### Affected code
- `src/components/PracticeItemList.jsx` — `renderRow` function (~line 570)
- `src/components/PracticeItemList.jsx` — archived section in normal mode (~line 648)

### Edge cases
- Item is active but `elapsedTime` is 0 on the very first tick: `savedTotal + elapsedTime` is still 0 → shows dash. Acceptable; dash disappears within one second.
- Archived items with accumulated time (non-zero `savedTotal`): show the real time, not a dash.

---

## 2. Compact mode toggle

### Problem
Each practice card uses generous padding (`p-4`) and gap (`gap-2`). With many items, users must scroll. A density option lets power users see more items without scrolling.

### Solution
A persisted boolean preference `compactMode` tightens card density when enabled.

### State management
- **Location:** `App.jsx` — matches the `groupByCategory` pattern exactly.
- **Init:** `localStorage.getItem('drummate_compact_mode') === 'true'`, default `false`.
- **Persist:** `useEffect([compactMode])` → `localStorage.setItem('drummate_compact_mode', String(compactMode))`.

### UI — Settings panel
- New `Toggle` row added to the **DISPLAY** section in `SettingsPanel.jsx`, below the Time Unit row.
- Props passed from `App.jsx`: `compactMode`, `onToggleCompactMode`.
- i18n keys:
  - `compactList` → `"Compact List"` (EN) / `"紧凑列表"` (ZH)

### UI — Practice list
- New `compactMode` prop on `PracticeItemList`.
- In **normal mode** `renderRow`, apply conditionally:
  - Padding: `p-4` → `p-2`
  - Row gap: `gap-2` → `gap-1`
  - Timer font size: `text-lg` → `text-sm`
  - Card radius: `rounded-lg` → `rounded-md`
- **Edit mode** cards (`SortableItem`) get the same compact padding/gap/radius.
- Category section headers and the Edit/Done button are unaffected.

### localStorage table update
Add to CLAUDE.md's UI preferences table:

| `drummate_compact_mode` | `'true'` \| `'false'` | `'false'` | compact practice list |

---

## Non-goals
- No today-activity badges (deferred).
- No changes to the Report, Metronome, or Notes tabs.
- No changes to edit-mode drag behaviour or trash section.
