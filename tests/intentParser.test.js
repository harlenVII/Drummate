import { describe, it, expect } from 'vitest';
import { parseIntent, findBestItemMatch } from '../src/services/intentParser';

describe('parseIntent', () => {
  it('detects metronome start/stop', () => {
    expect(parseIntent('start the metronome')).toEqual({ action: 'metronome.start' });
    expect(parseIntent('stop')).toEqual({ action: 'metronome.stop' });
  });

  it('strips a leading wake word', () => {
    expect(parseIntent('drummate start the metronome')).toEqual({ action: 'metronome.start' });
  });

  it('parses an absolute tempo and rejects out-of-range values', () => {
    expect(parseIntent('set tempo to 120')).toEqual({ action: 'metronome.setTempo', value: 120 });
    expect(parseIntent('140 bpm')).toEqual({ action: 'metronome.setTempo', value: 140 });
    expect(parseIntent('set tempo to 999').action).toBe('unknown');
  });

  it('parses relative tempo adjustments with sign', () => {
    expect(parseIntent('increase tempo by 10')).toEqual({ action: 'metronome.adjustTempo', delta: 10 });
    expect(parseIntent('slow down by 5')).toEqual({ action: 'metronome.adjustTempo', delta: -5 });
  });

  it('parses a valid time signature and rejects an invalid one', () => {
    expect(parseIntent('set time signature to 3/4')).toEqual({
      action: 'metronome.setTimeSignature',
      value: [3, 4],
    });
    expect(parseIntent('set time signature to 7/8').action).not.toBe('metronome.setTimeSignature');
  });

  it('parses recognized subdivisions and leaves unrecognized ones unknown', () => {
    expect(parseIntent('switch to eighth notes')).toEqual({
      action: 'metronome.setSubdivision',
      value: 'eighth',
    });
    expect(parseIntent('play triplets')).toEqual({
      action: 'metronome.setSubdivision',
      value: 'triplet',
    });
    // documented gap: subMap has no 'sextuplet' alias
    expect(parseIntent('switch to sextuplet').action).toBe('unknown');
  });

  it('distinguishes practice start/stop from metronome', () => {
    expect(parseIntent('start practicing paradiddles')).toEqual({
      action: 'practice.start',
      itemQuery: 'paradiddles',
    });
    expect(parseIntent('stop practice')).toEqual({ action: 'practice.stop' });
  });

  it('parses report, navigation, and language intents', () => {
    expect(parseIntent('generate report for yesterday')).toEqual({
      action: 'report.generate',
      date: 'yesterday',
    });
    expect(parseIntent('show the report')).toEqual({ action: 'report.generate', date: 'today' });
    expect(parseIntent('go to practice')).toEqual({ action: 'navigate', tab: 'practice' });
    expect(parseIntent('open sequencer')).toEqual({
      action: 'navigate',
      tab: 'metronome',
      subpage: 'sequencer',
    });
    expect(parseIntent('switch language')).toEqual({ action: 'toggleLanguage' });
  });

  it('returns unknown for unrecognized input, preserving original text', () => {
    expect(parseIntent('what time is it')).toEqual({ action: 'unknown', text: 'what time is it' });
  });
});

describe('findBestItemMatch', () => {
  const items = [{ name: 'Paradiddle' }, { name: 'Single Stroke Roll' }];

  it('returns null for an empty item list', () => {
    expect(findBestItemMatch('anything', [])).toBe(null);
  });

  it('matches exactly (case-insensitive)', () => {
    expect(findBestItemMatch('paradiddle', items)).toBe(items[0]);
  });

  it('matches on substring', () => {
    expect(findBestItemMatch('para', items)).toBe(items[0]);
  });

  it('matches a close typo via Levenshtein', () => {
    expect(findBestItemMatch('paradidle', items)).toBe(items[0]);
  });

  it('returns null when nothing is close enough', () => {
    expect(findBestItemMatch('xylophone', items)).toBe(null);
  });
});
