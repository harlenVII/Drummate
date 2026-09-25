# Daily Practice Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Daily report show each item's individual practice sessions with 24-hour start and end times. Make edit mode, Merge to yesterday, and sync produce and keep realistic session times.

**Architecture:**
- A new pure module, `src/utils/sessions.js`, owns every rule: display rows, edit planning and merge packing. It never touches the database.
- `database.js` applies those plans in Dexie transactions, and `useReports` pushes the results.
- `firebaseBackend.js` learns to sync three new things: changed durations, deletions of a single log, and queued offline edits.
- The UI changes stay inside `ReportItemCard`, which gets optional expand props, and `DailyReport`.

**Tech Stack:** React 19, Vite 7, Tailwind v4, Dexie 4 (IndexedDB; fake-indexeddb in tests), Firebase Firestore through the injectable `firestoreAccess` seam, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-25-daily-sessions-design.md`

## Global Constraints

- **Time format:** session times are always 24-hour `HH:MM` (e.g. `21:02`) in both languages, shown in the home timezone (`getTimezone()`). A range is written `HH:MM – HH:MM`: an en dash `–` with a space on each side.
- **Data model:**
  - A log's end is `loggedAt` and its start is `loggedAt − duration × 1000`.
  - No new stored fields and no Dexie version bump.
  - Firestore log docs keep exactly their current fields: `uid, item_uid, item_name, date, duration, logged_at, created`.
  - Existing rows are rewritten only by an explicit edit or merge.
- **Text:** all user-facing text goes through `t()`, with keys in both `src/locales/en.json` and `src/locales/zh.json`.
- **Styling:** Tailwind v4 classes only. Colors come from the `accent-*` tokens and never name a hue, so `grep -rnE "(blue|indigo|violet)-[0-9]{2,3}" src/` must still print nothing.
- **Tests:**
  - Tests live in `tests/`.
  - Never call `vi.useFakeTimers()` in a test that awaits Dexie; pass `now` explicitly instead.
  - Pin the timezone with `await setTimezone('America/Los_Angeles')` wherever it matters.
- **Lint:** ESLint parses at `ecmaVersion: 2020`, which rules out ES2021 syntax. No numeric separators (`1_000`) and no logical assignment (`??=`, `||=`), in tests too.
- **After every task:** `npm run test`, `npm run lint` and `npm run build` all pass. The baseline before Task 1 is 43 test files and 374 tests passing, with lint clean.
- **Verification:** no Playwright or browser automation. The user verifies by hand, using the steps at the end.
- **Commits:** use conventional commits. Commit only the files the task lists, and end each message with a `Co-Authored-By:` trailer naming the Claude model that made the commit. The commands below use the model each task is annotated with.

## Review Focus

1. **Saving just after midnight.** An edit saved after midnight, while the Daily view still shows the previous day, must stay on the viewed day (anchored at 23:59:59) rather than move to the new day. *Test: Task 3, "a save just after midnight still lands on the day being viewed".*
2. **Signed-out edits.** An edit made by a signed-out visitor must change local rows and make no backend calls. *Test: Task 7, "a signed-out edit changes local rows without calling the backend".*
3. **A different home timezone.** When the home timezone differs from the one the sessions were logged in, an edit must act on exactly the rows the Daily card added up for that date. *Test: Task 3, "acts on the rows the Daily view shows for that date in the current timezone".*
4. **Totals that aren't whole minutes.** A total of 5:23 is shown as "5". The result must be exactly the minutes the user typed, even when Save is pressed without changing the number. *Test: Task 2, "matches the modal for a total that is not a whole number of minutes".*
5. **Sessions that cross midnight.** These must display as a plain range such as `23:50 – 00:20`. *Test: Task 8, "shows a session that crossed midnight as a plain time range".*

---

### Task 1: Time helpers `[model: haiku]`

**Files:**
- Modify: `src/utils/tzDateHelpers.js`. Add a formatter cache near the top, `formatClockInTimezone` after `formatInTimezone`, and `lastSecondOfDay` after `getDateRangeUtc`.
- Test: `tests/tzDateHelpers.test.js`

**Interfaces:**
- Consumes: the existing `getDateRangeUtc(dateStr, tz) → { startMs, endMsExclusive }` and `formatInTimezone(epochMs, tz) → 'YYYY-MM-DD'`.
- Produces:
  - `formatClockInTimezone(epochMs: number, tz: string) → string`: `"HH:MM"`, 24-hour, hours 00–23.
  - `lastSecondOfDay(dateStr: string, tz: string) → number`: epoch ms of 23:59:59 local time on that date.

- [ ] **Step 1: Write the failing tests**

In `tests/tzDateHelpers.test.js`, replace the import block at the top with:

```js
import {
  formatInTimezone,
  getDateRangeUtc,
  noonInHomeTz,
  legacyDateToLoggedAt,
  formatClockInTimezone,
  lastSecondOfDay,
} from '../src/utils/tzDateHelpers.js';
```

Then append at the end of the file:

```js
describe('formatClockInTimezone', () => {
  it('formats an instant as 24-hour HH:MM in the given zone', () => {
    // 2026-09-26 04:02 UTC = 2026-09-25 21:02 PDT (UTC-7)
    expect(formatClockInTimezone(Date.UTC(2026, 8, 26, 4, 2, 0), 'America/Los_Angeles')).toBe('21:02');
  });

  it('renders just after midnight as 00:07, never 24:07', () => {
    // 2026-09-25 07:07 UTC = 00:07 PDT
    expect(formatClockInTimezone(Date.UTC(2026, 8, 25, 7, 7, 0), 'America/Los_Angeles')).toBe('00:07');
  });

  it('formats the same instant differently per zone', () => {
    // 2026-09-25 12:30 UTC = 05:30 PDT = 21:30 JST
    const ms = Date.UTC(2026, 8, 25, 12, 30, 0);
    expect(formatClockInTimezone(ms, 'America/Los_Angeles')).toBe('05:30');
    expect(formatClockInTimezone(ms, 'Asia/Tokyo')).toBe('21:30');
  });
});

