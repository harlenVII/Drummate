import { describe, it, expect } from 'vitest';
import { noteCodec, practiceCodec, goalCodec, itemCodec, logCodec } from '../src/services/backends/codecs/index.js';

describe('noteCodec', () => {
  const remote = {
    uid: 'n1', item_uid: 'i1', date: '2026-01-01', body: 'hi',
    trashed: false, trashed_at: '', created_at: '2026-01-01T00:00:00Z',
  };

  it('toLocal maps remote fields', () => {
    expect(noteCodec.toLocal(remote)).toEqual({
      uid: 'n1', itemUid: 'i1', date: '2026-01-01', body: 'hi',
      trashed: false, trashedAt: null, createdAt: '2026-01-01T00:00:00Z', syncedOnce: true,
    });
  });

  it('toLocal applies defaults', () => {
    const local = noteCodec.toLocal({ uid: 'n1', item_uid: 'i1', date: '2026-01-01' });
    expect(local.body).toBe('');
    expect(local.trashedAt).toBe(null);
    expect(local.createdAt).toBe('');
  });

  it('diff with no local -> add', () => {
    const r = noteCodec.diff(remote, undefined);
    expect(r.action).toBe('add');
    expect(r.fields.uid).toBe('n1');
  });

  it('diff with identical local -> skip', () => {
    const local = noteCodec.toLocal(remote);
    expect(noteCodec.diff(remote, local)).toEqual({ action: 'skip', fields: {} });
  });

  it('diff with one changed field -> update', () => {
    const local = { ...noteCodec.toLocal(remote), body: 'old' };
    const r = noteCodec.diff(remote, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ body: 'hi' });
  });

  it('diff trashed change pulls trashedAt too', () => {
    const local = noteCodec.toLocal(remote);
    const r = noteCodec.diff({ ...remote, trashed: true, trashed_at: '2026-02-01' }, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ trashed: true, trashedAt: '2026-02-01' });
  });

  it('toRemote maps local fields to snake_case', () => {
    const local = noteCodec.toLocal(remote);
    expect(noteCodec.toRemote(local)).toEqual({
      uid: 'n1', item_uid: 'i1', date: '2026-01-01', body: 'hi',
      trashed: false, trashed_at: '', created_at: '2026-01-01T00:00:00Z',
    });
  });
});

