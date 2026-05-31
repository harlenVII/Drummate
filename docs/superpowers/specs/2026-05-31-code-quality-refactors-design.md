# Code Quality Refactors — Design

**Date:** 2026-05-31
**Status:** Approved

Three independent, low-risk refactors that reduce duplication and close gaps against
existing project rules. Each ships as its own commit and must pass `npm run build` and
`npm run test` before the next begins. Order is **1 → 2 → 3** because #1 and #2 both touch
the report components; doing #1 first means #2 only edits the new shared header.

---

## Opportunity 1 — Report component de-duplication

### Problem

The four report tabs — [DailyReport.jsx](../../../src/components/DailyReport.jsx),
[WeeklyReport.jsx](../../../src/components/WeeklyReport.jsx),
[MonthlyReport.jsx](../../../src/components/MonthlyReport.jsx),
[YearlyReport.jsx](../../../src/components/YearlyReport.jsx) — each contain two large,
copy-pasted JSX blocks:

1. **Prev/Next navigation header** (~50 lines): two chevron-SVG buttons, disabled-state
   styling on "next", compact-mode sizing, and a center label.
2. **Per-item breakdown** (~30 lines): the `groupByCategory ? (fundamentals + songs
   sections) : flat breakdown` ternary, including the category subtotal rows.

Total duplication ≈ 250 lines across four files. A styling or logic fix today must be made
in four places.

### Solution

Two new presentational components in `src/components/`.

#### `ReportNavHeader.jsx`

A stateless header rendering the two chevron buttons plus a center label.

| Prop | Type | Notes |
|------|------|-------|
| `onPrev` | `() => void` | prev-button click handler |
| `onNext` | `() => void` | next-button click handler |
| `nextDisabled` | `boolean` | disables + greys the next button |
| `prevLabel` | `string` | already-translated `aria-label` for prev |
| `nextLabel` | `string` | already-translated `aria-label` for next |
| `compactMode` | `boolean` | drives padding/icon sizing (default `false`) |
| `children` | `ReactNode` | the center label (date label / week range / month / year) |

The two chevron `<path>` strings (`M15 19l-7-7 7-7` and `M9 5l7 7-7 7`) and all the
existing Tailwind classes move verbatim into this component so the rendered output is
byte-identical to today.

Each report replaces its header block with, e.g. (WeeklyReport):

```jsx
<ReportNavHeader
  onPrev={() => onWeekChange(shiftDate(weekStart, -7))}
  onNext={() => onWeekChange(shiftDate(weekStart, 7))}
  nextDisabled={isCurrentWeek}
  prevLabel={t('accessibility.prevWeek')}
  nextLabel={t('accessibility.nextWeek')}
  compactMode={compactMode}
>
  {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
</ReportNavHeader>
```

> Note: the translated `prevLabel`/`nextLabel` props depend on the `accessibility` i18n keys
> added in Opportunity 2. Since #1 lands first, these labels stay as the current hardcoded
> English strings (`"Previous week"`, etc.) in commit 1 and are swapped to `t('accessibility.…')`
> in commit 2. This keeps each commit independently green.

#### `ReportItemBreakdown.jsx`

A stateless component owning the `groupByCategory` branch and category subtotals.

| Prop | Type | Notes |
|------|------|-------|
| `groupByCategory` | `boolean` | |
| `fundamentals` | `entry[]` | from `buildBreakdown` |
| `songs` | `entry[]` | from `buildBreakdown` |
| `breakdown` | `entry[]` | flat list, used when not grouping |
| `timeUnit` | `string` | for subtotal formatting |
| `renderCard` | `(entry) => ReactNode` | **render-prop**; each report keeps its own card config |

The render-prop preserves per-report card differences without leaking them into the shared
component: DailyReport's `renderItemCard` passes `editMode` + `onEditTime`; the other three
pass `dimZero`. Those local `renderItemCard` definitions stay in each report and are handed
to `ReportItemBreakdown` as `renderCard`.

Each report replaces its breakdown block with:

```jsx
<ReportItemBreakdown
  groupByCategory={groupByCategory}
  fundamentals={fundamentals}
  songs={songs}
  breakdown={breakdown}
  timeUnit={timeUnit}
  renderCard={renderItemCard}
/>
```

### Out of scope

The bar chart (Weekly), calendar heatmap + trend (Monthly), and Yearly-specific visuals are
**not** extracted — they are genuinely distinct per report. Only the two shared blocks move.

### Testing

- New `tests/reportNavHeader.test.jsx`: renders header, asserts prev/next click handlers fire,
  asserts `nextDisabled` greys the button and blocks the handler, asserts aria-labels render.
- New `tests/reportItemBreakdown.test.jsx`: asserts grouped mode renders category headers +
  subtotals and calls `renderCard` per entry; asserts flat mode skips headers.
- Existing `reportBreakdown` and `reportItemCard` tests remain green (data pipeline unchanged).
- Manual: all four report tabs render identically, nav arrows step dates, category grouping
  toggle works, compact mode unchanged.