describe('lastSecondOfDay', () => {
  it('is 23:59:59 local on an ordinary day', () => {
    // Next midnight PDT = 2026-09-26 07:00 UTC; one second earlier.
    const ms = lastSecondOfDay('2026-09-25', 'America/Los_Angeles');
    expect(ms).toBe(Date.UTC(2026, 8, 26, 6, 59, 59));
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-09-25');
  });

  it('is 23:59:59 local on a DST fall-back day', () => {
    // 2026-11-01 PT falls back 02:00 PDT -> 01:00 PST, so the day ends in PST (UTC-8).
    const ms = lastSecondOfDay('2026-11-01', 'America/Los_Angeles');
    expect(ms).toBe(Date.UTC(2026, 10, 2, 7, 59, 59));
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-11-01');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tzDateHelpers.test.js`
Expected: FAIL. The new tests error with `formatClockInTimezone is not a function` or `lastSecondOfDay is not a function`.

- [ ] **Step 3: Implement**

In `src/utils/tzDateHelpers.js`, directly below `const cachedOffsetFormatters = new Map();`, add:

```js
const cachedClockFormatters = new Map();
```

Directly below the existing `formatInTimezone` function, add:

```js
// Clock formatter for session times. hourCycle 'h23' rather than
// hour12: false: some engines map hour12: false to h24 and render just after
// midnight as "24:07".
function getClockFormatter(tz) {
  let f = cachedClockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    cachedClockFormatters.set(tz, f);
  }
  return f;
}

// "HH:MM" (24-hour, 00-23) for a UTC instant viewed in `tz`.
export function formatClockInTimezone(epochMs, tz) {
  const parts = getClockFormatter(tz).formatToParts(new Date(epochMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('hour')}:${get('minute')}`;
}
```

Directly below the existing `getDateRangeUtc` function, add:

```js
// 23:59:59 local on `dateStr`: one second before the next local midnight.
// Built from getDateRangeUtc, not tzLocalToUtcMs(..., 23, 59, 59), which is
// only documented safe for 00:00 and 12:00.
export function lastSecondOfDay(dateStr, tz) {
  return getDateRangeUtc(dateStr, tz).endMsExclusive - 1000;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tzDateHelpers.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/utils/tzDateHelpers.js tests/tzDateHelpers.test.js
git commit -m "feat(time): add 24-hour clock formatter and last-second-of-day helper" -m "Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure session planner module `[model: sonnet]`

**Files:**
- Create: `src/utils/sessions.js`
- Test: create `tests/sessions.test.js`

**Interfaces:**
- Consumes: nothing. The module is pure. Its input rows are `practiceLogs` rows shaped `{ id, loggedAt, duration, ... }`.
- Produces:
  - `toSessionRows(logs) → Array<{ id, kind: 'session' | 'adjustment', startMs: number | null, endMs: number | null, duration: number }>`. Sessions come first, sorted by start; negative rows follow as adjustments.
  - `planTimeEdit(entries, deltaSeconds, { anchorMs, dayStartMs }) → { updates: Array<{ id, loggedAt, duration }>, deleteIds: Array<id>, create: { loggedAt, duration } | null }`
  - `planPackIntoDay(entries, { dayStartMs, dayEndMs }) → Array<{ id, loggedAt }>`

- [ ] **Step 1: Write the failing tests**

Create `tests/sessions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { toSessionRows, planTimeEdit, planPackIntoDay } from '../src/utils/sessions.js';

const MIN = 60 * 1000;
const DAY_START = 1780000000000; // stands in for 00:00 of the edited day
const at = (minutes) => DAY_START + minutes * MIN; // wall-clock minutes after 00:00
const row = (id, endMinutes, durationSeconds) => ({ id, loggedAt: at(endMinutes), duration: durationSeconds });
const total = (entries) => entries.reduce((s, e) => s + e.duration, 0);

// Apply a plan the way editItemDayTime does, so tests can check the result.
function apply(entries, plan) {
  const byId = new Map(entries.map((e) => [e.id, { ...e }]));
  for (const id of plan.deleteIds) byId.delete(id);
  for (const u of plan.updates) Object.assign(byId.get(u.id), u);
  const out = [...byId.values()];
  if (plan.create) out.push({ id: 'new', ...plan.create });
  return out;
}

describe('toSessionRows', () => {
  it('derives each start from end minus duration and sorts sessions by start', () => {
    const rows = toSessionRows([row(2, 21 * 60 + 45, 300), row(1, 21 * 60 + 7, 300)]);
    expect(rows).toEqual([
      { id: 1, kind: 'session', startMs: at(21 * 60 + 2), endMs: at(21 * 60 + 7), duration: 300 },
      { id: 2, kind: 'session', startMs: at(21 * 60 + 40), endMs: at(21 * 60 + 45), duration: 300 },
    ]);
  });

  it('lists negative rows last as adjustments with no time range', () => {
    const rows = toSessionRows([row(1, 12 * 60, -180), row(2, 9 * 60, 600)]);
    expect(rows.map((r) => r.kind)).toEqual(['session', 'adjustment']);
    expect(rows[1]).toEqual({ id: 1, kind: 'adjustment', startMs: null, endMs: null, duration: -180 });
  });
});

describe('planTimeEdit', () => {
  const NOW = at(22 * 60 + 30);
  const opts = { anchorMs: NOW, dayStartMs: DAY_START };

  it('returns an empty plan for a zero delta', () => {
    expect(planTimeEdit([row(1, 60, 300)], 0, opts)).toEqual({ updates: [], deleteIds: [], create: null });
  });

  it('adding lengthens the latest session and moves it to end at the anchor', () => {
    const entries = [row(1, 21 * 60 + 7, 300), row(2, 21 * 60 + 45, 300)];
    const plan = planTimeEdit(entries, 120, opts);
    expect(plan).toEqual({ updates: [{ id: 2, loggedAt: NOW, duration: 420 }], deleteIds: [], create: null });
    expect(total(apply(entries, plan))).toBe(720);
  });

  it('adding to an item with no sessions creates one ending at the anchor', () => {
    expect(planTimeEdit([], 600, opts)).toEqual({ updates: [], deleteIds: [], create: { loggedAt: NOW, duration: 600 } });
  });

  it('subtracting within the latest session keeps its start and moves its end earlier', () => {
    // Session 2 runs 21:20-21:50 (30 min); remove 20 min -> 21:20-21:30.
    const entries = [row(1, 21 * 60 + 7, 300), row(2, 21 * 60 + 50, 1800)];
    const plan = planTimeEdit(entries, -1200, opts);
    expect(plan).toEqual({ updates: [{ id: 2, duration: 600, loggedAt: at(21 * 60 + 30) }], deleteIds: [], create: null });
  });

  it('subtracting more than the latest session deletes it and shortens the one before', () => {
    // 21:02-21:07 and 21:40-21:45; remove 8 of 10 minutes -> 21:02-21:04 remains.
    const entries = [row(1, 21 * 60 + 7, 300), row(2, 21 * 60 + 45, 300)];
    const plan = planTimeEdit(entries, -480, opts);
    expect(plan.deleteIds).toEqual([2]);
    expect(plan.updates).toEqual([{ id: 1, duration: 120, loggedAt: at(21 * 60 + 4) }]);
    expect(total(apply(entries, plan))).toBe(120);
  });

  it('deletes a session that is exactly used up and leaves earlier ones alone', () => {
    const entries = [row(1, 21 * 60 + 7, 300), row(2, 21 * 60 + 45, 300)];
    expect(planTimeEdit(entries, -300, opts)).toEqual({ updates: [], deleteIds: [2], create: null });
  });

  it('a target of 0 deletes every entry, old negative rows included', () => {
    const entries = [row(1, 9 * 60, 600), row(2, 12 * 60, -180)]; // modal showed 7 min
    expect(planTimeEdit(entries, -420, opts)).toEqual({ updates: [], deleteIds: [1, 2], create: null });
  });

  it('leaves old negative rows alone when the day still adds up to more than 0', () => {
    const entries = [row(1, 9 * 60 + 10, 600), row(2, 12 * 60, -180)]; // shows 7 min
    const plan = planTimeEdit(entries, 120, opts); // 7 -> 9 min
    expect(plan).toEqual({ updates: [{ id: 1, loggedAt: NOW, duration: 720 }], deleteIds: [], create: null });
    expect(total(apply(entries, plan))).toBe(540);
  });

  it('clears old negative rows that cancel out the whole day before adding time', () => {
    const entries = [row(1, 9 * 60, 120), row(2, 12 * 60, -300)]; // sums to -3 min, shows 0
    const plan = planTimeEdit(entries, 240, opts); // user types 4 min
    expect(plan.deleteIds).toEqual([2]);
    expect(plan.updates).toEqual([{ id: 1, loggedAt: NOW, duration: 240 }]);
    expect(total(apply(entries, plan))).toBe(240);
  });

  it('creates a session when only negative rows exist', () => {
    expect(planTimeEdit([row(1, 12 * 60, -300)], 120, opts)).toEqual({
      updates: [], deleteIds: [1], create: { loggedAt: NOW, duration: 120 },
    });
  });

  it('never moves a shortened end before 00:00 of its own day', () => {
    // Crossed midnight: 23:50 yesterday -> 00:20 today (30 min). Remove 25 min.
    const plan = planTimeEdit([row(1, 20, 1800)], -1500, opts);
    expect(plan.updates).toEqual([{ id: 1, duration: 300, loggedAt: DAY_START }]);
  });

  it('matches the modal for a total that is not a whole number of minutes', () => {
    // The card shows 5:23 as "5"; the modal sends typed * 60 - currentSeconds.
    const entries = [row(1, 21 * 60 + 7, 323)];
    expect(total(apply(entries, planTimeEdit(entries, 5 * 60 - 323, opts)))).toBe(300);
    expect(total(apply(entries, planTimeEdit(entries, 7 * 60 - 323, opts)))).toBe(420);
  });

  it('keeps the total equal to what the user typed across mixed cases', () => {
    const cases = [
      { entries: [row(1, 100, 300), row(2, 200, 600), row(3, 300, 900)], delta: -1000 },
      { entries: [row(1, 100, 300), row(2, 200, -60)], delta: 900 },
      { entries: [row(1, 100, 300), row(2, 200, 600)], delta: -899 },
      { entries: [row(1, 100, 60), row(2, 200, -600)], delta: 30 },
    ];
    for (const { entries, delta } of cases) {
      const shown = Math.max(0, total(entries));
      const plan = planTimeEdit(entries, delta, opts);
      expect(total(apply(entries, plan))).toBe(Math.max(0, shown + delta));
    }
  });
});

describe('planPackIntoDay', () => {
  const DAY_END = at(24 * 60) - 1000; // 23:59:59
  const opts = { dayStartMs: DAY_START, dayEndMs: DAY_END };

  it('packs rows back to back in their original order, the last ending at 23:59:59', () => {
    // Practiced 00:10-00:20 and 00:40-01:00.
    const entries = [row(2, 60, 1200), row(1, 20, 600)];
    expect(planPackIntoDay(entries, opts)).toEqual([
      { id: 2, loggedAt: DAY_END },
      { id: 1, loggedAt: DAY_END - 1200 * 1000 },
    ]);
  });

  it('sends negative rows to 23:59:59 without affecting the packing', () => {
    const entries = [row(1, 20, 600), row(2, 30, -120)];
    expect(planPackIntoDay(entries, opts)).toEqual([
      { id: 1, loggedAt: DAY_END },
      { id: 2, loggedAt: DAY_END },
    ]);
  });

  it('never stamps a row before the start of the day', () => {
    // 26 hours of rows cannot fit in one day; the earliest one is pinned to 00:00.
    const entries = [row(1, 10, 3600), row(2, 20, 20 * 3600), row(3, 30, 5 * 3600)];
    expect(planPackIntoDay(entries, opts)).toEqual([
      { id: 3, loggedAt: DAY_END },
      { id: 2, loggedAt: DAY_END - 5 * 3600 * 1000 },
      { id: 1, loggedAt: DAY_START },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sessions.test.js`
Expected: FAIL with a module-resolution error for `../src/utils/sessions.js`.

- [ ] **Step 3: Implement**

Create `src/utils/sessions.js`:

```js
// Pure helpers for practice sessions: the individual practiceLogs rows behind
// an item's daily total on the Daily report.
//
// A row's end is `loggedAt` and its start is `loggedAt - duration * 1000` (the
// practice timer has no pause). Rows with a negative duration are old
// edit-mode adjustments; they have no time range.
//
// Nothing here touches the database, so every rule is unit-tested directly.
// Spec: docs/superpowers/specs/2026-09-25-daily-sessions-design.md

const byLoggedAt = (a, b) => (a.loggedAt - b.loggedAt) || (a.id - b.id);

// Display rows for one item's logs on one day: sessions sorted by start time,
// then adjustments (negative rows) last.
export function toSessionRows(logs) {
  const sessions = logs
    .filter((l) => l.duration > 0)
    .map((l) => ({
      id: l.id,
      kind: 'session',
      startMs: l.loggedAt - l.duration * 1000,
      endMs: l.loggedAt,
      duration: l.duration,
    }))
    .sort((a, b) => (a.startMs - b.startMs) || (a.id - b.id));
  const adjustments = logs
    .filter((l) => l.duration < 0)
    .map((l) => ({ id: l.id, kind: 'adjustment', startMs: null, endMs: null, duration: l.duration }));
  return [...sessions, ...adjustments];
}

// Plan how an edit-mode change to an item's daily total is applied to that
// item's rows for the day.
//
//   entries      every practiceLogs row for the item on that day
//   deltaSeconds the total the user typed minus the total the modal showed
//   anchorMs     "now" when editing today, else 23:59:59 of the edited day
//   dayStartMs   00:00 of the edited day; a shortened row's end never moves
//                before it, or the row would change days
//
// Returns { updates: [{ id, loggedAt, duration }], deleteIds: [id],
//           create: { loggedAt, duration } | null }.
export function planTimeEdit(entries, deltaSeconds, { anchorMs, dayStartMs }) {
  const plan = { updates: [], deleteIds: [], create: null };
  if (deltaSeconds === 0) return plan;

  const sum = entries.reduce((s, e) => s + e.duration, 0);
  // buildBreakdown clamps an item's total at 0, so that is what the modal showed.
  const target = Math.max(0, sum) + deltaSeconds;

  // Delete, or a total typed as 0: remove everything, old negative rows included.
  if (target <= 0) {
    plan.deleteIds = entries.map((e) => e.id);
    return plan;
  }

  const positives = entries.filter((e) => e.duration > 0).sort(byLoggedAt);
  const negatives = entries.filter((e) => e.duration < 0);

  // Legacy fold: old negative rows that cancel out the whole day would swallow
  // the time being added, so clear them first. Otherwise leave them alone.
  let base = sum;
  if (sum <= 0 && negatives.length > 0) {
    plan.deleteIds.push(...negatives.map((e) => e.id));
    base = positives.reduce((s, e) => s + e.duration, 0);
  }

  const d = target - base;
  if (d > 0) {
    if (positives.length === 0) {
      plan.create = { loggedAt: anchorMs, duration: d };
    } else {
      // The latest session gets longer and moves to end at the anchor.
      const latest = positives[positives.length - 1];
      plan.updates.push({ id: latest.id, loggedAt: anchorMs, duration: latest.duration + d });
    }
  } else if (d < 0) {
    // Shorten from the latest session backwards: each keeps its start and its
    // end moves earlier; a session that runs out is deleted. target > 0
    // guarantees the walk stops before the sessions run out.
    let remaining = -d;
    for (let i = positives.length - 1; i >= 0 && remaining > 0; i--) {
      const s = positives[i];
      if (s.duration > remaining) {
        plan.updates.push({
          id: s.id,
          duration: s.duration - remaining,
          loggedAt: Math.max(s.loggedAt - remaining * 1000, dayStartMs),
        });
        remaining = 0;
      } else {
        plan.deleteIds.push(s.id);
        remaining -= s.duration;
      }
    }
  }
  return plan;
}

// Plan Merge-to-yesterday stamps: positive rows are packed back to back in
// their original order so the last one ends at dayEndMs (23:59:59). Rows keep
// their durations. Negative rows have no time range and go to dayEndMs.
// No row is stamped before dayStartMs. Returns [{ id, loggedAt }].
export function planPackIntoDay(entries, { dayStartMs, dayEndMs }) {
  const positives = entries.filter((e) => e.duration > 0).sort(byLoggedAt);
  const out = [];
  let cursor = dayEndMs;
  for (let i = positives.length - 1; i >= 0; i--) {
    const loggedAt = Math.max(cursor, dayStartMs);
    out.push({ id: positives[i].id, loggedAt });
    cursor = loggedAt - positives[i].duration * 1000;
  }
  for (const e of entries) {
    if (!(e.duration > 0)) out.push({ id: e.id, loggedAt: dayEndMs });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sessions.test.js`
Expected: PASS (18 tests).

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sessions.js tests/sessions.test.js
git commit -m "feat(sessions): add pure session row, time-edit and merge planners" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Database: apply edits and pack merged logs `[model: sonnet]`

**Files:**
- Modify: `src/services/database.js`
  - the tzDateHelpers import (line 5)
  - replace the `reattributeLogsToDate` block (the comment starting `// Re-stamp a set of logs`)
  - add `editItemDayTime` after it
- Test: `tests/database.test.js`

**Interfaces:**
- Consumes:
  - `lastSecondOfDay(dateStr, tz)` from Task 1.
  - `planTimeEdit` and `planPackIntoDay` from Task 2, with the signatures above.
- Produces:
  - `editItemDayTime(itemId: number, dateStr: string, deltaSeconds: number, now?: number) → Promise<{ upserted: LogRow[], deleted: LogRow[] }>`. Rows in `upserted` are full rows after the change, including `id`, `uid` and `itemId`. Rows in `deleted` are full rows as they were before deletion.
  - `reattributeLogsToDate(logIds, newDateStr) → Promise<LogRow[]>`. The signature and return value are unchanged; only the stamping is new.
- Leave `addAdjustmentLog` and the `noonInHomeTz` import in place for now. `useReports` still uses them until Task 7.

- [ ] **Step 1: Write the failing tests**

In `tests/database.test.js`, add `editItemDayTime,` to the import list from `'../src/services/database'`, directly after `reattributeLogsToDate,`. Then replace the tzDateHelpers import line with:

```js
import { noonInHomeTz, getDateRangeUtc, lastSecondOfDay } from '../src/utils/tzDateHelpers.js';
```

Replace the whole existing test `it('reattributeLogsToDate re-stamps an existing log onto a new calendar date', …)` with:

```js
  it('reattributeLogsToDate packs logs back to back so the last ends 23:59:59 on the new date', async () => {
    const item = await addItem('Ride', 'fundamentals');
    const { startMs } = getDateRangeUtc('2026-05-02', TZ);
    // Practiced 00:10-00:20 and 00:40-01:00 on May 2.
    const a = await addLog(item.id, 600, { loggedAt: startMs + 20 * 60000 });
    const b = await addLog(item.id, 1200, { loggedAt: startMs + 60 * 60000 });

    const updated = await reattributeLogsToDate([a, b], '2026-05-01');

    expect(updated).toHaveLength(2);
    expect(await getLogsByDate('2026-05-02')).toHaveLength(0);
    const end = lastSecondOfDay('2026-05-01', TZ);
    expect((await db.practiceLogs.get(b)).loggedAt).toBe(end);
    expect((await db.practiceLogs.get(a)).loggedAt).toBe(end - 1200 * 1000);
    const moved = await getLogsByDate('2026-05-01');
    expect(moved).toHaveLength(2);
    expect(moved.every((l) => l.date === '2026-05-01')).toBe(true);
  });
```

Add a new `describe` block directly after the closing `});` of `describe('practice logs', …)`:

```js
// ---------------------------------------------------------------------------
// editItemDayTime — Daily edit mode applied to sessions
// ---------------------------------------------------------------------------
describe('editItemDayTime', () => {
  const DATE = '2026-05-01';
  // m minutes after 00:00 on DATE in the pinned LA timezone
  const minute = (m) => getDateRangeUtc(DATE, TZ).startMs + m * 60000;

  it('adding time today lengthens the latest session and moves it to end now', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    await addLog(item.id, 300, { loggedAt: minute(21 * 60 + 7) });
    const late = await addLog(item.id, 300, { loggedAt: minute(21 * 60 + 45) });
    const now = minute(22 * 60 + 30);

    const { upserted, deleted } = await editItemDayTime(item.id, DATE, 120, now);

    const row = await db.practiceLogs.get(late);
    expect(row.loggedAt).toBe(now);
    expect(row.duration).toBe(420);
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({ id: late, loggedAt: now, duration: 420, date: DATE, itemId: item.id });
    expect(deleted).toEqual([]);
  });

  it('on a past day the anchor is 23:59:59 of that day', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    const id = await addLog(item.id, 300, { loggedAt: minute(9 * 60) });
    const now = getDateRangeUtc('2026-05-03', TZ).startMs + 10 * 3600000; // two days later

    await editItemDayTime(item.id, DATE, 60, now);

    const row = await db.practiceLogs.get(id);
    expect(row.loggedAt).toBe(lastSecondOfDay(DATE, TZ));
    expect(row.duration).toBe(360);
    expect(await getLogsByDate(DATE)).toHaveLength(1);
  });

  it('a save just after midnight still lands on the day being viewed', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    const id = await addLog(item.id, 300, { loggedAt: minute(23 * 60 + 50) });
    const justAfterMidnight = getDateRangeUtc('2026-05-02', TZ).startMs + 60000; // 00:01 May 2

    await editItemDayTime(item.id, DATE, 120, justAfterMidnight);

    expect((await db.practiceLogs.get(id)).loggedAt).toBe(lastSecondOfDay(DATE, TZ));
    expect(await getLogsByDate(DATE)).toHaveLength(1);
    expect(await getLogsByDate('2026-05-02')).toHaveLength(0);
  });

  it('creates a session when the item has none that day', async () => {
    const item = await addItem('Kick', 'fundamentals');
    const now = minute(20 * 60);

    const { upserted } = await editItemDayTime(item.id, DATE, 600, now);

    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({
      itemId: item.id, itemUid: item.uid, duration: 600, loggedAt: now, date: DATE, syncedOnce: false,
    });
    expect(upserted[0].uid).toBeTruthy();
    expect(await db.practiceLogs.get(upserted[0].id)).toBeTruthy();
  });

  it('subtracting deletes used-up sessions and returns them', async () => {
    const item = await addItem('Snare', 'fundamentals');
    const early = await addLog(item.id, 300, { loggedAt: minute(21 * 60 + 7) });
    const late = await addLog(item.id, 300, { loggedAt: minute(21 * 60 + 45) });

    const { upserted, deleted } = await editItemDayTime(item.id, DATE, -480, minute(22 * 60));

    expect(await db.practiceLogs.get(late)).toBeUndefined();
    expect(deleted.map((l) => l.id)).toEqual([late]);
    expect(deleted[0].uid).toBeTruthy();
    expect((await db.practiceLogs.get(early)).duration).toBe(120);
    expect(upserted.map((l) => l.id)).toEqual([early]);
  });

  it('only touches the edited item', async () => {
    const a = await addItem('A', 'fundamentals');
    const b = await addItem('B', 'fundamentals');
    await addLog(a.id, 300, { loggedAt: minute(60) });
    const bLog = await addLog(b.id, 300, { loggedAt: minute(120) });

    await editItemDayTime(a.id, DATE, -300, minute(180));

    expect((await db.practiceLogs.get(bLog)).duration).toBe(300);
    expect(await db.practiceLogs.count()).toBe(1);
  });

  it('acts on the rows the Daily view shows for that date in the current timezone', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    // 20:00 on May 1 in LA is 12:00 on May 2 in Tokyo.
    const id = await addLog(item.id, 300, { loggedAt: minute(20 * 60) });
    await setTimezone('Asia/Tokyo');

    await editItemDayTime(item.id, DATE, 120, Date.UTC(2026, 5, 1)); // "now" is weeks later

    expect((await db.practiceLogs.get(id)).duration).toBe(300); // not a May 1 row in Tokyo
    const may1 = await getLogsByDate(DATE);
    expect(may1).toHaveLength(1);
    expect(may1[0].duration).toBe(120);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/database.test.js`
Expected: FAIL. The `editItemDayTime` tests error with `editItemDayTime is not a function`. The packing test fails because `loggedAt` is still noon.

- [ ] **Step 3: Implement**

In `src/services/database.js`, replace line 5:

```js
import { legacyDateToLoggedAt, formatInTimezone, noonInHomeTz, getDateRangeUtc } from '../utils/tzDateHelpers.js';
```

with:

```js
import { legacyDateToLoggedAt, formatInTimezone, noonInHomeTz, getDateRangeUtc, lastSecondOfDay } from '../utils/tzDateHelpers.js';
import { planTimeEdit, planPackIntoDay } from '../utils/sessions.js';
```

Replace this whole block:

```js
// Re-stamp a set of logs to a different calendar date. Used by the
// "Merge today's practice to yesterday" action — preserves per-item
// breakdown by reattributing each existing log rather than aggregating.
export const reattributeLogsToDate = async (logIds, newDateStr) => {
  const tz = getTimezone();
  const loggedAt = noonInHomeTz(newDateStr, tz);
  return await db.transaction('rw', db.practiceLogs, async () => {
    const updated = [];
    for (const id of logIds) {
      const log = await db.practiceLogs.get(id);
      if (!log) continue;
      await db.practiceLogs.update(id, { loggedAt, date: newDateStr });
      updated.push({ ...log, loggedAt, date: newDateStr });
    }
    return updated;
  });
};
```

with:

```js
// Re-stamp a set of logs onto a different calendar date. Used by the
// "Merge today's practice to yesterday" action — preserves per-item
// breakdown by reattributing each existing log rather than aggregating.
// Rows are packed back to back in their original order so the last one ends
// at 23:59:59 of newDateStr (see planPackIntoDay).
export const reattributeLogsToDate = async (logIds, newDateStr) => {
  const tz = getTimezone();
  const dayStartMs = getDateRangeUtc(newDateStr, tz).startMs;
  const dayEndMs = lastSecondOfDay(newDateStr, tz);
  return await db.transaction('rw', db.practiceLogs, async () => {
    const logs = (await db.practiceLogs.bulkGet(logIds)).filter(Boolean);
    const updated = [];
    for (const { id, loggedAt } of planPackIntoDay(logs, { dayStartMs, dayEndMs })) {
      await db.practiceLogs.update(id, { loggedAt, date: newDateStr });
      updated.push({ ...logs.find((l) => l.id === id), loggedAt, date: newDateStr });
    }
    return updated;
  });
};

// Apply a Daily edit-mode change to one item's total for one day, following
// planTimeEdit's rules. `now` is injectable for tests. Returns the rows the
// caller must push ({ upserted }) and the rows to delete remotely ({ deleted }).
export const editItemDayTime = async (itemId, dateStr, deltaSeconds, now = Date.now()) => {
  const tz = getTimezone();
  const { startMs, endMsExclusive } = getDateRangeUtc(dateStr, tz);
  // "now" when editing today; 23:59:59 on a past day so the time stays on it.
  // Checked at save time: a view opened before midnight is a past day now.
  const anchorMs = formatInTimezone(now, tz) === dateStr ? now : lastSecondOfDay(dateStr, tz);
  return await db.transaction('rw', db.practiceLogs, db.practiceItems, async () => {
    // Same loggedAt window getLogsByDate uses, so the plan sees exactly the
    // rows the Daily card summed.
    const entries = await db.practiceLogs
      .where('loggedAt')
      .between(startMs, endMsExclusive, true, false)
      .filter((l) => l.itemId === itemId)
      .toArray();
    const plan = planTimeEdit(entries, deltaSeconds, { anchorMs, dayStartMs: startMs });

    const deleted = entries.filter((e) => plan.deleteIds.includes(e.id));
    if (plan.deleteIds.length > 0) await db.practiceLogs.bulkDelete(plan.deleteIds);

    const upserted = [];
    for (const { id, loggedAt, duration } of plan.updates) {
      const fields = { loggedAt, duration, date: formatInTimezone(loggedAt, tz) };
      await db.practiceLogs.update(id, fields);
      upserted.push({ ...entries.find((e) => e.id === id), ...fields });
    }
    if (plan.create) {
      const item = await db.practiceItems.get(itemId);
      const log = {
        itemId,
        itemUid: item?.uid || null,
        date: formatInTimezone(plan.create.loggedAt, tz),
        duration: plan.create.duration,
        uid: crypto.randomUUID(),
        loggedAt: plan.create.loggedAt,
        syncedOnce: false,
      };
      const id = await db.practiceLogs.add(log);
      upserted.push({ ...log, id });
    }
    return { upserted, deleted };
  });
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/database.test.js`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes. `noonInHomeTz` is still used by `addAdjustmentLog`, so lint has no unused import to complain about.

- [ ] **Step 6: Commit**

```bash
git add src/services/database.js tests/database.test.js
git commit -m "feat(db): apply daily time edits to sessions and pack merged logs" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Sync: pick up changed durations and deleted logs on pull `[model: sonnet]`

**Files:**
- Modify: `src/services/backends/codecs/logCodec.js` (the `diff` function).
- Modify: `src/services/backends/firebaseBackend.js`, inside `pullAll`. Insert after the `if (logsToAdd.length > 0 || logsToUpdate.length > 0) { … }` block and before the comment `// Reconciliation step: any local item that has been synced before but is`.
- Test: `tests/codecs.test.js` and `tests/firebaseBackend.sync.test.js`.

**Interfaces:**
- Consumes: the existing `pullAll` locals `logsSnap` (the remote logs snapshot) and `logsByUid` (a `Map` of uid to local log, built before the logs loop).
- Produces:
  - `logCodec.diff` reports `fields.duration` when the remote `duration` differs.
  - `pullAll` hard-deletes local logs with `syncedOnce: true` whose uid is missing from the cloud.

- [ ] **Step 1: Write the failing tests**

In `tests/codecs.test.js`, add this as the last test inside `describe('logCodec', …)`, directly before `it('table is practiceLogs', …)`:

```js
  it('diff when duration changed -> update duration', () => {
    const existing = { ...logCodec.toLocal(remote, localItem), duration: 300 };
    expect(logCodec.diff(remote, existing, localItem)).toEqual({ action: 'update', fields: { duration: 600 } });
  });
```

In `tests/firebaseBackend.sync.test.js`, add these tests at the end of the `describe('pullAll', …)` block, directly after the `remap-before-delete` test:

```js
  it('adopts a remote duration change on an existing log', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'Rudiments', date: '2026-05-01', duration: 420, logged_at: 1700000060000 });

    await firebaseBackend.pullAll(UID);

    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(420);
    expect(log.loggedAt).toBe(1700000060000);
  });

  it('deletes a synced log missing from the cloud but keeps unsynced and unresolved ones', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    // Deleted on another device: synced locally, gone from the cloud.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'gone', loggedAt: 1, syncedOnce: true });
    // Created here and not pushed yet.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'local', loggedAt: 2, syncedOnce: false });
    // Still in the cloud, but its remote parent ('x') doesn't resolve locally.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'orphan', loggedAt: 3, syncedOnce: true });
    fs.__seed(logsPath, 'orphan', { uid: 'orphan', item_uid: 'x', item_name: 'Nope', date: '2026-05-01', duration: 300, logged_at: 3 });

    await firebaseBackend.pullAll(UID);

    expect(await db.practiceLogs.where('uid').equals('gone').first()).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('local').first()).toBeTruthy();
    expect(await db.practiceLogs.where('uid').equals('orphan').first()).toBeTruthy();
  });

  it('does not delete synced logs when the logs snapshot is fromCache', async () => {
    fs = createFakeFirestore({ fromCacheByPath: { [logsPath]: true } });
    setFirestoreImpl(fs);
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1, syncedOnce: true });

    await firebaseBackend.pullAll(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeTruthy();
  });
```

In the same file, add this test inside `describe('subscribeToChanges', …)`, directly after the `remaps a log itemUid when a modified change moves it to another parent` test:

```js
  it('adopts a duration change on a modified log', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1700000000000 });
    const unsub = subscribe(vi.fn());
    await fs.__settle();

    fs.__emit(logsPath, [{ type: 'modified', id: 'l1', data: { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 420, logged_at: 1700000000000 } }]);
    await fs.__settle();

    expect((await db.practiceLogs.where('uid').equals('l1').first()).duration).toBe(420);
    unsub();
  });
```

Also fix a comment this task makes stale. In the `logs-fromCache bail` test, replace these four comment lines:

```js
    // Note: logs are NOT directly reconciled by pullAll (no log-deletion-by-absence loop);
    // log deletion only happens as a cascade inside the item-deletion loop. So the cleanest
    // observable effect of the logs bail is: a synced item that IS absent from the remote
    // items snapshot is NOT deletion-reconciled, because the guard exits before that loop.
```

with:

```js
    // The guard also exits before pullAll's log-deletion loop (see 'does not delete
    // synced logs when the logs snapshot is fromCache'). The observable effect checked
    // here: a synced item that IS absent from the remote items snapshot is NOT
    // deletion-reconciled, because the guard exits before that loop.
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codecs.test.js tests/firebaseBackend.sync.test.js`
Expected: FAIL in four tests:
- the codec duration test, where `fields` lacks `duration`
- `adopts a remote duration change on an existing log`, which gets 300 instead of 420
- `deletes a synced log missing from the cloud…`, where `gone` still exists
- `adopts a duration change on a modified log`, which gets 300

The `fromCache` test already passes, and must keep passing.

- [ ] **Step 3: Implement**

In `src/services/backends/codecs/logCodec.js`, inside `diff`, insert directly before the line `if (!existing.syncedOnce) fields.syncedOnce = true;`:

```js
  // Daily edit mode lengthens and shortens existing sessions in place, so a
  // changed duration must propagate like a changed time.
  if (typeof data.duration === 'number' && existing.duration !== data.duration) {
    fields.duration = data.duration;
  }
```

In `src/services/backends/firebaseBackend.js`, inside `pullAll`, insert this between the closing `}` of the `if (logsToAdd.length > 0 || logsToUpdate.length > 0) { … }` block and the comment `// Reconciliation step: any local item that has been synced before but is`:

```js
    // Reconciliation step for single logs: a locally-synced log that is now
    // missing from the cloud was deleted on another device (Daily edit mode
    // deletes sessions one at a time). Local-only logs (syncedOnce=false) are
    // kept so pushAllLocal can push them up. The remote set counts EVERY
    // remote doc with a uid, including ones whose parent didn't resolve in
    // the loop above, so an unresolved parent never looks like a deletion.
    // This relies on syncedOnce=true meaning the row really is in the cloud.
    const remoteLogUids = new Set();
    for (const docSnap of logsSnap.docs) {
      const uid = docSnap.data().uid;
      if (uid) remoteLogUids.add(uid);
    }
    const goneLogIds = [];
    for (const l of logsByUid.values()) {
      if (l.syncedOnce && !remoteLogUids.has(l.uid)) goneLogIds.push(l.id);
    }
    if (goneLogIds.length > 0) await db.practiceLogs.bulkDelete(goneLogIds);

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codecs.test.js tests/firebaseBackend.sync.test.js`
Expected: PASS. That includes the existing `deletes a locally-synced item missing from cloud (and cascades logs)` and `remap-before-delete` tests.

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/services/backends/codecs/logCodec.js src/services/backends/firebaseBackend.js tests/codecs.test.js tests/firebaseBackend.sync.test.js
git commit -m "fix(sync): adopt remote log durations and reconcile deleted logs on pull" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Sync: delete a single log remotely (`delete_log`) `[model: sonnet]`

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`
  - add a new `deleteLogRemote` method directly before `async pushNote(localNote, userId) {`
  - add a `delete_log` branch in `flushSyncQueue`, directly before `} else if (entry.action === 'delete_item') {`
- Modify: `src/services/backends/backendInterface.js`
- Modify: `src/utils/pendingActionFormatter.js`
- Modify: `src/locales/en.json`, `src/locales/zh.json`
- Test: `tests/pendingActionFormatter.test.js`, `tests/firebaseBackend.sync.test.js`

**Interfaces:**
- Consumes: the existing `withOfflineQueue(action, buildPayload, onlineFn)`, `logsRef(userId)` and `getFirestore()`.
- Produces:
  - `firebaseBackend.deleteLogRemote(localLog: { uid, itemId?, itemName?, duration, date }, userId: string) → Promise<void>`
  - Queue action `'delete_log'` with payload `{ uid, itemName, duration, date }`.
  - i18n key `offline.action.deleteLog`.

- [ ] **Step 1: Write the failing tests**

In `tests/pendingActionFormatter.test.js`, add directly after the `create_log with itemName, duration, date` test:

```js
  it('delete_log with itemName, duration, date', () => {
    const entry = { action: 'delete_log', payload: { uid: 'l1', itemName: 'Hi-hat', duration: 300, date: '2026-09-25' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteLog|duration=5,name=Hi-hat,date=2026-09-25');
  });
```

In `tests/firebaseBackend.sync.test.js`, add this import below the existing imports:

```js
import { setOfflineMode } from '../src/services/offlineService';
```

Add a new `describe` block directly before `describe('flushSyncQueue', …)`:

```js
describe('deleteLogRemote', () => {
  it('deletes the cloud doc when online', async () => {
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1 });
    await firebaseBackend.deleteLogRemote({ uid: 'l1', itemId: 1, duration: 300, date: '2026-05-01' }, UID);
    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
  });

  it('queues delete_log with a labelled payload when offline', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    setOfflineMode(true);
    try {
      await firebaseBackend.deleteLogRemote({ uid: 'l1', itemId, duration: 300, date: '2026-05-01' }, UID);
    } finally {
      setOfflineMode(false);
    }
    const [entry] = await db.syncQueue.toArray();
    expect(entry.action).toBe('delete_log');
    expect(entry.payload).toEqual({ uid: 'l1', itemName: 'Rudiments', duration: 300, date: '2026-05-01' });
  });
});
```

Add this test at the end of `describe('flushSyncQueue', …)`:

```js
  it('replays delete_log: removes the cloud doc and the row pullAll re-added', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1 });
    // pullAll re-added the row from the cloud before the flush ran.
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1, syncedOnce: true });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 300, date: '2026-05-01' } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pendingActionFormatter.test.js tests/firebaseBackend.sync.test.js`
Expected: FAIL.
- The formatter test returns `'delete_log'`, because the default case echoes the action name.
- The `deleteLogRemote` tests fail with `firebaseBackend.deleteLogRemote is not a function`.
- In the replay test, the queue entry is not handled, so the remote doc remains.

- [ ] **Step 3: Implement**

In `src/services/backends/firebaseBackend.js`, insert directly before the line `  async pushNote(localNote, userId) {`:

```js
  // Delete one practice log from the cloud. Daily edit mode deletes sessions
  // one at a time. Other devices drop it through the live 'removed' event, or
  // through pullAll's log-deletion reconciliation if they missed that event.
  // `localLog` is a log row, or a queued delete_log payload on replay (which
  // carries itemName instead of itemId).
  async deleteLogRemote(localLog, userId) {
    await withOfflineQueue(
      'delete_log',
      async () => {
        const item = localLog.itemId != null ? await db.practiceItems.get(localLog.itemId) : null;
        return {
          uid: localLog.uid,
          itemName: item?.name ?? localLog.itemName,
          duration: localLog.duration,
          date: localLog.date,
        };
      },
      async () => {
        const fs = getFirestore();
        await fs.deleteDoc(fs.doc(logsRef(userId), localLog.uid));
      },
    );
  },

```

In `flushSyncQueue`, insert directly before the line `        } else if (entry.action === 'delete_item') {`:

```js
        } else if (entry.action === 'delete_log') {
          await firebaseBackend.deleteLogRemote(entry.payload, userId);
          // pullAll (earlier in init) re-adds the row from the cloud copy this
          // delete hadn't reached yet, so remove it locally too.
          await db.practiceLogs.where('uid').equals(entry.payload.uid).delete();
```

In `src/services/backends/backendInterface.js`, add directly after the `pushLog` line:

```js
 * @property {(localLog: object, userId: string) => Promise<void>} deleteLogRemote
```

In `src/utils/pendingActionFormatter.js`, add directly after the closing `}` of `case 'create_log': { … }`:

```js
    case 'delete_log': {
      const minutes = Math.round((payload.duration ?? 0) / 60);
      return t('offline.action.deleteLog', {
        duration: minutes,
        name: payload.itemName ?? '',
        date: payload.date ?? '',
      });
    }