describe('practiceCodec', () => {
  const remote = {
    uid: 'p1', name: 'Warmup', start_bpm: 80, end_bpm: 120, bpm_increment: 5,
    bars_per_step: 2, time_signature_beats: 3, time_signature_note_value: 8,
    subdivision: 'eighth', sound_type: 'beep', linked_item_uid: 'i1',
    sort_order: 3, created_at: 'c', updated_at: 'u',
  };

  it('toLocal maps fields incl. nested timeSignature', () => {
    const local = practiceCodec.toLocal(remote);
    expect(local.timeSignature).toEqual({ beats: 3, noteValue: 8 });
    expect(local.startBpm).toBe(80);
    expect(local.linkedItemUid).toBe('i1');
    expect(local.syncedOnce).toBe(true);
  });

  it('toLocal applies defaults', () => {
    const local = practiceCodec.toLocal({ uid: 'p1' });
    expect(local).toMatchObject({
      name: '', startBpm: 60, endBpm: 60, bpmIncrement: 1, barsPerStep: 1,
      timeSignature: { beats: 4, noteValue: 4 }, subdivision: 'quarter',
      soundType: 'click', linkedItemUid: null, sortOrder: 0, createdAt: '', updatedAt: '',
    });
  });

  it('diff with no local -> add', () => {
    expect(practiceCodec.diff(remote, undefined).action).toBe('add');
  });

  it('diff with identical local -> skip', () => {
    const local = practiceCodec.toLocal(remote);
    expect(practiceCodec.diff(remote, local)).toEqual({ action: 'skip', fields: {} });
  });

  it('diff with one scalar changed -> update', () => {
    const local = { ...practiceCodec.toLocal(remote), startBpm: 70 };
    const r = practiceCodec.diff(remote, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ startBpm: 80 });
  });

  // Pins the exact remote wire shape. pushPractice and flushSyncQueue's practice
  // replay both route through toRemote, so this is the single source of truth for
  // the Firestore field mapping — any drift here breaks sync.
  it('toRemote flattens nested timeSignature to snake_case wire shape', () => {
    const local = {
      uid: 'p1', name: 'Warmup', startBpm: 80, endBpm: 120, bpmIncrement: 5,
      barsPerStep: 2, timeSignature: { beats: 3, noteValue: 8 },
      subdivision: 'eighth', soundType: 'beep', linkedItemUid: 'i1',
      sortOrder: 3, createdAt: 'c', updatedAt: 'u',
    };
    expect(practiceCodec.toRemote(local)).toEqual(remote);
  });

  it('toRemote applies linked_item_uid / sort_order defaults', () => {
    const out = practiceCodec.toRemote({ uid: 'p1', timeSignature: { beats: 4, noteValue: 4 } });
    expect(out.linked_item_uid).toBeNull();
    expect(out.sort_order).toBe(0);
    expect(out.created_at).toBe('');
    expect(out.updated_at).toBe('');
  });

  it('diff with timeSignature changed -> update nested object', () => {
    const local = { ...practiceCodec.toLocal(remote), timeSignature: { beats: 4, noteValue: 4 } };
    const r = practiceCodec.diff(remote, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ timeSignature: { beats: 3, noteValue: 8 } });
  });

  it('toRemote maps to snake_case', () => {
    const local = practiceCodec.toLocal(remote);
    expect(practiceCodec.toRemote(local)).toEqual({
      uid: 'p1', name: 'Warmup', start_bpm: 80, end_bpm: 120, bpm_increment: 5,
      bars_per_step: 2, time_signature_beats: 3, time_signature_note_value: 8,
      subdivision: 'eighth', sound_type: 'beep', linked_item_uid: 'i1',
      sort_order: 3, created_at: 'c', updated_at: 'u',
    });
  });
});

describe('goalCodec', () => {
  const remote = {
    uid: 'g1', name: 'Goal', start_date: '2026-01-01', end_date: '2026-02-01',
    target_hours: 10, archived: false, archived_at: null, pinned: true,
    created_at: 12345, sort_order: 2,
  };

  it('toLocal maps fields', () => {
    expect(goalCodec.toLocal(remote)).toEqual({
      uid: 'g1', name: 'Goal', startDate: '2026-01-01', endDate: '2026-02-01',
      targetHours: 10, archived: false, archivedAt: null, pinned: true,
      createdAt: 12345, sortOrder: 2, syncedOnce: true,
    });
  });

  it('toLocal applies defaults', () => {
    const local = goalCodec.toLocal({ uid: 'g1', start_date: 'a', end_date: 'b', target_hours: 1 });
    expect(local).toMatchObject({ name: '', archived: false, archivedAt: null, pinned: false, createdAt: 0, sortOrder: 0 });
  });

  it('diff with no local -> add', () => {
    expect(goalCodec.diff(remote, undefined).action).toBe('add');
  });

  it('diff with identical local -> skip', () => {
    const local = goalCodec.toLocal(remote);
    expect(goalCodec.diff(remote, local)).toEqual({ action: 'skip', fields: {} });
  });

  it('diff with one changed field -> update', () => {
    const local = { ...goalCodec.toLocal(remote), targetHours: 5 };
    const r = goalCodec.diff(remote, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ targetHours: 10 });
  });

  it('toRemote maps to snake_case', () => {
    const local = goalCodec.toLocal(remote);
    expect(goalCodec.toRemote(local)).toEqual({
      uid: 'g1', name: 'Goal', start_date: '2026-01-01', end_date: '2026-02-01',
      target_hours: 10, archived: false, archived_at: null, pinned: true,
      created_at: 12345, sort_order: 2,
    });
  });
});

