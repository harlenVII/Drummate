# Daily Report: Practice Sessions

**Date:** 2026-09-25

## Overview

The Daily report shows one total per practice item. This feature lets you tap an item's card to see the individual sessions behind that total, each with a start and end time, e.g. "21:02 – 21:07 · 5 minutes".

It also changes how Daily edit mode and "Merge to yesterday" save time. Today both stamp entries at a fixed noon. After this change, the entries they produce carry realistic start and end times.

A whole-day timeline across all items was the second option discussed. It is a planned follow-up and out of scope here.

## Background

- Every Start→Stop run of the practice timer is already its own `practiceLogs` row. `loggedAt` is the moment the timer stopped and `duration` is the elapsed seconds. The timer has no pause, so **start = `loggedAt − duration × 1000`**. No new stored fields are needed.
- Three kinds of rows carry made-up times today:
  - Edit-mode adjustments (`addAdjustmentLog`) are delta rows stamped at noon in the home timezone, and can be negative.
  - Merge to yesterday (`reattributeLogsToDate`) re-stamps every row to noon yesterday.
  - Legacy rows from before v13 were backfilled to noon America/Los_Angeles.
- Existing rows keep their times. Only new edits and merges follow the rules below.

## Decisions

From the user:

- Build the per-item session list first; the day timeline comes later.
- Old entries keep their noon times.
- **Adding time:** the item's latest session gets longer and moves to end now.
- **Subtracting time:** the session keeps its start and its end moves earlier.
- **Merge to yesterday:** each item's last merged session ends at 11:59:59 PM yesterday.
- **Overlaps are fixed within each item only** (decided 2026-10-03, after hands-on testing): after an edit or a merge, an item's sessions never overlap each other. Sessions of different items may overlap.
- Times are always 24-hour ("21:02"), in both languages.
- Assume all data matches the current Dexie schema. In particular, a log with `syncedOnce: true` really exists in the cloud. This assumption is what makes absence-based deletion safe for logs (see Sync §2).

Defaults proposed during brainstorming and approved:

- Row durations follow the minutes/hours setting.
- Times are shown in the home timezone.
- Old negative entries show as "Adjustment" with their negative duration.
- Open cards stay open while moving between days.
- In edit mode, tapping a card still opens the time editor.
- On a past day, "now" becomes 11:59:59 PM of that day.
- Delete (or typing a total of 0) removes all of that item's entries for the day, including old negative ones.
- Old negative entries are otherwise left alone. The one exception, added while writing this spec, is when they cancel out the item's whole day (see "Legacy fold" under Editing time).
- A shortened session's end never moves back past 00:00 of its own day.
- Merge packs each item's entries back to back in their original order. (The first version packed the whole day as one chain, so only the day's latest session ended at 11:59:59 PM; changed 2026-10-03.)

## Viewing sessions

### Behavior

- Outside edit mode, tapping an item card on the Daily report toggles its session list. A chevron next to the item name shows whether it is open.
- Rows are sorted by start time, earliest first. Each row shows `HH:MM – HH:MM` on the left and the duration on the right. The duration uses the same format as the card: `formatDuration(duration, timeUnit)` followed by `t(timeUnit)`.
- Times are formatted in the home timezone (`getTimezone()`), always as 24-hour.
- Rows with a negative duration (old adjustments) have no time range. They render as "Adjustment" plus the negative duration, listed after all sessions.
- Old positive noon-stamped rows render as ordinary sessions that end at their `loggedAt`.
- A session that crossed midnight shows only the times, e.g. "23:50 – 00:20".
- Open cards stay open while navigating between dates. The state is keyed by item id and is not reset on date change.
- In edit mode, tapping a card opens `EditTimeModal` exactly as today and does not toggle the list. A list that is already open stays visible, read-only.

### Components