```

In `src/locales/en.json`, inside `offline.action`, add directly after the `"createLog": …` line:

```json
      "deleteLog": "Deleted {duration} min on {name} ({date})",
```

In `src/locales/zh.json`, inside `offline.action`, add directly after the `"createLog": …` line:

```json
      "deleteLog": "删除了 {name} 上的 {duration} 分钟（{date}）",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pendingActionFormatter.test.js tests/firebaseBackend.sync.test.js`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/services/backends/firebaseBackend.js src/services/backends/backendInterface.js src/utils/pendingActionFormatter.js src/locales/en.json src/locales/zh.json tests/pendingActionFormatter.test.js tests/firebaseBackend.sync.test.js
git commit -m "feat(sync): delete a single practice log remotely" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Sync: replay queued log times after the reconnect pull `[model: sonnet]`

This fixes an existing bug. Today, an offline Merge to yesterday is silently undone on reconnect:
1. `pushLog` queues a payload without `loggedAt`.
2. `pullAll` then resets the local row to the cloud's values.
3. The flush pushes that reset row.

The duration diff added in Task 4 would make offline edits fail the same way.

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`
  - add a new `replayLogPayload` directly before the `// --- Backend ---` line
  - add `loggedAt` to `pushLog`'s `buildPayload`
  - change the `create_log` branch of `flushSyncQueue`
