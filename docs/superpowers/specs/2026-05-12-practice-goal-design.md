# Practice Goal Feature Design

**Date:** 2026-05-12
**Status:** Approved

## Overview

A single time-boxed practice goal that tracks total practice hours over a user-defined date range. The user specifies a start date, end date, and target hours. The app computes progress in real time from existing practice logs and shows how many hours per day the user needs to practice going forward to meet the goal.

Persisted in `localStorage` only (device-local, no Firebase sync). One goal at a time.

---

## Data Model

**localStorage key:** `drummate_goal`

```json
{
  "startDate": "2026-05-01",
  "endDate":   "2026-06-30",
  "targetHours": 20
}
```

All three fields are required. Absent or malformed key = no goal active.

**Computed at render time (never stored):**

| Value | Formula |
|-------|---------|
| `practicedSeconds` | Sum of log durations where `startDate <= date <= endDate` |
| `daysElapsed` | Days from `startDate` to today, capped at total span |
| `daysRemaining` | Days from today to `endDate`, minimum 0 |
| `progressPercent` | `practicedHours / targetHours * 100`, capped at 100% |
| `requiredDailyHours` | `(targetHours - practicedHours) / daysRemaining`; displayed in minutes when < 1 hr, hours otherwise |

---

## Components

### `GoalCard.jsx`
Full-detail view. Placed at the **top of `StatsReport.jsx`**, above existing analytics sections.

**Active goal state:**
- Goal title and date range (`startDate – endDate`)
- Progress bar (`practicedHours / targetHours`)
- Stats row: hours practiced, hours remaining, days remaining
- Required daily average going forward (e.g. "Need 45 min/day")
- Edit button → opens `GoalSetupModal`
- Clear button → removes `drummate_goal` from localStorage

**No goal set:**
- Empty state with "Set a goal" button → opens `GoalSetupModal`

**After end date (goal expired):**
- Progress frozen at final value
- Outcome badge: "Goal met!" (if `practicedHours >= targetHours`) or "Goal missed"
- Edit/clear still available so user can replace or dismiss

### `GoalBanner.jsx`
Compact strip. Placed at the **top of `PracticeItemList.jsx`** (Practice tab).

- Single line: e.g. "Goal: 12.5 / 20 hrs · Need 45 min/day"
- Thin progress bar beneath
- Hidden entirely when no goal is set
- Does not navigate on tap (passive display only)
- Re-reads localStorage on mount (refreshed on each tab visit)

### `GoalSetupModal.jsx`
Modal for creating or editing a goal. Opened from `GoalCard`.

**Fields:**
- Start Date (date picker, defaults to today)
- End Date (date picker, must be after Start Date)
- Target Hours (numeric input, must be > 0)

**On Save:** writes `drummate_goal` to localStorage, calls `onSave()` callback so `GoalCard` re-reads.
**On Cancel:** discards changes.

---

## Data Flow

- `GoalCard` and `GoalBanner` are fully self-contained: each reads `drummate_goal` from localStorage and calls `getAllLogs()` on mount. No new props from `App.jsx`.
- `timeUnit` prop passed from `App.jsx` (already threaded everywhere) so time displays respect the user's hours/minutes preference.
- After `GoalSetupModal` saves, it calls `onSave()` → parent `GoalCard` re-reads localStorage and re-renders. `GoalBanner` picks up the new goal on next mount (tab switch).

---

## Edge Cases

| Condition | Behavior |
|-----------|----------|
| `startDate > today` | Goal not started; show "Starts in X days"; required daily = `targetHours / totalSpanDays` |
| `endDate < today` | Goal expired; freeze display; show outcome badge |
| `practicedHours >= targetHours` before end date | Progress bar at 100%; show "Goal met!" early |
| `targetHours <= 0` | Validation in modal blocks save |
| `startDate >= endDate` | Validation in modal blocks save |
| Logs outside goal range | Excluded from sum |
| Malformed localStorage value | Treated as no goal (silently cleared) |

---

## i18n

All user-facing strings go through `t()`. New translation keys added to both `en` and `zh` in `LanguageContext.jsx`.

New keys (approximate):
```
goal.setGoal
goal.editGoal
goal.clearGoal
goal.noGoal
goal.startDate
goal.endDate
goal.targetHours
goal.practiced
goal.remaining
goal.daysLeft
goal.needPerDay
goal.met
goal.missed
goal.startsIn
goal.days
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/GoalCard.jsx` | New |
| `src/components/GoalBanner.jsx` | New |
| `src/components/GoalSetupModal.jsx` | New |
| `src/components/StatsReport.jsx` | Import and render `GoalCard` at top |
| `src/components/PracticeItemList.jsx` | Import and render `GoalBanner` at top |
| `src/contexts/LanguageContext.jsx` | Add goal translation keys (`en` + `zh`) |

---

## Out of Scope

- Per-item goals
- Multiple concurrent goals
- Firebase sync for goals
- Push notifications / reminders
- Historical goal archive
