import { describe, it, expect } from 'vitest';
import { resolveAccentRamp, buildHeatmapPalette } from '../src/utils/accentPalette';
import { ACCENT_PALETTES } from '../src/constants/accentPalettes';

describe('resolveAccentRamp', () => {
  it('returns the light ramp for the requested accent', () => {
    expect(resolveAccentRamp('orange', false)).toEqual(ACCENT_PALETTES.orange.light);
  });

  it('returns the dark ramp when isDark', () => {
    expect(resolveAccentRamp('green', true)).toEqual(ACCENT_PALETTES.green.dark);
  });

  it('falls back to blue for an unknown accent', () => {
    expect(resolveAccentRamp('chartreuse', false)).toEqual(ACCENT_PALETTES.blue.light);
    expect(resolveAccentRamp(undefined, true)).toEqual(ACCENT_PALETTES.blue.dark);
  });
});

describe('buildHeatmapPalette', () => {
  it('reproduces the pre-migration blue heatmap exactly', () => {
    const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
    expect(light.empty).toBe('#e2e8f0');
    expect(light.l1).toBe('#bfdbfe');
    expect(light.l2).toBe('#60a5fa');
    expect(light.l3).toBe('#2563eb');
    expect(light.l4).toBe('#1e3a8a');

    const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);
    expect(dark.empty).toBe('#334155');
    expect(dark.l1).toBe('#a5b4fc');
    expect(dark.l2).toBe('#6366f1');
    expect(dark.l3).toBe('#4338ca');
    expect(dark.l4).toBe('#3730a3');
  });

  it('reproduces the pre-migration text colors exactly', () => {
    const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
    expect(light.emptyText).toBe('#94a3b8');
    expect(light.l1Text).toBe('#1e3a8a');
    expect(light.l2Text).toBe('#ffffff');
    expect(light.l3Text).toBe('#ffffff');
    expect(light.l4Text).toBe('#ffffff');

    const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);
    expect(dark.l1Text).toBe('#312e81');
  });

  it('tracks the scheme for non-blue accents', () => {
    const orange = buildHeatmapPalette(ACCENT_PALETTES.orange.light, false);
    expect(orange.l3).toBe(ACCENT_PALETTES.orange.light[600]);
    expect(orange.l1Text).toBe(ACCENT_PALETTES.orange.light[900]);
    // surface greys are not accent-derived
    expect(orange.empty).toBe('#e2e8f0');
  });
});