- Test: `tests/firebaseBackend.sync.test.js`

**Interfaces:**
- Consumes:
  - the existing `firebaseBackend.pushLog(localLog, userId)`
  - `deleteLogRemote` and its `delete_log` replay from Task 5 (the edit-then-delete test needs them)
  - the `setOfflineMode` test import from Task 5
- Produces:
  - A `create_log` payload of `{ itemUid, itemName, date, duration, loggedAt, uid }`.
  - `replayLogPayload(p, userId) → Promise<boolean>`, a module-private helper. It returns `false` for a legacy payload without `loggedAt`.

- [ ] **Step 1: Write the failing tests**

In `tests/firebaseBackend.sync.test.js`, add a new `describe` block directly before `describe('deleteLogRemote', …)`:

```js
describe('pushLog', () => {
  it("queues create_log with the row's loggedAt when offline", async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    setOfflineMode(true);
    try {
      await firebaseBackend.pushLog({ itemId, itemUid: 'a', uid: 'l1', date: '2026-05-01', duration: 420, loggedAt: 1000 }, UID);
    } finally {
      setOfflineMode(false);
    }
    const [entry] = await db.syncQueue.toArray();
    expect(entry.action).toBe('create_log');
    expect(entry.payload).toEqual({ itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1000, uid: 'l1' });
  });
});
```

