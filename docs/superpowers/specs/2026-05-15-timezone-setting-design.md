# Timezone Setting — Design Spec

**Date:** 2026-05-15
**Status:** Draft (awaiting plan)

## Goal

Let the user designate a single "home" timezone that determines how every date in the app — daily/weekly/monthly/yearly reports, "today", goals, notes, streaks — is computed and displayed, regardless of where their device currently is. The setting is account-wide and synced across devices.

## Motivation

Today, every log's date is computed as `YYYY-MM-DD` in whatever local timezone the device is in at save time, with no UTC instant preserved. This means:

- Traveling causes calendar dates to drift; a log made at 11pm in NYC and one made the next morning in Tokyo can land on the same day or split across two days depending on device-local clocks.
- Once a date string is written, the original moment is gone — there is no way to re-derive "what date was this in PT?" later.

Logging the UTC instant on every new practice log and rendering through a configurable timezone fixes both problems and makes the existing data layer lossless going forward.

## Decisions (confirmed via brainstorming)

1. **Backfill of legacy logs:** existing rows have only a date string and no UTC timestamp. They get a synthetic `loggedAt = noon America/Los_Angeles` on their stored date. This is a fiction but a stable one; noon is 12 hours from either DST/midnight edge, so reinterpreting the same instant in any other TZ within ±12 hours still resolves to the same calendar date.
2. **Setting scope:** account-wide, synced via a `timezone` field on the Firestore `users/{uid}` document. Mirrored to `localStorage['drummate_timezone']` for fast first-paint and offline use.
3. **UI:** full IANA dropdown populated from `Intl.supportedValuesOf('timeZone')`, added as a new row in `SettingsPanel.jsx` between Language and Time Unit.
4. **Default value for this user (the one existing user) on first launch after rollout:** `America/Los_Angeles`. No device-auto-detect is performed.
5. **Data model:** new `loggedAt` field on practice logs (UTC epoch ms). `date` is retained as a denormalized read-cache derived from `loggedAt + currentTz`, for backward compatibility with the existing Firestore wire format and for cheaper indexed equality reads.
6. **Practice-time edits (daily-report "Edit"):** the existing flow writes a new adjustment log via `addLog(itemId, deltaSeconds, date)`. Adjustment logs are user-attributed to a calendar date, not to "now," so their `loggedAt` is stamped at noon in the configured home TZ on the edited date — same convention as legacy backfill. This is implemented by splitting `addLog` into two explicit functions (see Components below).
7. **Notes:** `date` on notes is user-picked in the create modal and is a calendar attribution, not a timestamp. No schema change; notes stay as-is.
8. **Practice Goal:** `startDate` / `endDate` in localStorage are user-picked calendar dates. No data change. Goal math (`daysLeft`, required-daily-average) will pick up the new "today" through the date helpers automatically.

## Architecture

### New: `src/services/timezoneService.js`

Module-level current-timezone holder.

- `currentTz: string` — module-level variable, initialized at import to either `localStorage['drummate_timezone']` or `'America/Los_Angeles'`.
- `getTimezone(): string` — synchronous getter. Called from date helpers.
- `setTimezone(tz: string, userId?: string): Promise<void>` — validates `tz` via `new Intl.DateTimeFormat('en-CA', { timeZone: tz })` in a try/catch, updates the module var, writes `localStorage`, and (if `userId` provided) writes the Firestore user doc via `firebaseBackend.setUserSetting(userId, 'timezone', tz)`. Firestore write is fire-and-forget consistent with other backend pushes.
- `initTimezone(userId?: string): Promise<void>` — called on auth resolve. If `userId`, fetch the user doc via `firebaseBackend.getUserSettings(userId)`:
  - if `timezone` exists → use it (overwrites localStorage if different).
  - if `timezone` absent → write `'America/Los_Angeles'` to Firestore (this is the one-time backfill for the existing user) and use it.