---

## Opportunity 2 — i18n for static `aria-label`s

### Problem

CLAUDE.md states *"All user-facing text must go through `t()`"*, but ~17 `aria-label`s are
hardcoded English. Screen-reader users in Chinese mode hear English. Affected files:

- Report nav (8 labels) — now centralized in `ReportNavHeader` after Opportunity 1.
- [BpmDial.jsx](../../../src/components/BpmDial.jsx): `"Decrease BPM"`, `"Increase BPM"`.
- [SettingsPanel.jsx](../../../src/components/SettingsPanel.jsx): `"Close settings"`.
- [App.jsx](../../../src/App.jsx): `"Open settings"` (the settings avatar button).
- [EncouragementButton.jsx](../../../src/components/EncouragementButton.jsx): `"AI Coach"`.
- Drag handles (`"Drag to reorder"`) in
  [MultiMeterPage.jsx](../../../src/components/MultiMeterPage.jsx),
  [GoalCard.jsx](../../../src/components/GoalCard.jsx),
  [PracticeItemList.jsx](../../../src/components/PracticeItemList.jsx),
  [SequencerPage.jsx](../../../src/components/SequencerPage.jsx).

### Solution

Add an `accessibility` nested block to **both** `en` and `zh` in
[LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx), mirroring the existing
`analytics` nesting style:

```js
accessibility: {
  prevDay, nextDay, prevWeek, nextWeek, prevMonth, nextMonth, prevYear, nextYear,
  decreaseBpm, increaseBpm,
  openSettings, closeSettings,
  aiCoach,
  dragToReorder,
}
```

Replace each hardcoded label with `t('accessibility.<key>')`. The report nav labels are
passed into `ReportNavHeader` via its `prevLabel`/`nextLabel` props.

### Critical coupling — decouple the DOM query first

[FloatingPracticeWidget.jsx:19](../../../src/components/FloatingPracticeWidget.jsx#L19)
positions itself by querying `document.querySelector('[aria-label="Open settings"]')`,
pointing at the button in [App.jsx:1716](../../../src/App.jsx#L1716). Translating that
`aria-label` would break positioning whenever the language is not English.

Fix: add a stable `data-settings-button` attribute to the App.jsx settings button and change
the widget's query to `document.querySelector('[data-settings-button]')`. The `aria-label`
is then free to be translated. **This change must accompany the `openSettings` translation —
not be deferred.**

### Testing

- Manual: toggle to Chinese (key `C`), confirm screen-reader labels translate (inspect DOM
  `aria-label` attributes), and confirm the floating practice widget still positions correctly
  in both languages.
- `npm run build` + existing tests green (no test currently asserts on these strings).

---

## Opportunity 3 — Route `localStorage` through `safeStorage`

### Problem

[safeStorage.js](../../../src/utils/safeStorage.js) wraps `localStorage` so it never throws
(private mode, quota, disabled storage). A prior commit routed unguarded *writes* through it,
but ~20 direct `localStorage.*` calls remain in [App.jsx](../../../src/App.jsx) (init reads on
lines ~95–290, plus 541/548/628/630, 1205/1209) and 2 in
[LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx) (844/850). Several init reads
are unguarded — a throw during boot in private-mode Safari could break startup.

### Solution

1. Add a `removeItem(key)` helper to `safeStorage.js` (same try/catch shape) — needed for
   `drummate_goal` and `drummate_pending_log` removals.
2. Replace every direct `localStorage.getItem/setItem/removeItem` in App.jsx and
   LanguageContext.jsx with the `safeStorage` equivalents.
3. Remove the now-redundant bespoke inline `try { … } catch { … }` wrappers around those calls
   (e.g. App.jsx 239/246/2007), since the helper already guarantees no-throw. Keep the parsing
   logic (e.g. `=== 'true'`, `JSON.parse`) — only the storage-access try/catch is removed.

`JSON.parse` of stored values must remain inside its own guard where present, because
`safeStorage` only protects the storage access, not the parse. Where a parse is currently
inside the same try block as the read, keep a guard around the parse.

### Testing

- `npm run test` — existing `safeStorage.test.js` plus a new case for `removeItem` (no-throw
  when storage unavailable).
- `npm run build`.
- Manual: refresh app, confirm all persisted prefs (time unit, group-by-category, compact mode,
  metronome/sequencer/multimeter settings, language, AI toggles) survive reload; confirm
  pending-log crash recovery still works.

---

## Risks & mitigations

- **Visual regression in reports** (Opp 1): mitigated by moving classes/SVG verbatim and by the
  render-prop preserving each report's exact card config. Manual side-by-side check of all four
  tabs in normal + compact + dark mode.
- **Broken widget positioning** (Opp 2): mitigated by switching the DOM query to a
  language-independent `data-*` attribute in the same commit as the translation.
- **Lost preferences** (Opp 3): mitigated by changing only the storage-access mechanism, not
  keys or parse logic; verified by reload test.