Add these tests at the end of `describe('flushSyncQueue', …)`:

```js
  it('create_log replay restores an offline edit that pullAll reverted (offline merge regression)', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    // The cloud still has the pre-merge values.
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-02', duration: 300, logged_at: 2000 });
    // Offline, the log was moved to the previous day and lengthened; the change was queued.
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 420, uid: 'l1', loggedAt: 1000, syncedOnce: true });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1000 } });

    // Reconnect runs pullAll first (reverting local to the cloud copy), then flushes.
    await firebaseBackend.pullAll(UID);
    expect((await db.practiceLogs.where('uid').equals('l1').first()).loggedAt).toBe(2000);
    await firebaseBackend.flushSyncQueue(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toMatchObject({ loggedAt: 1000, duration: 420, date: '2026-05-01' });
    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1000, duration: 420, date: '2026-05-01' });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('falls back to reading local for a legacy create_log payload without loggedAt', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1000, syncedOnce: false });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 300 } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1000, duration: 300 });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('a create then a delete queued offline for a log never in the cloud leaves nothing behind', async () => {
    // Created and deleted offline: the row is gone locally and never reached the cloud.
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 300, loggedAt: 1000 } });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 300, date: '2026-05-01' } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('two queued edits to one log replay in order, and the second wins', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1000 });
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 600, uid: 'l1', loggedAt: 1300, syncedOnce: true });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1100 } });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 600, loggedAt: 1300 } });

    await firebaseBackend.pullAll(UID);
    await firebaseBackend.flushSyncQueue(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toMatchObject({ loggedAt: 1300, duration: 600 });
    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1300, duration: 600 });
  });

  it('an edit then a delete queued offline ends deleted', async () => {
    await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1000 });
    // Offline: lengthened (queued), then deleted (row removed locally, queued).
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1100 } });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 420, date: '2026-05-01' } });

    await firebaseBackend.pullAll(UID); // re-adds l1 from the cloud
    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/firebaseBackend.sync.test.js`