- `detectDeviceTimezone(): string` — `Intl.DateTimeFormat().resolvedOptions().timeZone`. Reserved for future brand-new-account flow; not used in this rollout.

### New: `src/utils/tzDateHelpers.js` (or extend `dateHelpers.js`)

All TZ-aware date math lives here.

- `formatInTimezone(epochMs: number, tz?: string): string` — returns `YYYY-MM-DD` using `Intl.DateTimeFormat('en-CA', { timeZone: tz ?? getTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' })`. Locale `en-CA` natively formats as `YYYY-MM-DD`.
- `getTodayString(): string` — re-exported, now equivalent to `formatInTimezone(Date.now())`.
- `getDateRangeUtc(dateStr: string, tz?: string): { startMs: number, endMsExclusive: number }` — converts a calendar date in the configured TZ into a UTC range query.
- `noonInHomeTz(dateStr: string, tz?: string): number` — returns the UTC epoch ms for 12:00 local on `dateStr`. Used by legacy backfill and adjustment-log stamping.
- `legacyDateToLoggedAt(dateStr: string): number` — wrapper around `noonInHomeTz(dateStr, 'America/Los_Angeles')`. Fixed to PT regardless of current setting; legacy data is being declared as having always been PT.

The existing helpers (`toDateString`, `shiftDate`, `getWeekStart/End`, `getMonthStart/End`, `getYearStart/End`, `formatDateLabel`) continue to operate on date strings; they are unchanged except that `toDateString(date)` is reimplemented as `formatInTimezone(date.getTime())`.

### Modified: `src/services/database.js`

**Schema bump to version 13** (current head is v12, which added `metronomePractices`).

- All existing tables carry forward unchanged from v12, except `practiceLogs` which gains `loggedAt` as an indexed field: `'++id, itemId, itemUid, date, duration, uid, loggedAt'`.
- Full v13 stores block:
  ```js
  db.version(13).stores({
    practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
    practiceLogs:  '++id, itemId, itemUid, date, duration, uid, loggedAt',
    notes:         '++id, &uid, itemUid, date, trashed',
    metronomePractices: '++id, &uid, sortOrder',
    syncQueue:     '++id, action, collection, localId',
  })
  ```
- `.upgrade()` block walks every `practiceLogs` row: if `loggedAt` absent, write `legacyDateToLoggedAt(row.date)`. Idempotent on retry.

**Function split:**

- `addLog(itemId: number, duration: number): Promise<number>` — real-time logging. Stamps `loggedAt = Date.now()`, derives `date = formatInTimezone(loggedAt)`. Used by the practice timer's stop path.
- `addAdjustmentLog(itemId: number, duration: number, dateStr: string): Promise<number>` — calendar-attributed adjustment. Stamps `loggedAt = noonInHomeTz(dateStr)`, sets `date = dateStr`. Used by `handleManualTimeAdjust`. Call sites in `App.jsx` switch from `addLog(itemId, delta, reportDate)` to `addAdjustmentLog(itemId, delta, reportDate)`.

**Range queries rewritten to use `loggedAt`:**

- `getTodaysLogs()` → `getDateRangeUtc(getTodayString())` → `db.practiceLogs.where('loggedAt').between(startMs, endMsExclusive, true, false).toArray()`.
- `getLogsByDate(dateStr)` → same pattern with the supplied `dateStr`.
- `getLogsByDateRange(startDate, endDate)` → compute `startMs = getDateRangeUtc(startDate).startMs`, `endMsExclusive = getDateRangeUtc(endDate).endMsExclusive`, range query.

The `date` field stays populated on every row (denormalized from `loggedAt + currentTz`) for the wire format and for any consumer not yet migrated, but it is no longer the source of truth for grouping.

### Modified: `src/services/backends/firebaseBackend.js`

