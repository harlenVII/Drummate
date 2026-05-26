import { describe, it, expect } from 'vitest';
import {
  computeGoalStatus,
  isCurrentGoal,
  isHistoryGoal,
  selectExpiredForArchive,
  shouldMigrateLegacy,
  buildMigratedGoal,
} from '../src/utils/goalStatus.js';

const G = (overrides = {}) => ({
  uid: 'g1',
  name: '',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  targetHours: 10,
  archived: false,
  archivedAt: null,
  pinned: false,
  createdAt: 1000,
  syncedOnce: false,
  ...overrides,
});

const L = (date, durationSeconds) => ({ date, duration: durationSeconds });

describe('computeGoalStatus', () => {
  it('sums log durations within the goal date range', () => {
    const goal = G();
    const logs = [L('2026-01-05', 3600), L('2026-01-20', 7200)];
    const s = computeGoalStatus(goal, logs);
    expect(s.practicedSeconds).toBe(10800);
    expect(s.practicedHours).toBeCloseTo(3.0, 5);
  });

  it('ignores logs outside the range', () => {
    const goal = G({ startDate: '2026-02-01', endDate: '2026-02-28' });
    const logs = [L('2026-01-31', 3600), L('2026-03-01', 3600), L('2026-02-15', 1800)];
    const s = computeGoalStatus(goal, logs);
    expect(s.practicedSeconds).toBe(1800);
  });

  it('met=true when practicedHours >= targetHours', () => {
    const goal = G({ targetHours: 1 });
    const logs = [L('2026-01-10', 3600)];
    expect(computeGoalStatus(goal, logs).met).toBe(true);
  });

  it('met=false when practicedHours < targetHours', () => {
    const goal = G({ targetHours: 5 });
    const logs = [L('2026-01-10', 3600)];
    expect(computeGoalStatus(goal, logs).met).toBe(false);
  });

  it('progressPercent is capped at 100', () => {
    const goal = G({ targetHours: 1 });
    const logs = [L('2026-01-10', 36000)];
    expect(computeGoalStatus(goal, logs).progressPercent).toBe(100);
  });

  it('handles empty logs', () => {
    const s = computeGoalStatus(G(), []);
    expect(s.practicedSeconds).toBe(0);
    expect(s.met).toBe(false);
    expect(s.progressPercent).toBe(0);
  });

  it('editing targetHours upward can flip a met goal to missed', () => {
    const logs = [L('2026-01-10', 3600 * 5)]; // 5 hours
    expect(computeGoalStatus(G({ targetHours: 4 }), logs).met).toBe(true);
    expect(computeGoalStatus(G({ targetHours: 10 }), logs).met).toBe(false);
  });
});

describe('isCurrentGoal / isHistoryGoal', () => {
  it('current: not archived and endDate >= today', () => {
    expect(isCurrentGoal(G({ endDate: '2026-05-26' }), '2026-05-26')).toBe(true);
    expect(isCurrentGoal(G({ endDate: '2026-06-01' }), '2026-05-26')).toBe(true);
    expect(isCurrentGoal(G({ endDate: '2026-05-25' }), '2026-05-26')).toBe(false);
    expect(isCurrentGoal(G({ archived: true, endDate: '2026-06-01' }), '2026-05-26')).toBe(false);
  });

  it('history: archived OR endDate < today', () => {
    expect(isHistoryGoal(G({ archived: true, endDate: '2026-06-01' }), '2026-05-26')).toBe(true);
    expect(isHistoryGoal(G({ archived: false, endDate: '2026-05-25' }), '2026-05-26')).toBe(true);
    expect(isHistoryGoal(G({ archived: false, endDate: '2026-05-26' }), '2026-05-26')).toBe(false);
  });

  it('current and history are mutually exclusive', () => {
    const today = '2026-05-26';
    const samples = [
      G({ archived: false, endDate: '2026-05-25' }),
      G({ archived: false, endDate: '2026-05-26' }),
      G({ archived: true,  endDate: '2026-06-30' }),
    ];
    for (const g of samples) {
      expect(isCurrentGoal(g, today)).not.toBe(isHistoryGoal(g, today));
    }
  });
});

describe('selectExpiredForArchive', () => {
  it('returns only goals with !archived && endDate < today', () => {
    const today = '2026-05-26';
    const goals = [
      G({ uid: 'a', archived: false, endDate: '2026-05-25' }),
      G({ uid: 'b', archived: false, endDate: '2026-05-26' }),
      G({ uid: 'c', archived: true,  endDate: '2026-01-01' }),
      G({ uid: 'd', archived: false, endDate: '2026-06-01' }),
    ];
    const out = selectExpiredForArchive(goals, today);
    expect(out.map(g => g.uid)).toEqual(['a']);
  });

  it('is idempotent — running again finds nothing once flipped', () => {
    const today = '2026-05-26';
    const goals = [G({ archived: true, endDate: '2026-05-25' })];
    expect(selectExpiredForArchive(goals, today)).toEqual([]);
  });
});

describe('shouldMigrateLegacy', () => {
  it('true when Dexie empty AND legacy goal is well-formed', () => {
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":10}')).toBe(true);
  });

  it('false when Dexie already has goals', () => {
    expect(shouldMigrateLegacy(3, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":10}')).toBe(false);
  });

  it('false when legacy is absent', () => {
    expect(shouldMigrateLegacy(0, null)).toBe(false);
    expect(shouldMigrateLegacy(0, '')).toBe(false);
  });

  it('false when legacy JSON is malformed', () => {
    expect(shouldMigrateLegacy(0, 'not json')).toBe(false);
  });

  it('false when legacy is missing required fields', () => {
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01"}')).toBe(false);
    expect(shouldMigrateLegacy(0, '{"endDate":"2026-01-31","targetHours":10}')).toBe(false);
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":0}')).toBe(false);
  });
});

describe('buildMigratedGoal', () => {
  it('produces a record with required defaults', () => {
    const raw = '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":12}';
    const out = buildMigratedGoal(raw, 5000, () => 'fixed-uid');
    expect(out).toEqual({
      uid: 'fixed-uid',
      name: '',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      targetHours: 12,
      archived: false,
      archivedAt: null,
      pinned: true,
      createdAt: 5000,
      syncedOnce: false,
    });
  });
});
