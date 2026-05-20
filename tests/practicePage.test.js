import { describe, it, expect } from 'vitest';

// These helpers are defined in PracticePage.jsx but we inline them here for
// unit testing without needing to mount the React component.
function computePracticeSeconds(practice) {
  const steps = [];
  for (let bpm = practice.startBpm; bpm < practice.endBpm; bpm += practice.bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(practice.endBpm);
  return steps.reduce((acc, bpm) => {
    return acc + (practice.timeSignature.beats * 60 / bpm) * practice.barsPerStep;
  }, 0);
}

function formatPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const basePractice = {
  startBpm: 80,
  endBpm: 80,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
};

describe('computePracticeSeconds', () => {
  it('single step (start === end): 4 beats * 60/80 * 4 bars = 12s', () => {
    expect(computePracticeSeconds(basePractice)).toBeCloseTo(12, 5);
  });

  it('two steps (80→85): sums both BPMs', () => {
    const p = { ...basePractice, endBpm: 85 };
    const expected = (4 * 60 / 80) * 4 + (4 * 60 / 85) * 4;
    expect(computePracticeSeconds(p)).toBeCloseTo(expected, 5);
  });

  it('always includes endBpm even when increment lands exactly on it', () => {
    const p = { ...basePractice, startBpm: 80, endBpm: 100, bpmIncrement: 10 };
    // steps: 80, 90, 100
    const expected = [80, 90, 100].reduce((a, bpm) => a + (4 * 60 / bpm) * 4, 0);
    expect(computePracticeSeconds(p)).toBeCloseTo(expected, 5);
  });
});

describe('formatPracticeTime', () => {
  it('formats zero seconds', () => {
    expect(formatPracticeTime(0)).toBe('0:00');
  });

  it('formats exactly 60 seconds', () => {
    expect(formatPracticeTime(60)).toBe('1:00');
  });

  it('formats 200 seconds as 3:20', () => {
    expect(formatPracticeTime(200)).toBe('3:20');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatPracticeTime(65)).toBe('1:05');
  });

  it('handles rounding that produces 60 seconds', () => {
    // 119.5s → floor(119.5/60)=1, round(59.5)=60 → carry → "2:00"
    expect(formatPracticeTime(119.5)).toBe('2:00');
  });
});