describe('itemCodec', () => {
  const remote = {
    uid: 'i1', name: 'Rudiments', category: 'fundamentals', sort_order: 1,
    archived: false, trashed: false, trashed_at: '',
  };

  it('toLocal maps fields', () => {
    expect(itemCodec.toLocal(remote)).toEqual({
      uid: 'i1', name: 'Rudiments', category: 'fundamentals', sortOrder: 1,
      archived: false, trashed: false, trashedAt: null, syncedOnce: true,
    });
  });

  it('toLocal applies defaults', () => {
    const local = itemCodec.toLocal({ uid: 'i1', name: 'X' });
    expect(local).toMatchObject({ category: 'fundamentals', sortOrder: 0, archived: false, trashed: false, trashedAt: null });
  });

  it('diff with no local -> add', () => {
    expect(itemCodec.diff(remote, undefined).action).toBe('add');
  });

  it('diff with identical local -> skip', () => {
    const local = itemCodec.toLocal(remote);
    expect(itemCodec.diff(remote, local)).toEqual({ action: 'skip', fields: {} });
  });

  it('diff with one changed field -> update', () => {
    const local = { ...itemCodec.toLocal(remote), name: 'Old' };
    const r = itemCodec.diff(remote, local);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ name: 'Rudiments' });
  });

  it('diff trashed change pulls trashedAt too', () => {
    const local = itemCodec.toLocal(remote);
    const r = itemCodec.diff({ ...remote, trashed: true, trashed_at: '2026-02-01' }, local);
    expect(r.fields).toEqual({ trashed: true, trashedAt: '2026-02-01' });
  });

  it('toRemote maps to snake_case, includes sort_order when present', () => {
    const local = itemCodec.toLocal(remote);
    expect(itemCodec.toRemote(local)).toEqual({
      uid: 'i1', name: 'Rudiments', category: 'fundamentals',
      archived: false, trashed: false, trashed_at: '', sort_order: 1,
    });
  });

  it('toRemote omits sort_order when sortOrder is null', () => {
    const r = itemCodec.toRemote({ uid: 'i1', name: 'X', sortOrder: null });
    expect('sort_order' in r).toBe(false);
  });
});

describe('logCodec', () => {
  const localItem = { id: 42, uid: 'i1' };
  const remote = { uid: 'l1', date: '2026-01-01', duration: 600, logged_at: 1700000000000, item_uid: 'i1' };

  it('toLocal maps itemId/itemUid/loggedAt from resolved item', () => {
    expect(logCodec.toLocal(remote, localItem)).toEqual({
      itemId: 42, itemUid: 'i1', date: '2026-01-01', duration: 600,
      uid: 'l1', loggedAt: 1700000000000, syncedOnce: true,
    });
  });

  it('diff with no existing -> add', () => {
    expect(logCodec.diff(remote, undefined, localItem).action).toBe('add');
  });

  it('diff with identical existing -> skip', () => {
    const existing = logCodec.toLocal(remote, localItem);
    expect(logCodec.diff(remote, existing, localItem)).toEqual({ action: 'skip', fields: {} });
  });

  it('diff when parent changed -> update itemUid/itemId', () => {
    const existing = { ...logCodec.toLocal(remote, localItem), itemId: 99, itemUid: 'old' };
    const r = logCodec.diff(remote, existing, localItem);
    expect(r.action).toBe('update');
    expect(r.fields).toMatchObject({ itemUid: 'i1', itemId: 42 });
  });

  it('diff when loggedAt changed -> update loggedAt + date', () => {
    const existing = { ...logCodec.toLocal(remote, localItem), loggedAt: 1 };
    const r = logCodec.diff(remote, existing, localItem);
    expect(r.action).toBe('update');
    expect(r.fields).toEqual({ loggedAt: 1700000000000, date: '2026-01-01' });
  });

  it('table is practiceLogs', () => {
    expect(logCodec.table).toBe('practiceLogs');
  });
});
