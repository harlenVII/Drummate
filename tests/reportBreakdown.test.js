import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildBreakdown } from '../src/utils/practiceStats';

const items = [
  { id: 1, name: 'Singles', category: 'fundamentals' },
  { id: 2, name: 'Song A',  category: 'songs' },
  { id: 3, name: 'Paradiddle', category: 'fundamentals' },
  { id: 4, name: 'Legacy', category: undefined }, // legacy item w/o category
];
const logs = [
  { itemId: 1, duration: 600 },
  { itemId: 1, duration: 300 },  // Singles total 900
  { itemId: 2, duration: 1200 }, // Song A total 1200
  { itemId: 3, duration: 0 },    // dropped (0 duration)
  { itemId: 4, duration: 120 },  // Legacy total 120 -> treated as fundamentals
];

describe('buildBreakdown', () => {
  it('totals per item, drops zero-duration, sorts by duration desc', () => {
    const { breakdown } = buildBreakdown(items, logs);
    expect(breakdown.map((e) => [e.name, e.duration])).toEqual([
      ['Song A', 1200],
      ['Singles', 900],
      ['Legacy', 120],
    ]);
  });

  it('splits fundamentals (incl. missing category) and songs', () => {
    const { fundamentals, songs } = buildBreakdown(items, logs);
    expect(fundamentals.map((e) => e.name)).toEqual(['Singles', 'Legacy']);
    expect(songs.map((e) => e.name)).toEqual(['Song A']);
  });

  it('derives grandTotal from the breakdown only', () => {
    const { grandTotal } = buildBreakdown(items, logs);
    expect(grandTotal).toBe(2220); // 1200 + 900 + 120
  });

  it('clamps negative item totals to zero', () => {
    const { grandTotal } = buildBreakdown(
      [{ id: 1, name: 'X', category: 'songs' }],
      [{ itemId: 1, duration: -50 }],
    );
    expect(grandTotal).toBe(0);
  });
});