Expected: FAIL in three tests:
- `queues create_log with the row's loggedAt when offline`: the payload lacks `loggedAt`.
- `create_log replay restores an offline edit…`: local `loggedAt` stays 2000.
- `two queued edits to one log…`: both replays push the reverted row, which ends at 1000/300.

The legacy-fallback, create-then-delete and edit-then-delete tests already pass. They pin behavior that must survive this change.

- [ ] **Step 3: Implement**

In `src/services/backends/firebaseBackend.js`, insert directly before the line `// --- Backend ---`:

```js
// create_log is an upsert: it covers new logs AND edits to existing ones
// (Daily edit mode, Merge to yesterday). pullAll may have reset the local
// row's time and duration to the cloud's old values, so re-apply the queued
// ones before pushing. A row that is gone locally was deleted on another
// device (or cascaded with its item) since it was queued; the deletion wins.
async function replayLogPayload(p, userId) {
  if (!(p.uid && typeof p.loggedAt === 'number')) return false;
  const local = await db.practiceLogs.where('uid').equals(p.uid).first();
  if (!local) return true;
  const fields = { loggedAt: p.loggedAt, duration: p.duration, date: p.date };
  await db.practiceLogs.update(local.id, fields);
  await firebaseBackend.pushLog({ ...local, ...fields }, userId);
  return true;
}

```

In `pushLog`, replace the `buildPayload` return object:

```js
        return {
          itemUid: localLog.itemUid || item?.uid,
          itemName: item?.name,
          date: localLog.date,
          duration: localLog.duration,
          uid: localLog.uid,
        };
```

with:

```js
        return {
          itemUid: localLog.itemUid || item?.uid,
          itemName: item?.name,
          date: localLog.date,
          duration: localLog.duration,
          loggedAt: localLog.loggedAt,
          uid: localLog.uid,
        };
```

In `flushSyncQueue`, replace:

```js
        } else if (entry.action === 'create_log') {
          const local = await db.practiceLogs.where('uid').equals(entry.payload.uid).first();
          if (local) await firebaseBackend.pushLog(local, userId);
```

with:

```js
        } else if (entry.action === 'create_log') {
          if (!(await replayLogPayload(entry.payload, userId))) {
            // Legacy payload (queued before loggedAt was included): keep the
            // old behavior of pushing whatever the local row holds.
            const local = await db.practiceLogs.where('uid').equals(entry.payload.uid).first();
            if (local) await firebaseBackend.pushLog(local, userId);
          }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/firebaseBackend.sync.test.js tests/offlineQueue.test.js`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/services/backends/firebaseBackend.js tests/firebaseBackend.sync.test.js
git commit -m "fix(sync): replay queued log times after the reconnect pull" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Route edit-mode changes through session edits; remove `addAdjustmentLog` `[model: sonnet]`

**Files:**
- Modify: `src/hooks/useReports.js` (the imports and `handleManualTimeAdjust`)
- Modify: `src/services/database.js` (delete `addAdjustmentLog`, and drop `noonInHomeTz` from the tzDateHelpers import)
- Modify: `tests/database.test.js` (remove the `addAdjustmentLog` import and its test)
- Modify: `tests/useReports.test.js` (swap the fixture, and add the visitor test)
- Test: create `tests/useReports.timeEdit.test.js`

**Interfaces:**
- Consumes:
  - `editItemDayTime(itemId, dateStr, deltaSeconds, now?) → { upserted, deleted }` from Task 3.
  - `backend.pushLog(log, userId)`, which already exists.
  - `backend.deleteLogRemote(log, userId)` from Task 5.
- Produces: `handleManualTimeAdjust(itemId, deltaSeconds, date)`. The name and signature are unchanged, so `App.jsx` needs no change: `onSave` passes the delta and `onDelete` passes `-currentSeconds`.
- Pushes stay fire-and-forget, as before, so the edit modal closes without waiting for the network.

- [ ] **Step 1: Write the failing tests**

Create `tests/useReports.timeEdit.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Signed-in counterpart to useReports.test.js: handleManualTimeAdjust must
// push every row it changed and delete every row it removed.
const { pushLog, deleteLogRemote } = vi.hoisted(() => ({
  pushLog: vi.fn(() => Promise.resolve()),
  deleteLogRemote: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/services/backends/firebaseBackend', () => ({ default: { pushLog, deleteLogRemote } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { db, addItem, addLog } from '../src/services/database';
import { getDateRangeUtc } from '../src/utils/tzDateHelpers';
import { setTimezone } from '../src/services/timezoneService';
import { useReports } from '../src/hooks/useReports';

const TZ = 'America/Los_Angeles';
const DATE = '2026-05-01';

beforeEach(async () => {
  await setTimezone(TZ);
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
  pushLog.mockClear();
  deleteLogRemote.mockClear();
});

describe('useReports.handleManualTimeAdjust (signed in)', () => {
  it('pushes the rows it changed and deletes the rows it removed', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    const { startMs } = getDateRangeUtc(DATE, TZ);
    const early = await addLog(item.id, 300, { loggedAt: startMs + (21 * 60 + 7) * 60000 });
    const late = await addLog(item.id, 300, { loggedAt: startMs + (21 * 60 + 45) * 60000 });
    const { result } = renderHook(() => useReports({ onNavigateToSubpage: vi.fn() }));

    await act(async () => { await result.current.handleManualTimeAdjust(item.id, -480, DATE); });

    expect(deleteLogRemote).toHaveBeenCalledTimes(1);
    expect(deleteLogRemote.mock.calls[0][0]).toMatchObject({ id: late });
    expect(deleteLogRemote.mock.calls[0][1]).toBe('u1');
    expect(pushLog).toHaveBeenCalledTimes(1);
    expect(pushLog.mock.calls[0][0]).toMatchObject({ id: early, duration: 120 });
    expect(pushLog.mock.calls[0][1]).toBe('u1');
  });
});
```

In `tests/useReports.test.js`, replace the line `import { db, addAdjustmentLog } from '../src/services/database';` with:

```js
import { db, addLog } from '../src/services/database';
import { getDateRangeUtc, noonInHomeTz } from '../src/utils/tzDateHelpers';
import { getTimezone } from '../src/services/timezoneService';
import firebaseBackend from '../src/services/backends/firebaseBackend';
```

