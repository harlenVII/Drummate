import { describe, it, expect } from 'vitest';
import { compareNotes } from '../src/services/database';

describe('compareNotes', () => {
  it('sorts newer dates first', () => {
    const arr = [{ date: '2026-01-01', id: 1 }, { date: '2026-01-03', id: 2 }];
    expect([...arr].sort(compareNotes).map((n) => n.id)).toEqual([2, 1]);
  });

  it('within the same date, newer createdAt first', () => {
    const arr = [
      { date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z', id: 1 },
      { date: '2026-01-01', createdAt: '2026-01-01T09:00:00Z', id: 2 },
    ];
    expect([...arr].sort(compareNotes).map((n) => n.id)).toEqual([2, 1]);
  });

  it('falls back to id descending for legacy rows without createdAt', () => {
    const arr = [{ date: '2026-01-01', id: 1 }, { date: '2026-01-01', id: 2 }];
    expect([...arr].sort(compareNotes).map((n) => n.id)).toEqual([2, 1]);
  });
});
