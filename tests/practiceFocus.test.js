import { describe, it, expect } from 'vitest';
import { resolveFocusedItemId } from '../src/utils/practiceFocus';

const item = (id, category, extra = {}) => ({ id, category, archived: false, trashed: false, ...extra });

describe('resolveFocusedItemId', () => {
  const items = [item(1, 'fundamentals'), item(2, 'fundamentals'), item(3, 'songs')];

  it('keeps the stored item while it is still active', () => {
    expect(resolveFocusedItemId(items, 2, 3)).toBe(2);
  });

  it('falls back to the running item when nothing is stored', () => {
    expect(resolveFocusedItemId(items, null, 3)).toBe(3);
  });

  it('falls back to the running item when the stored item was archived', () => {
    const withArchived = [item(1, 'fundamentals'), item(2, 'fundamentals', { archived: true }), item(3, 'songs')];
    expect(resolveFocusedItemId(withArchived, 2, 3)).toBe(3);
  });

  it('falls back to the first item when the stored item was trashed and nothing is running', () => {
    const withTrashed = [item(1, 'fundamentals'), item(2, 'fundamentals', { trashed: true }), item(3, 'songs')];
    expect(resolveFocusedItemId(withTrashed, 2, null)).toBe(1);
  });

  it('falls back to the first item when the stored item no longer exists', () => {
    expect(resolveFocusedItemId(items, 99, null)).toBe(1);
  });

  it('ignores a running item that is no longer active', () => {
    const runningArchived = [item(1, 'fundamentals'), item(3, 'songs', { archived: true })];
    expect(resolveFocusedItemId(runningArchived, null, 3)).toBe(1);
  });

  it('picks the first item in on-screen order: Fundamentals before Songs', () => {
    const songsFirst = [item(3, 'songs'), item(1, 'fundamentals')];
    expect(resolveFocusedItemId(songsFirst, null, null)).toBe(1);
  });

  it('picks the first song when there are no fundamentals', () => {
    expect(resolveFocusedItemId([item(3, 'songs'), item(4, 'songs')], null, null)).toBe(3);
  });

  it('returns null when there are no active items', () => {
    expect(resolveFocusedItemId([], null, null)).toBeNull();
    expect(resolveFocusedItemId([item(1, 'fundamentals', { archived: true })], 1, null)).toBeNull();
  });
});