- `ReportItemCard` gains three optional props: `sessions` (array of rows), `expanded` (boolean) and `onToggleExpand` (function).
  - When `sessions` is absent the card renders exactly as today, so the Weekly, Monthly and Yearly reports are untouched.
  - Click handling: if `editMode && onEditTime`, open the editor (today's behavior); otherwise, if `onToggleExpand` is set, toggle.
  - When the card can expand, give it `role="button"` and `aria-expanded`, with a `showSessions` / `hideSessions` aria-label. The Report tab captures Tab globally to cycle subpages, so keyboard focus is not a goal here.
- `DailyReport`:
  - Holds `expandedItemIds` state (a `Set`).
  - Groups `reportLogs` by `itemId` once, and builds rows with `toSessionRows` for each breakdown entry.
  - Calls `useTimezone()` so a timezone change re-renders the times.

## Editing time (edit mode)

`EditTimeModal` does not change. It still sets the item's total for the day and calls `onSave(deltaSeconds)`. Its Delete button still calls `onDelete()`, which App.jsx maps to a delta of `−currentSeconds`. Only the way the delta is applied changes.

### Rules (pure `planTimeEdit`)

Inputs:

- `entries`: every row with that `itemId` in the day's `loggedAt` range
- `deltaSeconds`
- `anchorMs`
- `dayStartMs`

**Anchor:** `anchorMs` is now if the edited date is today in the home timezone, and `lastSecondOfDay(date)` (23:59:59) otherwise. The check happens at save time, not render time.

1. `shown = max(0, Σ duration)`. This matches what the card and modal display (`buildBreakdown` clamps at 0). Then `target = shown + deltaSeconds`. If `deltaSeconds === 0`, return an empty plan.
2. If `target ≤ 0` (Delete, or a total typed as 0), delete every entry, including old negative ones. Done.
3. `positives` = entries with `duration > 0`, sorted by `loggedAt` ascending (ties broken by `id`).
4. **Legacy fold.** If `Σ duration ≤ 0` and negative entries exist, delete the negatives and set `base = Σ positives`. Otherwise set `base = Σ duration` and leave the negatives alone. Only old negative rows can reach this branch.
5. `d = target − base`.
6. **`d > 0`:**
   - With no positives, create `{ loggedAt: anchorMs, duration: d }`.
   - Otherwise the latest positive (last by `loggedAt`) becomes `{ loggedAt: anchorMs, duration: latest.duration + d }`.
7. **`d < 0`:** set `remaining = −d` and walk the positives from latest to earliest.
   - If `s.duration > remaining`: set `duration = s.duration − remaining` and `loggedAt = max(s.loggedAt − remaining × 1000, dayStartMs)`, then stop.
   - Otherwise: delete `s` and subtract `s.duration` from `remaining`. Stop once `remaining` reaches 0.
   - The clamp keeps the entry on its day. For a session that crossed midnight, the end stops at 00:00 and the session keeps its new, shorter length, so its start ends up later than before (23:50–00:20 shortened by 25 minutes becomes 23:55–00:00).
   - Because `target > 0` here, the walk always stops before running out of sessions.

**Overlap fix** (added 2026-10-03). After the rules above, `planTimeEdit` runs `resolveOverlaps` on the item's resulting rows:

- The item's session that ends latest stays put.
- Each earlier session of the item that overlaps a later one slides back just far enough, keeping its length. This cascades down the item's list.
- Slid rows join `updates` with unchanged durations, so the invariant below still holds.
- When two sessions end at the same moment, the newer row (higher id) stays put.
- A slid session never ends before `dayStartMs`; in that rare case a small overlap can remain.
- Example: A has 20:00–20:30 and 20:40–20:50. At 21:00 you add 30 minutes, so the latest becomes 20:20–21:00, and 20:00–20:30 slides back to 19:50–20:20.
- An overlap that already existed in the item (for example between old noon-stamped rows) is fixed the same way the next time the item's day is edited.

**Invariant:** once the plan is applied, the item's entries for that day sum to `max(0, target)`. Tests assert this for every case.

Return shape: `{ updates: [{ id, loggedAt, duration }], deleteIds: [id], create: { loggedAt, duration } | null }`.

### Database

`editItemDayTime(itemId, dateStr, deltaSeconds, now = Date.now())` in `database.js`:

- Runs one `rw` transaction over `practiceLogs` and `practiceItems`: read the entries, compute the anchor, plan, apply.
- Updated rows get `date = formatInTimezone(loggedAt, tz)` and keep their `syncedOnce` value; `pushLog` flips it on success.
- A created row gets a new `uid`, the item's `uid` and `syncedOnce: false`, the same as `addLog`.
- Returns `{ upserted: [full rows], deleted: [full rows] }`. Deleted rows are captured before deletion.
- `addAdjustmentLog` is deleted. `database.js` no longer needs `noonInHomeTz`.

### Hook

`useReports.handleManualTimeAdjust(itemId, deltaSeconds, date)` keeps its name and signature, so App.jsx does not change.

1. It calls `editItemDayTime`.
2. When signed in, it calls `backend.pushLog` for each upserted row and `backend.deleteLogRemote` for each deleted row. Each call gets its own `.catch(console.error)`, matching `handleMergeToYesterday`.

## Merge to yesterday

`reattributeLogsToDate(logIds, newDateStr)` keeps its signature. It returns every row it changed (the merged rows plus any slid rows), and `handleMergeToYesterday`, which does not change, pushes them all. Stamping goes through two pure helpers:

- `dayEndMs = lastSecondOfDay(newDateStr, tz)`.
- **`planPackIntoDay(entries, { dayStartMs, dayEndMs })` lines up each item on its own.**
  - An item's positive entries are sorted by `loggedAt` ascending and packed back to back so its last one ends at `dayEndMs`.
  - Walk from the latest with `cursor = dayEndMs`. Each entry gets `loggedAt = max(cursor, dayStartMs)`, then `cursor = loggedAt − duration × 1000`.
  - Every merged item therefore ends at 23:59:59, and a trashed item's rows never take a visible item's slot.
- Negative entries get `loggedAt = dayEndMs`.
- **`resolveOverlaps` then fixes each item's list on `newDateStr`.** It runs over the merged rows together with the merged items' sessions already on that day. The merged rows end latest and stay; the item's earlier sessions slide back where they overlap. Example: yesterday A has 22:00–23:50 and today A has 00:05–00:35. After the merge, today's session shows 23:29–23:59 and yesterday's slides back to 21:39–23:29.
- Every changed entry gets `date = newDateStr`.
- Sessions of different items may overlap. This is accepted: bucketing only reads `loggedAt`, and totals, streaks and goals only sum durations.

## Time helpers (`tzDateHelpers.js`)

- `formatClockInTimezone(epochMs, tz)` returns `"HH:MM"`.
  - It uses `Intl.DateTimeFormat` with `hourCycle: 'h23'` and two-digit hour and minute. The string is assembled from `formatToParts`, and the formatter is cached per timezone like the existing ones.
  - `hour12: false` alone is not enough, because some engines render just after midnight as "24:07".
- `lastSecondOfDay(dateStr, tz)` returns `getDateRangeUtc(dateStr, tz).endMsExclusive − 1000`.
  - Do not build it with `tzLocalToUtcMs(…, 23, 59, 59)`. That function is only documented as safe for 00:00 and 12:00.

## Sync

### 1. Changed durations propagate

`logCodec.diff` compares `duration` as well as `loggedAt`: when `typeof data.duration === 'number'` and it differs from `existing.duration`, set `fields.duration`. `pullAll` and the live listener's `'modified'` path share `diff`, so this one change covers both.

### 2. Deleting a single session

- **New backend method** `deleteLogRemote(localLog, userId)`: `withOfflineQueue('delete_log', buildPayload, onlineFn)`.
  - Payload: `{ uid, itemName, duration, date }`. The last three exist only for the Pending changes label.
  - Online, it calls `deleteDoc` on `logsRef(userId)/uid`. This is a hard delete, which `pushDeleteItem` already does for logs.
  - Declared in `backendInterface.js`.
- **Other devices that are online:** the existing `'removed'` handler in `subscribeToChanges` already deletes the local row.
- **Other devices that missed the event:** `pullAll` gains a log-deletion reconciliation step, matching items, notes, practices and goals.
  - Build the set of remote log uids from **every** remote doc that has a `uid`, including docs whose parent item can't be resolved locally.
  - Delete local logs where `syncedOnce && uid && !remoteLogUids.has(uid)`. Unsynced local rows are kept for `pushAllLocal`.
  - The step runs after the logs add/update transaction and before item-deletion reconciliation.
  - The existing `logsSnap.metadata.fromCache` bail returns before this step, so a cached snapshot never deletes anything.
  - It is only safe under the Decisions assumption that `syncedOnce: true` means the row is in the cloud. The v14 upgrade backfilled `syncedOnce: true` onto every row that existed then.

### 3. Offline edits and merges survive reconnect (fixes an existing bug)

**The bug today:** an offline Merge to yesterday is silently undone on reconnect.

1. `pushLog` queues `create_log` without `loggedAt`.
2. On reconnect `pullAll` runs first, and `logCodec.diff` overwrites the local `loggedAt` with the cloud's old value.
3. `flushSyncQueue` then re-reads the reverted row and pushes it.

Now that duration is diffed too, offline edits would be lost the same way.

**Fix**, following the existing enriched-payload pattern (`replayNotePayload` and the others):

- `pushLog`'s `buildPayload` adds `loggedAt`. It already carries `duration`, `date`, `itemUid`, `itemName` and `uid`.
- The `'create_log'` branch of `flushSyncQueue` calls a new `replayLogPayload(payload, userId)`:
  - A legacy payload has no numeric `loggedAt`. For it, return `false`, and the caller falls back to today's behavior: re-read the local row and `pushLog` it. Keep this fallback, as the other replay helpers do.
  - If no local row has that uid, return `true` and do nothing. The row was removed locally since it was queued, by a remote deletion or an item cascade. A remote deletion wins over a queued edit.
  - Otherwise, write `{ loggedAt, duration, date }` from the payload back onto the local row, then `pushLog` the updated row.
- The `'delete_log'` branch of `flushSyncQueue` calls `deleteLogRemote`, then deletes any local row with that uid. The local delete is needed because `pullAll` re-adds the row from the cloud before the flush runs.

These queued sequences must end correctly; tests cover each:

| Offline sequence | Replay | Final state |
|---|---|---|
| Edit, then delete | The pull re-adds the row, the edit replays, the delete removes it from cloud and local | Deleted |
| Create, then delete (never in the cloud) | The create replay finds no row and skips; the delete is a no-op on both sides | Gone |
| Edit twice | Both entries replay in order | Second edit wins |
| Merge to yesterday | The pull reverts the times, the replay restores them and pushes | Merged |

### 4. Pending changes label

`pendingActionFormatter` handles `'delete_log'` with a new key, `offline.action.deleteLog`:

- en: "Deleted {duration} min on {name} ({date})"
- zh: "删除了 {name} 上的 {duration} 分钟（{date}）"

Queued edits and merges keep the existing `createLog` label, which shows the entry's new duration.

## i18n

New keys, added to both `en.json` and `zh.json`:

| Key | en | zh |
|---|---|---|
| `sessionAdjustment` | Adjustment | 调整 |
| `showSessions` | Show sessions | 显示练习记录 |
| `hideSessions` | Hide sessions | 隐藏练习记录 |
| `offline.action.deleteLog` | Deleted {duration} min on {name} ({date}) | 删除了 {name} 上的 {duration} 分钟（{date}） |

## Known limitations and side effects

- Sessions of different items can overlap; an item's own list never does. This is fine in the per-item list; the future day timeline will need to handle it.
- The overlap fix can move sessions the timer recorded: an item's earlier sessions slide back to make room for its latest one.
- Adding time to an item while its timer is running produces two overlapping sessions once the timer stops.
- Moving an extended session to "now" drops its original start time. This was chosen deliberately.
- A device still on the old app version ignores changed durations and missed deletions until it reloads into the new version.
- An edit whose push fails while online (not the offline path) is reverted by the next `pullAll`. Every other collection behaves the same way today.
- Stats "total sessions" counts rows. Edits no longer add rows, so edits stop inflating that count.

## Out of scope

- The whole-day timeline across items.
- Editing or deleting one session directly.
- Session lists on the Weekly, Monthly or Yearly reports.
- Showing the running timer as a session.
- Preventing overlaps between different items.

## Testing

Follow the CLAUDE.md testing rules: pin the timezone with `await setTimezone('America/Los_Angeles')`, and pass `now` explicitly instead of using fake timers.

- **New `tests/sessions.test.js`** (pure functions):
  - `toSessionRows`: start is `loggedAt − duration`, rows are sorted by start, and negative rows come last as adjustments.
  - `planTimeEdit`:
    - adding lengthens the latest session and moves it to the anchor
    - adding with no sessions creates one
    - subtracting within the latest session keeps its start
    - subtracting spills over: the latest is deleted and the previous one shortened
    - an exact spill deletes the session
    - a target of 0 deletes everything, negatives included
    - negatives are untouched when `Σ > 0`
    - the legacy fold applies when `Σ ≤ 0`
    - the midnight clamp
    - a delta of 0 is a no-op
    - the sum invariant holds in every case
  - `planPackIntoDay`:
    - entries are packed back to back in their original order, the last ending at `dayEndMs`
    - each item is lined up on its own, so every item ends at `dayEndMs`
    - negatives go to `dayEndMs`
    - the clamp at `dayStartMs`
  - `resolveOverlaps`:
    - an earlier overlapping session slides back, keeping its length
    - the slide cascades down the item's list
    - non-overlapping sessions and other items are left alone
    - on a tie the newer row stays
    - the day-start clamp
  - `planTimeEdit` applies the overlap fix after adding time, and also fixes an overlap that already existed.
- **`tests/database.test.js`** (overlap fix): `editItemDayTime` slides an overlapping earlier session back and returns it for upload; `reattributeLogsToDate` lines up each item on its own and slides the item's session already on that day back, leaving other items alone.
- **`tests/tzDateHelpers.test.js`**:
  - `formatClockInTimezone` gives "21:02", and just after midnight gives "00:07" rather than "24:07".
  - One instant formats differently in Los Angeles and Tokyo.
  - `lastSecondOfDay` formats as 23:59:59 local, on a normal day and on a DST fall-back day in Los Angeles.
- **`tests/database.test.js`**:
  - `editItemDayTime` for today (with an explicit `now`) and for a past day: Dexie and the return value both reflect the creates, updates and deletes.
  - Packing in `reattributeLogsToDate` replaces the current noon test.
  - The `addAdjustmentLog` test is removed.
- **`tests/useReports.test.js`**: swap the `addAdjustmentLog` fixture for `addLog(…, { loggedAt })`.
- **`tests/codecs.test.js`**: `logCodec.diff` reports a changed `duration`.
- **`tests/firebaseBackend.sync.test.js`**:
  - `pullAll` adopts a remote duration change.
  - `pullAll` deletes a synced log that is missing from the cloud, keeps an unsynced one, keeps a synced log whose remote parent can't be resolved, and still bails on `fromCache`.
  - The live `'modified'` path adopts a duration change.
  - Offline merge regression: a re-stamped local row with an enriched `create_log` queued, and the remote still old. After `pullAll` then `flushSyncQueue`, local and remote both hold the new values.
  - A legacy `create_log` payload (no `loggedAt`) falls back to reading the local row.
  - The `delete_log` replay removes the remote doc and the local row that `pullAll` re-added.
  - The edit-then-delete offline sequence ends deleted.
- **`tests/pendingActionFormatter.test.js`**: the `delete_log` label.
- **`tests/reportItemCard.test.jsx`**:
  - Tapping toggles the rows and shows "21:02 – 21:07".
  - In edit mode, tapping calls `onEditTime` and does not toggle.
  - Without `sessions`, the card renders as before.

## Docs to update after implementation (CLAUDE.md)

- **Database section:** `addAdjustmentLog` is gone, `editItemDayTime` is new, and `reattributeLogsToDate` now packs to 23:59:59.
- **"Merge to yesterday" paragraph:** noon is replaced by packing.
- **Sync correctness:**
  - the log `duration` diff
  - log-deletion reconciliation in `pullAll` and the `syncedOnce` assumption it depends on
  - the enriched `create_log` payload and `replayLogPayload`
  - `delete_log`
- **Date helpers:** `formatClockInTimezone`, `lastSecondOfDay` and `src/utils/sessions.js`.
- **Tests list:** add `sessions`.
