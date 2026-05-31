import { describe, it, expect } from 'vitest';
import { formatDuration, formatTime } from '../src/utils/formatTime';

describe('formatDuration', () => {
  it('returns whole minutes when unit is minutes', () => {
    expect(formatDuration(90, 'minutes')).toBe(2);   // 90s -> 1.5min -> rounds to 2
    expect(formatDuration(0, 'minutes')).toBe(0);
    expect(formatDuration(59, 'minutes')).toBe(1);
  });

  it('returns one-decimal hours when unit is hours', () => {
    expect(formatDuration(3600, 'hours')).toBe('1.0');
    expect(formatDuration(5400, 'hours')).toBe('1.5');
    expect(formatDuration(0, 'hours')).toBe('0.0');
  });
});

describe('formatTime', () => {
  it('formats seconds as zero-padded HH:MM:SS', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(61)).toBe('00:01:01');
    expect(formatTime(3663)).toBe('01:01:03');
  });
});
