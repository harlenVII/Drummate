# Manual Practice Time Adjustment — Design

## Overview

Allow users to manually add, edit, or remove practice time for any item on any day, accessed from the Daily Report tab.

## Approach: Delta Log

Instead of modifying or deleting existing logs, append a new log with the duration difference (positive or negative). This preserves original timer history, requires no schema changes, and syncs identically to normal logs.

**Examples:**
- Total is 23min, user sets to 15min → `addLog(itemId, -480, date)` (delta = -8min)
- No logs exist, user adds 15min → `addLog(itemId, 900, date)`
- User deletes all time (sets to 0) → `addLog(itemId, -totalSeconds, date)`
- Delta is 0 → no log created (no-op)

## UI Flow

### Editing Existing Items

1. In the Daily Report, item rows become tappable
2. Tapping opens an **Edit Time Modal** showing:
   - Item name (read-only)
   - Date (read-only)
   - Duration input pre-filled with current total in minutes
   - Save / Cancel buttons
   - Delete button (sets total to 0)

### Adding New Items

1. A "+" button in the Daily Report header
2. Opens a picker showing all active + archived items (excluding items already displayed for that day)
3. Archived items are visually distinguished (dimmed or labeled)
4. Selecting an item opens the Edit Time Modal with duration = 0

## Duration Input

- Simple numeric input in **whole minutes**
- Delta calculated as: `(newMinutes * 60) - currentTotalSeconds`
- Validation: minimum 0, warning if > 480 minutes (8 hours)
- Non-numeric input rejected

## Data Layer

- **No schema changes** — existing `practiceLogs` table supports this as-is
- Duration field accepts negative integers for adjustment logs
- New logs get a fresh `uid` for sync dedup
- `Math.max(0, total)` guard on all aggregation displays to prevent negative totals

## Sync

Delta logs sync via `backend.pushLog(log, userId)` — no new sync operations needed.

## Edge Cases

- **Active timer:** Edit modal shows only saved total, not running elapsed time
- **Archived items:** Available in the "add new" picker, visually marked
- **Negative totals:** Guarded with `Math.max(0, total)` on display
- **i18n:** All new strings use `t()` for bilingual support

## Components Affected

- `DailyReport.jsx` — tappable rows, "+" button
- New: `EditTimeModal.jsx` — edit/add time modal
- New: `ItemPicker.jsx` — item selection for adding new logs (or inline in the modal)
- `database.js` — no changes needed (existing `addLog` supports date param)
- `App.jsx` — handler for creating delta logs, refreshing report data
- Language files — new translation keys