- Add `getUserSettings(userId)` — reads `users/{userId}` doc; returns `{}` on miss.
- Add `setUserSetting(userId, key, value)` — `setDoc(doc(db, 'users', userId), { [key]: value }, { merge: true })`. Generic so future settings (theme, etc.) reuse it.
- Update log push (`pushLog`, `pushAllLocal`) to write both `logged_at` (epoch ms) and `date` (the denormalized string).
- Update log pull (`pullAll`, `subscribeToChanges` log handlers) to prefer `logged_at` when present; if absent on a legacy row, synthesize via `legacyDateToLoggedAt(remote.date)` so old-client writes still flow in correctly.

### Modified: `src/components/SettingsPanel.jsx`

- New row labeled `t('timezone')`.
- `<select>` populated once from `Intl.supportedValuesOf('timeZone')` (alphabetically sorted), current value bound to `getTimezone()`.
- On `onChange` → `await setTimezone(newTz, userId)` → call the existing settings-changed refresh path (bump a key or trigger `loadData()`) so visible reports re-fetch.
- Add `timezone` translation keys to `LanguageContext.jsx` (`en` and `zh`).

### Modified: `src/App.jsx`

- After `AuthProvider` resolves `userId`, call `await initTimezone(userId)` before the first `loadData()`. (Pre-resolve, the module-level default carries the app.)
- Swap `addLog(itemId, delta, reportDate)` → `addAdjustmentLog(itemId, delta, reportDate)` in `handleManualTimeAdjust`.
- Pass `userId` into `SettingsPanel` so it can call `setTimezone(tz, userId)`.

## Data flow scenarios

1. **First launch after this lands (existing user):** Auth resolves → `initTimezone(userId)` fetches the user doc → no `timezone` field → writes `"America/Los_Angeles"` to Firestore + localStorage. Dexie v11 upgrade runs in parallel, backfilling `loggedAt = noon PT` on every existing log. All reports continue to show identical data to before. Goal math and "today" indicators are now PT-anchored.

2. **User switches TZ in settings:** `setTimezone("Asia/Tokyo", userId)` → module var + localStorage updated immediately → Firestore write in background → `loadData()` triggers re-fetch → daily report header and weekly/monthly bucketing recompute. Logs that fell near midnight PT may shift to adjacent calendar dates in Tokyo's view; this is correct because the `loggedAt` UTC instant is preserved. Legacy logs (anchored at noon PT) shift by ~17 hours and land on the next Tokyo calendar date — acceptable given they were synthetic instants to begin with.

3. **Second device logs in:** `initTimezone(userId)` reads Firestore → finds `"America/Los_Angeles"` → uses it. The device's own OS timezone is ignored.

4. **Daily-report Edit on May 8 while it is May 15:** `handleManualTimeAdjust(itemId, +600, "2026-05-08")` → `addAdjustmentLog(itemId, 600, "2026-05-08")` → row written with `loggedAt = 2026-05-08T19:00:00Z`, `date = "2026-05-08"`. The adjustment groups under May 8 in the daily report. A later TZ switch from PT to ET shifts the row's `loggedAt`-derived date by zero days (still May 8). A switch to JST shifts it forward one day (May 9) — same as legacy logs, consistent semantics.

