import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTheme, setTheme, getAccent, setAccent, subscribeTheme,
} from '../src/services/themeService';

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  setTheme('light');
  setAccent('blue');
});

afterEach(() => {
  setTheme('light');
  setAccent('blue');
});

describe('themeService accent axis', () => {
  it('defaults to blue', () => {
    expect(getAccent()).toBe('blue');
  });

  it('applies the accent as a data attribute on <html>', () => {
    setAccent('orange');
    expect(root().getAttribute('data-accent')).toBe('orange');
    setAccent('green');
    expect(root().getAttribute('data-accent')).toBe('green');
  });

  it('persists the accent to localStorage', () => {
    setAccent('green');
    expect(localStorage.getItem('drummate_accent')).toBe('green');
  });

  it('rejects an unknown accent', () => {
    expect(() => setAccent('chartreuse')).toThrow(/invalid accent/i);
    expect(getAccent()).toBe('blue');
  });

  it('notifies subscribers on accent change', () => {
    let calls = 0;
    const unsub = subscribeTheme(() => { calls += 1; });
    setAccent('orange');
    expect(calls).toBe(1);
    unsub();
    setAccent('green');
    expect(calls).toBe(1);
  });

  it('keeps the two axes independent', () => {
    setAccent('orange');
    setTheme('dark');
    expect(getAccent()).toBe('orange');
    expect(getTheme()).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().getAttribute('data-accent')).toBe('orange');

    setTheme('light');
    expect(getAccent()).toBe('orange');
    expect(root().getAttribute('data-accent')).toBe('orange');

    setAccent('blue');
    expect(getTheme()).toBe('light');
  });
});