In the first test, replace these two lines:

```js
    // Seed an adjustment log on a specific date.
    await addAdjustmentLog(1, 600, '2026-01-15');
```

with:

```js
    // Seed a log at noon on a specific date.
    await addLog(1, 600, { loggedAt: noonInHomeTz('2026-01-15', getTimezone()) });
```

Then add this test at the end of `describe('useReports', …)`:

```js
  it('a signed-out edit changes local rows without calling the backend', async () => {
    const { startMs } = getDateRangeUtc('2026-01-15', getTimezone());
    const id = await addLog(1, 600, { loggedAt: startMs + 9 * 3600000 });
    const { result } = renderHook(() =>
      useReports({ onNavigateToSubpage: vi.fn() }));

    await act(async () => { await result.current.handleManualTimeAdjust(1, -600, '2026-01-15'); });

    expect(await db.practiceLogs.get(id)).toBeUndefined();
    expect(firebaseBackend.pushLog).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/useReports.timeEdit.test.js tests/useReports.test.js`
Expected: FAIL in two tests.
- The signed-in test: the old handler writes a negative adjustment row and calls `pushLog` once with it, and never calls `deleteLogRemote`.
- The visitor test: the old handler adds a −600 row instead of deleting the row, so `db.practiceLogs.get(id)` is still defined.

- [ ] **Step 3: Implement**

In `src/hooks/useReports.js`, replace the database import block:

```js
import {
  db,
  addAdjustmentLog,
  reattributeLogsToDate,
  getLogsByDate,
  getLogsByDateRange,
} from '../services/database';
```

with:

```js
import {
  editItemDayTime,
  reattributeLogsToDate,
  getLogsByDate,
  getLogsByDateRange,
} from '../services/database';
```

Replace the handler:

```js
  const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
    const logId = await addAdjustmentLog(itemId, deltaSeconds, date);
    if (user) {
      const log = await db.practiceLogs.get(logId);
      backend.pushLog(log, user.id).catch(console.error);
    }
  }, [user, backend]);
```

with:

```js
  // Edit mode sets an item's total for the day; editItemDayTime applies the
  // change to that day's sessions (see planTimeEdit in utils/sessions.js).
  // Pushes are fire-and-forget so the edit modal closes without waiting.
  const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
    const { upserted, deleted } = await editItemDayTime(itemId, date, deltaSeconds);
    if (user) {
      for (const log of upserted) backend.pushLog(log, user.id).catch(console.error);
      for (const log of deleted) backend.deleteLogRemote(log, user.id).catch(console.error);
    }
  }, [user, backend]);
```

In `src/services/database.js`, delete the whole `addAdjustmentLog` function, including the blank line after it:

```js
export const addAdjustmentLog = async (itemId, duration, dateStr) => {
  const tz = getTimezone();
  const loggedAt = noonInHomeTz(dateStr, tz);
  const uid = crypto.randomUUID();
  const item = await db.practiceItems.get(itemId);
  const itemUid = item?.uid || null;
  return await db.practiceLogs.add({
    itemId, itemUid, date: dateStr, duration, uid, loggedAt, syncedOnce: false,
  });
};
```

Then change the tzDateHelpers import line to:

```js
import { legacyDateToLoggedAt, formatInTimezone, getDateRangeUtc, lastSecondOfDay } from '../utils/tzDateHelpers.js';
```

In `tests/database.test.js`, remove the `addAdjustmentLog,` line from the import list. Delete the whole test `it('addAdjustmentLog anchors loggedAt to noon of the given date in the home tz', …)`. Keep the `noonInHomeTz` import, which other tests still use.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/useReports.timeEdit.test.js tests/useReports.test.js tests/database.test.js`
Expected: PASS.

Then run: `grep -rn "addAdjustmentLog" src tests`
Expected: no output.

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes, with no unused-import lint errors in `useReports.js` or `database.js`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useReports.js src/services/database.js tests/database.test.js tests/useReports.test.js tests/useReports.timeEdit.test.js
git commit -m "feat(reports): route edit-mode time changes through session edits" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Daily report UI: expandable session list `[model: sonnet]`

**Files:**
- Modify: `src/components/ReportItemCard.jsx`
- Modify: `src/components/DailyReport.jsx`
- Modify: `src/locales/en.json`, `src/locales/zh.json`
- Test: `tests/reportItemCard.test.jsx`; create `tests/dailyReport.test.jsx`

**Interfaces:**
- Consumes:
  - `formatClockInTimezone(epochMs, tz)` from Task 1.
  - `toSessionRows(logs)` from Task 2.
  - The existing `useTimezone()` from `src/hooks/useTimezone.js`, which returns the home timezone string and re-renders on change.
- Produces: `ReportItemCard` takes these optional props:
  - `sessions`: an array of `toSessionRows` rows
  - `expanded`: a boolean
  - `onToggleExpand(itemId)`
  - `tz`: a string

  Without `sessions` and `onToggleExpand`, the card renders exactly as before, so the Weekly, Monthly and Yearly reports are untouched.
- One deviation from the spec: `showSessions`/`hideSessions` go in the card's `title` (a hover tooltip), not in `aria-label`. An `aria-label` would replace the card's accessible name, which is the item name and its duration. The expanded state still reaches assistive tech through `aria-expanded`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reportItemCard.test.jsx`, after the existing `describe` block:

```jsx
describe('ReportItemCard session list', () => {
  const tz = 'America/Los_Angeles';
  // 21:02-21:07 PDT on 2026-09-25, plus an old negative adjustment.
  const sessions = [
    { id: 10, kind: 'session', startMs: Date.UTC(2026, 8, 26, 4, 2), endMs: Date.UTC(2026, 8, 26, 4, 7), duration: 300 },
    { id: 11, kind: 'adjustment', startMs: null, endMs: null, duration: -180 },
  ];
  const baseProps = { entry: { id: 1, name: 'Paradiddle', duration: 1800 }, grandTotal: 3600, timeUnit: 'minutes', compactMode: false };

  it('asks to toggle its session list when tapped outside edit mode', async () => {
    const onToggleExpand = vi.fn();
    const { container } = render(
      <ReportItemCard {...baseProps} sessions={sessions} expanded={false} onToggleExpand={onToggleExpand} tz={tz} />,
    );
    expect(screen.queryByText('21:02 – 21:07')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(container.firstChild);
    expect(onToggleExpand).toHaveBeenCalledWith(1);
  });

  it('lists sessions as 24-hour ranges and adjustments by name when expanded', () => {
    const { container } = render(
      <ReportItemCard {...baseProps} sessions={sessions} expanded onToggleExpand={vi.fn()} tz={tz} />,
    );
    expect(container.firstChild).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(screen.getByText('5 minutes')).toBeInTheDocument();
    expect(screen.getByText('sessionAdjustment')).toBeInTheDocument();
    expect(screen.getByText('-3 minutes')).toBeInTheDocument();
  });

  it('in edit mode a tap opens the editor instead of toggling, and an open list stays visible', async () => {
    const onEditTime = vi.fn();
    const onToggleExpand = vi.fn();
    const { container } = render(
      <ReportItemCard {...baseProps} editMode onEditTime={onEditTime}
        sessions={sessions} expanded onToggleExpand={onToggleExpand} tz={tz} />,
    );
    await userEvent.click(container.firstChild);
    expect(onEditTime).toHaveBeenCalledWith(1, 'Paradiddle', 1800);
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(container.firstChild).not.toHaveAttribute('aria-expanded');
  });

  it('shows a session that crossed midnight as a plain time range', () => {
    // 23:50 PDT on 2026-09-25 to 00:20 on 2026-09-26
    const crossing = [{ id: 12, kind: 'session', startMs: Date.UTC(2026, 8, 26, 6, 50), endMs: Date.UTC(2026, 8, 26, 7, 20), duration: 1800 }];
    render(<ReportItemCard {...baseProps} sessions={crossing} expanded onToggleExpand={vi.fn()} tz={tz} />);
    expect(screen.getByText('23:50 – 00:20')).toBeInTheDocument();
  });

  it('has no toggle affordance without sessions', () => {
    const { container } = render(<ReportItemCard {...baseProps} />);
    expect(container.firstChild).not.toHaveAttribute('role');
    expect(container.firstChild).not.toHaveAttribute('aria-expanded');
  });
});
```

Create `tests/dailyReport.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyReport from '../src/components/DailyReport';
import { setTimezone } from '../src/services/timezoneService';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const items = [
  { id: 1, name: 'Paradiddle', category: 'fundamentals', sortOrder: 0 },
  { id: 2, name: 'Groove', category: 'songs', sortOrder: 1 },
];
// 2026-09-25 PDT: Paradiddle 21:02-21:07 and 21:40-21:45; Groove 20:00-20:30.
const logs = [
  { id: 10, itemId: 1, duration: 300, loggedAt: Date.UTC(2026, 8, 26, 4, 7), date: '2026-09-25' },
  { id: 11, itemId: 1, duration: 300, loggedAt: Date.UTC(2026, 8, 26, 4, 45), date: '2026-09-25' },
  { id: 12, itemId: 2, duration: 1800, loggedAt: Date.UTC(2026, 8, 26, 3, 30), date: '2026-09-25' },
];

function daily(reportDate, reportLogs) {
  return (
    <DailyReport
      items={items}
      allItems={items}
      reportDate={reportDate}
      reportLogs={reportLogs}
      onDateChange={vi.fn()}
      onEditTime={vi.fn()}
      onAddTime={vi.fn()}
      onMergeToYesterday={vi.fn()}
      timeUnit="minutes"
      groupByCategory={false}
    />
  );
}

beforeEach(async () => {
  await setTimezone('America/Los_Angeles');
});

describe('DailyReport sessions', () => {
  it("tapping an item card shows only that item's sessions", async () => {
    render(daily('2026-09-25', logs));
    expect(screen.queryByText('21:02 – 21:07')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Paradiddle'));

    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(screen.getByText('21:40 – 21:45')).toBeInTheDocument();
    expect(screen.queryByText('20:00 – 20:30')).not.toBeInTheDocument();
  });

  it('keeps a card open when the date changes', async () => {
    const { rerender } = render(daily('2026-09-25', logs));
    await userEvent.click(screen.getByText('Paradiddle'));

    // 18:00-18:10 PDT on 2026-09-26
    const nextDay = [{ id: 20, itemId: 1, duration: 600, loggedAt: Date.UTC(2026, 8, 27, 1, 10), date: '2026-09-26' }];
    rerender(daily('2026-09-26', nextDay));

    expect(screen.getByText('18:00 – 18:10')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reportItemCard.test.jsx tests/dailyReport.test.jsx`
