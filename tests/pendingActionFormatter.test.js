import { describe, it, expect } from 'vitest';
import { formatPendingAction } from '../src/utils/pendingActionFormatter.js';

// Minimal t() that just renders the key + interpolations as a string —
// enough to assert that the right key + payload made it through.
function makeT() {
  return (key, params) => {
    if (!params) return key;
    let out = key + '|';
    out += Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',');
    return out;
  };
}

describe('formatPendingAction', () => {
  const t = makeT();

  it('create_item with name', () => {
    const entry = { action: 'create_item', payload: { uid: 'a', name: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.createItem|name=Snare');
  });

  it('create_log with itemName, duration, date', () => {
    const entry = { action: 'create_log', payload: { itemUid: 'a', itemName: 'Hi-hat', duration: 720, date: '2026-05-17' } };
    // duration is stored in SECONDS in payload; formatter converts to minutes.
    expect(formatPendingAction(entry, t)).toBe('offline.action.createLog|duration=12,name=Hi-hat,date=2026-05-17');
  });

  it('rename_item with previousName !== newName', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a', previousName: 'Snare', newName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItem|from=Snare,to=Snare Drum');
  });

  it('rename_item with previousName === newName falls back to renameItemTo', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a', previousName: 'Snare Drum', newName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItemTo|to=Snare Drum');
  });

  it('rename_item with no names falls back to generic', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItemGeneric');
  });

  it('delete_item with displayName', () => {
    const entry = { action: 'delete_item', payload: { uid: 'a', displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteItem|name=Snare');
  });

  it('delete_item without displayName falls back to generic', () => {
    const entry = { action: 'delete_item', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteItemGeneric');
  });

  it('reorder counts the items array', () => {
    const entry = { action: 'reorder', payload: { items: [{}, {}, {}, {}] } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.reorder|count=4');
  });

  it('archive_item archived=true', () => {
    const entry = { action: 'archive_item', payload: { uid: 'a', archived: true, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.archive|name=Snare');
  });

  it('archive_item archived=false renders unarchive', () => {
    const entry = { action: 'archive_item', payload: { uid: 'a', archived: false, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.unarchive|name=Snare');
  });

  it('trash_item trashed=true', () => {
    const entry = { action: 'trash_item', payload: { uid: 'a', trashed: true, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.trash|name=Snare');
  });

  it('trash_item trashed=false renders restore', () => {
    const entry = { action: 'trash_item', payload: { uid: 'a', trashed: false, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.restore|name=Snare');
  });

  it('set_category renders localized category label', () => {
    const entry = { action: 'set_category', payload: { uid: 'a', category: 'songs', displayName: 'Sweet Child O Mine' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.setCategory|name=Sweet Child O Mine,category=offline.action.categorySongs');
  });

  it('merge_items renders from → to', () => {
    const entry = { action: 'merge_items', payload: { sourceUid: 'a', targetUid: 'b', previousName: 'Snare', targetName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.merge|from=Snare,to=Snare Drum');
  });

  it('push_note with itemName + date', () => {
    const entry = { action: 'push_note', payload: { uid: 'a', itemName: 'Kick', date: '2026-05-17' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.pushNote|name=Kick,date=2026-05-17');
  });

  it('delete_note generic', () => {
    const entry = { action: 'delete_note', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteNote');
  });

  it('push_practice with name', () => {
    const entry = { action: 'push_practice', payload: { uid: 'a', name: 'Slow build' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.pushPractice|name=Slow build');
  });

  it('delete_practice generic', () => {
    const entry = { action: 'delete_practice', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deletePractice');
  });

  it('reorder_practices counts the practices array', () => {
    const entry = { action: 'reorder_practices', payload: { practices: [{}, {}] } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.reorderPractices|count=2');
  });

  it('unknown action falls back to action name', () => {
    const entry = { action: 'unknown_action', payload: {} };
    expect(formatPendingAction(entry, t)).toBe('unknown_action');
  });
});