5. **Practice timer stops on a transatlantic flight, offline:** `addLog(itemId, duration)` writes `loggedAt = Date.now()` (the actual practice moment in UTC) and `date = formatInTimezone(loggedAt)` (PT-derived since that's the home zone). Sync queue flushes hours later when Firestore reconnects; the stored instant is unchanged.

## Edge cases

- **Pre-auth render (cold start):** module-level default (`localStorage` or `'America/Los_Angeles'`) carries the app. Once auth resolves, `initTimezone` reconciles. If cached and remote differ, remote wins; `loadData()` re-renders.
- **Invalid TZ string** (corrupted cache, removed from runtime Intl): construction try/catch in `setTimezone` and `initTimezone`; fall back to `'America/Los_Angeles'` and overwrite the bad cache.
- **Dexie migration partial failure:** transactional rollback on abort. On retry, the upgrade re-derives `loggedAt` only for rows that still lack it. Idempotent.
- **Firestore wire compatibility:** push always writes both `logged_at` and `date`. Pull prefers `logged_at`; if absent (older client), synthesize from `date` via `legacyDateToLoggedAt`. Old clients reading new data still see a valid `date` field.
- **Cross-device merge of legacy logs:** two devices independently backfilling the same legacy log produce identical `loggedAt` (deterministic from `date` + PT noon). Dedup-by-uid handles it.
- **Daylight saving transitions:** `Intl.DateTimeFormat({ timeZone })` is DST-aware; no manual offset math.

## Testing

### Unit tests

- `formatInTimezone(epochMs, tz)`:
  - `formatInTimezone(Date.UTC(2026, 4, 15, 7, 0, 0), 'America/Los_Angeles')` → `"2026-05-15"` (midnight PT).
  - `formatInTimezone(Date.UTC(2026, 4, 15, 14, 0, 0), 'Asia/Tokyo')` → `"2026-05-15"` (23:00 JST same day).
  - DST boundary: `formatInTimezone(Date.UTC(2026, 2, 8, 10, 0, 0), 'America/Los_Angeles')` (the spring-forward Sunday) → `"2026-03-08"`.
- `getDateRangeUtc("2026-05-15", "America/Los_Angeles")` → `{ startMs: Date.UTC(2026, 4, 15, 7, 0, 0), endMsExclusive: Date.UTC(2026, 4, 16, 7, 0, 0) }`.
- `legacyDateToLoggedAt("2026-05-08")` (PDT, UTC-7) → `Date.UTC(2026, 4, 8, 19, 0, 0)`.
- `legacyDateToLoggedAt("2026-01-08")` (PST, UTC-8) → `Date.UTC(2026, 0, 8, 20, 0, 0)`.

### Manual checks

- `npm run build` succeeds.
- After upgrade, every existing log has a `loggedAt`. Spot-check via DevTools / Dexie.
- Switch TZ in Settings PT → JST: daily report header changes; an existing PT-evening log moves to the next day in JST view.
- Create a new log in PT, switch to JST, confirm it shifts forward by one day.
- Daily-report "Edit" on a past date writes a row visible only on that date, in any TZ within ±12h.
- Language toggle, time-unit toggle, language `t('timezone')` strings render in both `en` and `zh`.

## Out of scope

- New-account auto-detect flow (`detectDeviceTimezone` exists but is not wired up).
- Cross-midnight session splitting (current behavior preserved: log is stamped at timer-stop instant).
- Per-device TZ override.
- Goal-date or note-date re-anchoring (these are calendar attributions, not timestamps).
- Migrating away from the `date` denormalization on logs. It stays for now.

## Files touched (summary)

**New:**
- `src/services/timezoneService.js`
- `src/utils/tzDateHelpers.js`
- `docs/superpowers/specs/2026-05-15-timezone-setting-design.md` (this doc)

**Modified:**
- `src/utils/dateHelpers.js` (reimplement `toDateString` via TZ-aware formatter)
- `src/services/database.js` (schema v11, upgrade, `addLog` / `addAdjustmentLog` split, range-query rewrites)
- `src/services/backends/firebaseBackend.js` (`getUserSettings` / `setUserSetting`, log push/pull `logged_at` handling)
- `src/components/SettingsPanel.jsx` (timezone row)
- `src/contexts/LanguageContext.jsx` (timezone translation keys)
- `src/App.jsx` (`initTimezone` on auth, `addAdjustmentLog` swap, pass `userId` into `SettingsPanel`)

**Likely safe-by-default but worth verifying:**
- `StatsReport`, `DailyReport`, `WeeklyReport`, `MonthlyReport`, `YearlyReport`, `ReportGeneratorModal`, `GoalCard`, `GoalBanner` — none of these compute dates directly; they consume helpers and DB query results. They should work unchanged once helpers and queries are TZ-aware. Verify visually.
