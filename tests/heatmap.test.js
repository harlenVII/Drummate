import { describe, it, expect } from 'vitest';
import { computePercentiles, intensityColor, intensityTextColor } from '../src/utils/heatmap';
import { buildHeatmapPalette } from '../src/utils/accentPalette';
import { ACCENT_PALETTES } from '../src/constants/accentPalettes';

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
  const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
  const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);

  it('returns the empty-cell color for zero', () => {
    expect(intensityColor(0, buckets, light)).toBe('#e2e8f0');
    expect(intensityColor(0, buckets, dark)).toBe('#334155');
  });

  it('buckets by percentile (light) exactly as before the migration', () => {
    expect(intensityColor(20, buckets, light)).toBe('#bfdbfe');
    expect(intensityColor(30, buckets, light)).toBe('#60a5fa');
    expect(intensityColor(40, buckets, light)).toBe('#2563eb');
    expect(intensityColor(99, buckets, light)).toBe('#1e3a8a');
  });

  it('buckets by percentile (dark) exactly as before the migration', () => {
    expect(intensityColor(20, buckets, dark)).toBe('#a5b4fc');
    expect(intensityColor(99, buckets, dark)).toBe('#3730a3');
  });

  it('follows the active scheme', () => {
    const orange = buildHeatmapPalette(ACCENT_PALETTES.orange.light, false);
    expect(intensityColor(99, buckets, orange)).toBe(ACCENT_PALETTES.orange.light[900]);
  });
});

describe('intensityTextColor', () => {
  const buckets = { p25: 20, p50: 30, p75: 40 };
  const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
  const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);

  it('reproduces the old BG_TEXT lookup for light mode', () => {
    expect(intensityTextColor(0, buckets, light)).toBe('#94a3b8');
    expect(intensityTextColor(20, buckets, light)).toBe('#1e3a8a');
    expect(intensityTextColor(30, buckets, light)).toBe('#ffffff');
    expect(intensityTextColor(40, buckets, light)).toBe('#ffffff');
    expect(intensityTextColor(99, buckets, light)).toBe('#ffffff');
  });

  it('reproduces the old BG_TEXT lookup for dark mode', () => {
    expect(intensityTextColor(0, buckets, dark)).toBe('#94a3b8');
    expect(intensityTextColor(20, buckets, dark)).toBe('#312e81');
    expect(intensityTextColor(99, buckets, dark)).toBe('#ffffff');
  });

  it('buckets on the same boundaries as intensityColor', () => {
    const fills = [light.empty, light.l1, light.l2, light.l3, light.l4];
    const texts = [light.emptyText, light.l1Text, light.l2Text, light.l3Text, light.l4Text];
    // [input seconds, expected level] for buckets { p25: 20, p50: 30, p75: 40 }
    // Text colors are intentionally non-unique (l2/l3/l4 are all white), so a reverse
    // lookup cannot distinguish levels 2-4. Explicit table avoids that brittleness.
    const cases = [[0, 0], [1, 1], [20, 1], [21, 2], [30, 2], [31, 3], [40, 3], [41, 4], [99, 4]];
    for (const [seconds, expectedLevel] of cases) {
      expect(intensityColor(seconds, buckets, light)).toBe(fills[expectedLevel]);
      expect(intensityTextColor(seconds, buckets, light)).toBe(texts[expectedLevel]);
    }
  });
});
