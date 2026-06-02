import { describe, it, expect } from 'vitest';
import { computePercentiles, intensityColor } from '../src/utils/heatmap';

describe('computePercentiles', () => {
  it('returns all zeros for empty input', () => {
    expect(computePercentiles([])).toEqual({ p25: 0, p50: 0, p75: 0 });
  });

  it('ignores zero values and sorts internally', () => {
    // positive values: 10,20,30,40 -> floor(4*0.25)=1 ->20, floor(4*0.5)=2 ->30, floor(4*0.75)=3 ->40
    const r = computePercentiles([0, 40, 0, 10, 30, 20]);
    expect(r).toEqual({ p25: 20, p50: 30, p75: 40 });
  });

  it('matches the prior inline single-value behavior', () => {
    expect(computePercentiles([60])).toEqual({ p25: 60, p50: 60, p75: 60 });
  });
});

describe('intensityColor', () => {
  const buckets = { p25: 20, p50: 30, p75: 40 };

  it('returns the empty-cell color for zero', () => {
    expect(intensityColor(0, buckets, false)).toBe('#e2e8f0');
    expect(intensityColor(0, buckets, true)).toBe('#334155');
  });

  it('buckets by percentile (light)', () => {
    expect(intensityColor(20, buckets, false)).toBe('#bfdbfe');
    expect(intensityColor(30, buckets, false)).toBe('#60a5fa');
    expect(intensityColor(40, buckets, false)).toBe('#2563eb');
    expect(intensityColor(99, buckets, false)).toBe('#1e3a8a');
  });

  it('buckets by percentile (dark)', () => {
    expect(intensityColor(20, buckets, true)).toBe('#a5b4fc');
    expect(intensityColor(99, buckets, true)).toBe('#3730a3');
  });
});