Expected: FAIL. No session rows render, and `aria-expanded` is missing. The `has no toggle affordance without sessions` test already passes, and must keep passing.

- [ ] **Step 3: Implement**

Replace the entire contents of `src/components/ReportItemCard.jsx` with:

```jsx
import { useLanguage } from '../contexts/LanguageContext';
import { formatDuration } from '../utils/formatTime';
import { formatClockInTimezone } from '../utils/tzDateHelpers';

export default function ReportItemCard({
  entry,
  grandTotal,
  timeUnit,
  compactMode,
  dimZero = false,
  editMode = false,
  onEditTime,
  // Optional session list (Daily report only). Without `sessions` and
  // `onToggleExpand` the card renders exactly as before.
  sessions,
  expanded = false,
  onToggleExpand,
  tz,
}) {
  const { t } = useLanguage();
  const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
  const dimmed = dimZero && entry.duration === 0;
  const clickable = editMode && typeof onEditTime === 'function';
  const hasSessions = Array.isArray(sessions) && typeof onToggleExpand === 'function';
  // In edit mode a tap edits the total; an open list stays visible, read-only.
  const canToggle = hasSessions && !clickable;
  const showBar = (dimZero ? entry.duration > 0 : true) && grandTotal > 0;

  let handleClick;
  if (clickable) handleClick = () => onEditTime(entry.id, entry.name, entry.duration);
  else if (canToggle) handleClick = () => onToggleExpand(entry.id);

  return (
    <div
      className={`bg-white dark:bg-slate-800 shadow-sm transition-colors ${
        compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'
      } ${
        clickable || canToggle
          ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-700'
          : ''
      }`}
      onClick={handleClick}
      role={canToggle ? 'button' : undefined}
      aria-expanded={canToggle ? expanded : undefined}
      title={canToggle ? t(expanded ? 'hideSessions' : 'showSessions') : undefined}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-medium flex items-center ${
            dimmed ? 'text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-100'
          }`}
        >
          {entry.name}
          {canToggle && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className={`ml-1 h-4 w-4 text-gray-400 dark:text-slate-500 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </span>
        <div
          className={`text-right ${
            dimmed ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'
          }`}
        >
          <div>
            {dimmed ? 0 : formatDuration(entry.duration, timeUnit)} {t(timeUnit)}
          </div>
          {entry.duration > 0 && (
            <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
          )}
        </div>
      </div>
      {showBar && (
        <div
          className={`${compactMode ? 'mt-1' : 'mt-2'} bg-gray-100 dark:bg-slate-700 rounded-full h-1.5`}
        >
          <div
            className="bg-accent-500 rounded-full h-1.5"
            style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
          />
        </div>
      )}
      {hasSessions && expanded && (
        <ul
          className={`flex flex-col text-sm text-gray-500 dark:text-slate-400 ${
            compactMode ? 'mt-1.5 gap-0.5' : 'mt-3 gap-1'
          }`}
        >
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between">
              <span className={s.kind === 'session' ? 'font-mono' : ''}>
                {s.kind === 'session'
                  ? `${formatClockInTimezone(s.startMs, tz)} – ${formatClockInTimezone(s.endMs, tz)}`
                  : t('sessionAdjustment')}
              </span>
              <span>
                {formatDuration(s.duration, timeUnit)} {t(timeUnit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

In `src/components/DailyReport.jsx`, add these imports below the existing `import { buildBreakdown } from '../utils/practiceStats';` line:

```jsx
import { toSessionRows } from '../utils/sessions';
import { useTimezone } from '../hooks/useTimezone';
```

Directly after the line `const [merging, setMerging] = useState(false);`, add:

```jsx
  const tz = useTimezone();
  // Items whose session list is open. Kept across date changes so one item
  // can be followed from day to day.
  const [expandedItemIds, setExpandedItemIds] = useState(() => new Set());
```

Directly after the line `const isToday = reportDate === getTodayString();`, add:

```jsx
  // The day's logs grouped by item, for each card's session list.
  const logsByItem = new Map();
  for (const log of reportLogs) {
    if (!logsByItem.has(log.itemId)) logsByItem.set(log.itemId, []);
    logsByItem.get(log.itemId).push(log);
  }

  const toggleExpanded = (itemId) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
```

Replace `renderItemCard`:

```jsx
  const renderItemCard = (entry) => (
    <ReportItemCard
      key={entry.id}
      entry={entry}
      grandTotal={grandTotal}
      timeUnit={timeUnit}
      compactMode={compactMode}
      editMode={editMode}
      onEditTime={onEditTime}
    />
  );
```

with:

```jsx
  const renderItemCard = (entry) => (
    <ReportItemCard
      key={entry.id}
      entry={entry}
      grandTotal={grandTotal}
      timeUnit={timeUnit}
      compactMode={compactMode}
      editMode={editMode}
      onEditTime={onEditTime}
      sessions={toSessionRows(logsByItem.get(entry.id) || [])}
      expanded={expandedItemIds.has(entry.id)}
      onToggleExpand={toggleExpanded}
      tz={tz}
    />
  );
```

In `src/locales/en.json`, add directly after the `"confirmMergeToYesterday": …` line:

```json
  "sessionAdjustment": "Adjustment",
  "showSessions": "Show sessions",
  "hideSessions": "Hide sessions",
```

In `src/locales/zh.json`, add directly after the `"confirmMergeToYesterday": …` line:

```json
  "sessionAdjustment": "调整",
  "showSessions": "显示练习记录",
  "hideSessions": "隐藏练习记录",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reportItemCard.test.jsx tests/dailyReport.test.jsx`
Expected: PASS (all tests in both files).

- [ ] **Step 5: Full check**

Run: `npm run test && npm run lint && npm run build`
Expected: everything passes.

Then run: `grep -rnE "(blue|indigo|violet)-[0-9]{2,3}" src/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReportItemCard.jsx src/components/DailyReport.jsx src/locales/en.json src/locales/zh.json tests/reportItemCard.test.jsx tests/dailyReport.test.jsx
git commit -m "feat(reports): show per-item sessions on the Daily report" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the last task

1. **Run the final checks:**
   - `npm run test && npm run lint && npm run build`, which must all pass.
   - `grep -rn "addAdjustmentLog" src tests`, which must print nothing.
2. **Give the user these manual testing steps.** Browser automation is not allowed for this project.
   1. Run `npm run dev` and open Report → Daily for today. Start and stop the timer on one item twice, a few minutes apart. Tap that item's card: two rows appear with 24-hour start and end times. Tap the card again and the rows close.
   2. Switch the language with `L`. The times stay 24-hour.
   3. Press **Edit** and tap the item. Add 2 minutes and save. The latest session is longer and now ends at the current time. Its start time moved to fit the new length.
   4. Still in edit mode, subtract more minutes than the latest session holds. The latest session disappears, the one before it ends earlier, and its start is unchanged.
   5. On a past day with practice, add time to an item. Its latest session now ends at 23:59, and the time stays on that day.
   6. Use **Remove All Time** on an item. Its card disappears, and no negative entry is left behind.
   7. On today with practice, use **Merge today's practice to yesterday**. Yesterday now shows those sessions back to back, with the last one ending at 23:59.
   8. While signed in, open a second browser profile or device. Edits and deletions from steps 3–6 show up there after a reload, or live if it stays open.
   9. Offline round trip:
      1. Enter offline mode.
      2. Edit one item's time, delete another item's time, and use Merge to yesterday.
      3. Confirm the Pending changes list shows readable lines, including "Deleted … min on …".
      4. Go online.
      5. After the sync overlay clears, all three changes are still there, on this device and the other one.
   10. Arrow between days with a card open. The same item's card stays open wherever it has practice.
   11. Turn on compact mode and check a phone-width window. The session rows fit and don't overflow.
3. **Ask the user before updating `CLAUDE.md`**, as their global instructions require. The spec's "Docs to update after implementation" section lists what to change:
   - **Database:** `addAdjustmentLog` is removed, `editItemDayTime` is new, and `reattributeLogsToDate` now packs logs to end at 23:59:59.
   - **Merge to yesterday paragraph:** replace noon with packing.
   - **Sync correctness:**
     - the log `duration` diff
     - log-deletion reconciliation in `pullAll`, and the `syncedOnce` assumption it depends on
     - the enriched `create_log` payload and `replayLogPayload`
     - `delete_log`
   - **Date helpers:** `formatClockInTimezone`, `lastSecondOfDay` and `src/utils/sessions.js`.
   - **Tests list:** add `sessions`, `dailyReport` and `useReports.timeEdit`.
