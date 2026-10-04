import { describe, it, expect } from 'vitest';
import { toSessionRows, planTimeEdit, planPackIntoDay, resolveOverlaps } from '../src/utils/sessions.js';

const MIN = 60 * 1000;
const DAY_START = 1780000000000; // stands in for 00:00 of the edited day
const at = (minutes) => DAY_START + minutes * MIN; // wall-clock minutes after 00:00
const row = (id, endMinutes, durationSeconds, itemId) => ({ id, loggedAt: at(endMinutes), duration: durationSeconds, itemId });
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

  it('adding time slides an earlier overlapping session of the same item back', () => {
    // A: 20:00-20:30 and 20:40-20:50. At 21:00, add 30 min: the latest becomes
    // 20:20-21:00, so 20:00-20:30 slides back to 19:50-20:20.
    const entries = [row(1, 20 * 60 + 30, 1800, 'A'), row(2, 20 * 60 + 50, 600, 'A')];
    const plan = planTimeEdit(entries, 1800, { anchorMs: at(21 * 60), dayStartMs: DAY_START });
    expect(plan).toEqual({
      updates: [
        { id: 2, loggedAt: at(21 * 60), duration: 2400 },
        { id: 1, loggedAt: at(20 * 60 + 20), duration: 1800 },
      ],
      deleteIds: [],
      create: null,
    });
  });

  it('an edit also fixes an overlap that already existed in the item', () => {
    // Old rows 11:30-12:00 and 11:50-12:10 overlap. Removing 1 min shortens the
    // latest to 11:50-12:09; the other slides back to 11:20-11:50.
    const entries = [row(1, 12 * 60, 1800, 'A'), row(2, 12 * 60 + 10, 1200, 'A')];
    const plan = planTimeEdit(entries, -60, opts);
    expect(plan.updates).toEqual([
      { id: 2, duration: 1140, loggedAt: at(12 * 60 + 9) },
      { id: 1, loggedAt: at(11 * 60 + 50), duration: 1800 },
    ]);
  });
});

describe('resolveOverlaps', () => {
  const opts = { dayStartMs: DAY_START };

  it('slides an earlier overlapping session back, keeping its length', () => {
    // A: 20:00-20:30 overlaps the latest, 20:20-21:00.
    const entries = [row(1, 20 * 60 + 30, 1800, 'A'), row(2, 21 * 60, 2400, 'A')];
    expect(resolveOverlaps(entries, opts)).toEqual([{ id: 1, loggedAt: at(20 * 60 + 20) }]);
  });

  it('cascades down the item list', () => {
    // 19:50-20:10, 20:00-20:30 and 20:20-21:00: each earlier one slides behind the next.
    const entries = [
      row(1, 20 * 60 + 10, 1200, 'A'),
      row(2, 20 * 60 + 30, 1800, 'A'),
      row(3, 21 * 60, 2400, 'A'),
    ];
    expect(resolveOverlaps(entries, opts)).toEqual([
      { id: 2, loggedAt: at(20 * 60 + 20) },
      { id: 1, loggedAt: at(19 * 60 + 50) },
    ]);
  });

  it('leaves non-overlapping sessions alone and never compares different items', () => {
    const entries = [
      row(1, 20 * 60 + 30, 1800, 'A'), // A 20:00-20:30
      row(2, 20 * 60 + 40, 1800, 'B'), // B 20:10-20:40 overlaps A, but is another item
      row(3, 19 * 60, 600, 'A'), // A 18:50-19:00
    ];
    expect(resolveOverlaps(entries, opts)).toEqual([]);
  });

  it('keeps the newer row in place when two sessions end at the same moment', () => {
    const entries = [row(1, 23 * 60 + 59, 600, 'A'), row(2, 23 * 60 + 59, 300, 'A')];
    expect(resolveOverlaps(entries, opts)).toEqual([{ id: 1, loggedAt: at(23 * 60 + 54) }]);
  });

  it('never slides a session end before the start of the day, even if an overlap remains', () => {
    // Latest crossed midnight: 23:50-00:20. The other (23:55-00:05) can only go back to 00:00.
    const entries = [row(1, 5, 600, 'A'), row(2, 20, 1800, 'A')];
    expect(resolveOverlaps(entries, opts)).toEqual([{ id: 1, loggedAt: DAY_START }]);
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

  it('lines up each item on its own, so every item ends at 23:59:59', () => {
    // Today: A 09:00-09:10, B 09:15-09:45, A again 09:50-09:55, C 10:00-10:05.
    const entries = [
      row(1, 9 * 60 + 10, 600, 'A'),
      row(2, 9 * 60 + 45, 1800, 'B'),
      row(3, 9 * 60 + 55, 300, 'A'),
      row(4, 10 * 60 + 5, 300, 'C'),
    ];
    const stamps = new Map(planPackIntoDay(entries, opts).map((s) => [s.id, s.loggedAt]));
    expect(stamps.get(2)).toBe(DAY_END); // B
    expect(stamps.get(4)).toBe(DAY_END); // C
    expect(stamps.get(3)).toBe(DAY_END); // A's later session
    expect(stamps.get(1)).toBe(DAY_END - 300 * 1000); // A's earlier session, right before it
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
