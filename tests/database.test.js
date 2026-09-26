import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  addItem,
  addLog,
  addAdjustmentLog,
  reattributeLogsToDate,
  editItemDayTime,
  getLogsByDate,
  deleteItem,
  mergeItem,
  purgeExpiredTrash,
  addNote,
  getNotesByItem,
  addGoal,
  archiveGoal,
  getGoalByUid,
  setGoalPinned,
  updateGoal,
  addPractice,
} from '../src/services/database';
import { setTimezone } from '../src/services/timezoneService.js';
import { noonInHomeTz, getDateRangeUtc, lastSecondOfDay } from '../src/utils/tzDateHelpers.js';

const TZ = 'America/Los_Angeles';

beforeEach(async () => {
  await setTimezone(TZ);
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
  await db.notes.clear();
  await db.metronomePractices.clear();
  await db.syncQueue.clear();
  await db.goals.clear();
});

// ---------------------------------------------------------------------------
// deleteItem — cascade to logs AND notes, scoped to the deleted item only
// ---------------------------------------------------------------------------
describe('deleteItem', () => {
  it('cascades to the item\'s logs and notes but leaves other items untouched', async () => {
    const a = await addItem('Singles', 'fundamentals');
    const b = await addItem('Doubles', 'fundamentals');

    await addLog(a.id, 60);
    await addLog(a.id, 30);
    await addNote(a.uid, 'note on a', '2026-05-01');

    await addLog(b.id, 90);
    await addNote(b.uid, 'note on b', '2026-05-01');

    await deleteItem(a.id);

    expect(await db.practiceItems.get(a.id)).toBeUndefined();
    expect(await db.practiceLogs.where('itemId').equals(a.id).count()).toBe(0);
    expect(await getNotesByItem(a.uid)).toHaveLength(0);

    // b is fully intact
    expect(await db.practiceItems.get(b.id)).toBeTruthy();
    expect(await db.practiceLogs.where('itemId').equals(b.id).count()).toBe(1);
    expect(await getNotesByItem(b.uid)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// mergeItem — reassign logs+notes to target, hard-delete source, guards
// ---------------------------------------------------------------------------
describe('mergeItem', () => {
  it('reassigns source logs and notes to the target and deletes the source', async () => {
    const source = await addItem('Paradiddle', 'fundamentals');
    const target = await addItem('Paradiddles', 'fundamentals');

    await addLog(source.id, 120);
    await addNote(source.uid, 'old note', '2026-05-01');

    const result = await mergeItem(source.id, target.id);

    expect(result).toEqual({
      sourceUid: source.uid,
      targetUid: target.uid,
      targetName: target.name,
    });
    expect(await db.practiceItems.get(source.id)).toBeUndefined();

    const logs = await db.practiceLogs.where('itemId').equals(target.id).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].itemUid).toBe(target.uid);

    const notes = await getNotesByItem(target.uid);
    expect(notes).toHaveLength(1);
    expect(await getNotesByItem(source.uid)).toHaveLength(0);
  });

  it('rejects merging an item into itself', async () => {
    const a = await addItem('Flam', 'fundamentals');
    await expect(mergeItem(a.id, a.id)).rejects.toThrow(/same/);
  });

  it('rejects when the source or target is missing', async () => {
    const a = await addItem('Flam', 'fundamentals');
    await expect(mergeItem(99999, a.id)).rejects.toThrow(/source item not found/);
    await expect(mergeItem(a.id, 99999)).rejects.toThrow(/target item not found/);
  });

  it('rejects when either side is trashed', async () => {
    const source = await addItem('A', 'fundamentals');
    const target = await addItem('B', 'fundamentals');
    await db.practiceItems.update(source.id, { trashed: true });
    await expect(mergeItem(source.id, target.id)).rejects.toThrow(/source item is trashed/);
  });
});

// ---------------------------------------------------------------------------
// purgeExpiredTrash — cutoff window, cascade, and return shape
// ---------------------------------------------------------------------------
describe('purgeExpiredTrash', () => {
  const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString();

  it('purges items trashed past the window (with their logs+notes) and keeps recent ones', async () => {
    const old = await addItem('Old', 'fundamentals');
    const recent = await addItem('Recent', 'fundamentals');

    await db.practiceItems.update(old.id, { trashed: true, trashedAt: daysAgoISO(40) });
    await db.practiceItems.update(recent.id, { trashed: true, trashedAt: daysAgoISO(2) });

    await addLog(old.id, 60);
    await addNote(old.uid, 'doomed', '2026-05-01');

    const { expiredItems, expiredNotes } = await purgeExpiredTrash();

    expect(expiredItems.map((i) => i.id)).toEqual([old.id]);
    expect(expiredNotes).toEqual([]);

    expect(await db.practiceItems.get(old.id)).toBeUndefined();
    expect(await db.practiceLogs.where('itemId').equals(old.id).count()).toBe(0);
    expect(await getNotesByItem(old.uid)).toHaveLength(0);

    expect(await db.practiceItems.get(recent.id)).toBeTruthy();
  });

  it('purges standalone notes trashed past the window and reports them', async () => {
    const item = await addItem('Keeper', 'fundamentals');
    const noteId = await addNote(item.uid, 'old note', '2026-05-01');
    await db.notes.update(noteId, { trashed: true, trashedAt: daysAgoISO(40) });

    const { expiredItems, expiredNotes } = await purgeExpiredTrash();

    expect(expiredItems).toEqual([]);
    expect(expiredNotes.map((n) => n.id)).toEqual([noteId]);
    expect(await db.notes.get(noteId)).toBeUndefined();
    // the parent item itself is untouched
    expect(await db.practiceItems.get(item.id)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Log time-stamping + timezone re-bucketing
// ---------------------------------------------------------------------------
describe('practice logs', () => {
  it('addLog stamps loggedAt to the provided value and derives the date in the home tz', async () => {
    const item = await addItem('Hi-Hat', 'fundamentals');
    const loggedAt = noonInHomeTz('2026-05-01', TZ);
    const id = await addLog(item.id, 300, { loggedAt });
    const log = await db.practiceLogs.get(id);

    expect(log.loggedAt).toBe(loggedAt);
    expect(log.date).toBe('2026-05-01');
    expect(log.itemUid).toBe(item.uid);
    expect(log.syncedOnce).toBe(false);
  });

  it('addAdjustmentLog anchors loggedAt to noon of the given date in the home tz', async () => {
    const item = await addItem('Kick', 'fundamentals');
    await addAdjustmentLog(item.id, 600, '2026-05-01');

    const onDate = await getLogsByDate('2026-05-01');
    expect(onDate).toHaveLength(1);
    expect(onDate[0].loggedAt).toBe(noonInHomeTz('2026-05-01', TZ));
  });

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

  it('re-buckets logs by the current timezone without mutating storage', async () => {
    const item = await addItem('Tom', 'fundamentals');
    // Noon in LA on May 1 lands on the early hours of May 2 in Tokyo (UTC+9).
    await addLog(item.id, 60, { loggedAt: noonInHomeTz('2026-05-01', TZ) });

    expect(await getLogsByDate('2026-05-01')).toHaveLength(1);

    await setTimezone('Asia/Tokyo');
    expect(await getLogsByDate('2026-05-01')).toHaveLength(0);
    const shifted = await getLogsByDate('2026-05-02');
    expect(shifted).toHaveLength(1);
    expect(shifted[0].date).toBe('2026-05-02'); // re-derived on read, not stored
  });
});

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

// ---------------------------------------------------------------------------
// Goals — single-pin invariant and update semantics
// ---------------------------------------------------------------------------
describe('setGoalPinned', () => {
  it('pins exactly one goal, unpinning any previously pinned one', async () => {
    const g1 = await addGoal({ name: 'G1', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 50 });
    const g2 = await addGoal({ name: 'G2', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 60 });

    const firstChange = await setGoalPinned(g1);
    expect(firstChange.map((g) => g.uid)).toEqual([g1]);
    expect((await getGoalByUid(g1)).pinned).toBe(true);

    const secondChange = await setGoalPinned(g2);
    // g2 becomes pinned and g1 gets unpinned — both rows changed
    const changedUids = secondChange.map((g) => g.uid).sort();
    expect(changedUids).toEqual([g1, g2].sort());
    expect((await getGoalByUid(g1)).pinned).toBe(false);
    expect((await getGoalByUid(g2)).pinned).toBe(true);

    const pinnedCount = (await db.goals.toArray()).filter((g) => g.pinned).length;
    expect(pinnedCount).toBe(1);
  });

  it('returns no changes when re-pinning the already-pinned goal', async () => {
    const g1 = await addGoal({ name: 'G1', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 50 });
    await setGoalPinned(g1);
    expect(await setGoalPinned(g1)).toEqual([]);
  });
});

describe('updateGoal', () => {
  it('un-archives a goal when its endDate is moved back into the future', async () => {
    const uid = await addGoal({ name: 'Past', startDate: '2020-01-01', endDate: '2020-12-31', targetHours: 10 });
    await archiveGoal(uid);
    expect((await getGoalByUid(uid)).archived).toBe(true);

    const result = await updateGoal(uid, { endDate: '2099-12-31' });

    expect(result.archived).toBe(false);
    expect(result.archivedAt).toBeNull();
    const reloaded = await getGoalByUid(uid);
    expect(reloaded.archived).toBe(false);
  });

  it('strips identity fields so a patch cannot overwrite uid/id and forces resync', async () => {
    const uid = await addGoal({ name: 'Original', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 10 });
    await db.goals.where('uid').equals(uid).modify({ syncedOnce: true });

    await updateGoal(uid, { uid: 'EVIL', id: 99999, syncedOnce: true, name: 'Renamed' });

    expect(await getGoalByUid('EVIL')).toBeUndefined();
    const reloaded = await getGoalByUid(uid);
    expect(reloaded.name).toBe('Renamed');
    expect(reloaded.syncedOnce).toBe(false); // always re-marked dirty
  });

  it('returns null for an unknown uid', async () => {
    expect(await updateGoal('does-not-exist', { name: 'x' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validatePractice (exercised through addPractice)
// ---------------------------------------------------------------------------
describe('addPractice validation', () => {
  const valid = {
    name: 'Warmup',
    startBpm: 80,
    endBpm: 120,
    bpmIncrement: 2,
    barsPerStep: 4,
    timeSignature: { beats: 4, noteValue: 4 },
    subdivision: 'eighth',
    soundType: 'click',
  };

  it('accepts a fully valid practice and persists it', async () => {
    const rec = await addPractice(valid);
    expect(rec.id).toBeDefined();
    expect(rec.uid).toBeDefined();
    expect(rec.syncedOnce).toBe(false);
    expect(await db.metronomePractices.count()).toBe(1);
  });

  it.each([
    ['empty name', { name: '   ' }, /name required/],
    ['startBpm out of range', { startBpm: 10 }, /invalid startBpm/],
    ['endBpm below startBpm', { startBpm: 120, endBpm: 80 }, /endBpm must be >= startBpm/],
    ['bpmIncrement below 1', { bpmIncrement: 0 }, /bpmIncrement must be >= 1/],
    ['barsPerStep below 1', { barsPerStep: 0 }, /barsPerStep must be >= 1/],
    ['noteValue not a power-of-two slot', { timeSignature: { beats: 4, noteValue: 3 } }, /noteValue must be/],
    ['beats out of range', { timeSignature: { beats: 99, noteValue: 4 } }, /beats out of range/],
    ['unknown subdivision', { subdivision: 'nonexistent' }, /invalid subdivision/],
    ['rest subdivision (pattern null) rejected', { subdivision: 'rest' }, /invalid subdivision/],
    ['invalid soundType', { soundType: 'kazoo' }, /invalid soundType/],
  ])('rejects %s', async (_label, override, matcher) => {
    await expect(addPractice({ ...valid, ...override })).rejects.toThrow(matcher);
    expect(await db.metronomePractices.count()).toBe(0);
  });
});
