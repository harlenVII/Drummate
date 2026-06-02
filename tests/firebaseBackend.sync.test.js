import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { setFirestoreImpl } from '../src/services/backends/firestoreAccess';
import { createFakeFirestore } from './helpers/fakeFirestore';
import { db } from '../src/services/database';
import firebaseBackend from '../src/services/backends/firebaseBackend';

// subscribeToChanges reads getFirebaseApp().auth.currentUser?.uid to resolve the
// userId for its 5 listeners. Stub the firebase module so it returns UID.
vi.mock('../src/services/firebase', () => ({
  getFirebaseApp: () => ({ app: {}, auth: { currentUser: { uid: 'user1' } }, db: {} }),
}));

const UID = 'user1';
const itemsPath = `users/${UID}/practice_items`;
const logsPath = `users/${UID}/practice_logs`;
const notesPath = `users/${UID}/notes`;
const practicesPath = `users/${UID}/metronomePractices`;
const goalsPath = `users/${UID}/goals`;

const flush = () => new Promise((r) => setTimeout(r, 0));

let fs;
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  fs = createFakeFirestore();
  setFirestoreImpl(fs);
});
afterEach(async () => {
  // The fake's onSnapshot unsubscribe is a no-op, so a subscribe test's async
  // listener callbacks can still be in-flight. Let them settle before the next
  // beforeEach clears tables, otherwise a stray write lands in a cleared DB.
  await flush();
  setFirestoreImpl(); // reset to real SDK
});

describe('pullAll', () => {
  it('adds a new remote item locally', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('uid').equals('a').first();
    expect(local.name).toBe('Rudiments');
    expect(local.syncedOnce).toBe(true);
  });

  it('bails without deleting when snapshot is fromCache', async () => {
    await db.practiceItems.add({ uid: 'a', name: 'Local', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs = createFakeFirestore({ fromCache: true });
    setFirestoreImpl(fs);
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('a').first()).toBeTruthy();
  });

  it('deletes a locally-synced item missing from cloud (and cascades logs)', async () => {
    const id = await db.practiceItems.add({ uid: 'gone', name: 'Old', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId: id, itemUid: 'gone', date: '2026-01-01', duration: 60, uid: 'l1', loggedAt: 1, syncedOnce: true });
    await firebaseBackend.pullAll(UID); // no remote items
    expect(await db.practiceItems.where('uid').equals('gone').first()).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
  });

  it('preserves a local-only (unsynced) item when cloud is empty', async () => {
    await db.practiceItems.add({ uid: 'new', name: 'Draft', category: 'fundamentals', sortOrder: 0, syncedOnce: false });
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('new').first()).toBeTruthy();
  });

  it('adds a remote log resolving its parent by item_uid', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'Rudiments', date: '2026-05-01', duration: 120, logged_at: 1700000000000 });
    await firebaseBackend.pullAll(UID);
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(120);
    expect(log.loggedAt).toBe(1700000000000);
  });

  it('migrates a legacy remote item with no uid', async () => {
    fs.__seed(itemsPath, 'Legacy%20Name', { name: 'Legacy Name', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('name').equals('Legacy Name').first();
    expect(local).toBeTruthy();
    expect(local.uid).toBeTruthy();
  });
});

describe('pullAllNotes', () => {
  it('adds a new remote note locally', async () => {
    fs.__seed(notesPath, 'n1', {
      uid: 'n1', item_uid: 'a', date: '2026-05-01', body: 'hello',
      trashed: false, trashed_at: '', created_at: '2026-05-01',
    });
    await firebaseBackend.pullAllNotes(UID);
    const local = await db.notes.where('uid').equals('n1').first();
    expect(local.body).toBe('hello');
    expect(local.itemUid).toBe('a');
    expect(local.syncedOnce).toBe(true);
  });

  it('updates a changed body on an existing local note', async () => {
    await db.notes.add({ uid: 'n1', itemUid: 'a', date: '2026-05-01', body: 'old', trashed: false, trashedAt: null, createdAt: '', syncedOnce: true });
    fs.__seed(notesPath, 'n1', {
      uid: 'n1', item_uid: 'a', date: '2026-05-01', body: 'new', trashed: false, trashed_at: '',
    });
    await firebaseBackend.pullAllNotes(UID);
    const local = await db.notes.where('uid').equals('n1').first();
    expect(local.body).toBe('new');
  });

  it('bails without deleting when snapshot is fromCache', async () => {
    await db.notes.add({ uid: 'n1', itemUid: 'a', date: '2026-05-01', body: 'keep', trashed: false, trashedAt: null, createdAt: '', syncedOnce: true });
    fs = createFakeFirestore({ fromCache: true });
    setFirestoreImpl(fs);
    await firebaseBackend.pullAllNotes(UID);
    expect(await db.notes.where('uid').equals('n1').first()).toBeTruthy();
  });

  it('delete-reconciles a synced note missing from cloud', async () => {
    await db.notes.add({ uid: 'gone', itemUid: 'a', date: '2026-05-01', body: 'x', trashed: false, trashedAt: null, createdAt: '', syncedOnce: true });
    await firebaseBackend.pullAllNotes(UID); // empty remote
    expect(await db.notes.where('uid').equals('gone').first()).toBeUndefined();
  });
});

describe('pullAllPractices', () => {
  it('adds a new remote practice and maps nested timeSignature', async () => {
    fs.__seed(practicesPath, 'p1', {
      uid: 'p1', name: 'Warmup', start_bpm: 80, end_bpm: 120, bpm_increment: 2,
      bars_per_step: 4, time_signature_beats: 3, time_signature_note_value: 8,
      subdivision: 'eighth', sound_type: 'beep', linked_item_uid: null, sort_order: 0,
    });
    await firebaseBackend.pullAllPractices(UID);
    const local = await db.metronomePractices.where('uid').equals('p1').first();
    expect(local.name).toBe('Warmup');
    expect(local.startBpm).toBe(80);
    expect(local.timeSignature).toEqual({ beats: 3, noteValue: 8 });
    expect(local.syncedOnce).toBe(true);
  });

  it('updates one scalar field on an existing local practice', async () => {
    await db.metronomePractices.add({
      uid: 'p1', name: 'Warmup', startBpm: 80, endBpm: 120, bpmIncrement: 2, barsPerStep: 4,
      timeSignature: { beats: 4, noteValue: 4 }, subdivision: 'quarter', soundType: 'click',
      linkedItemUid: null, sortOrder: 0, createdAt: '', updatedAt: '', syncedOnce: true,
    });
    fs.__seed(practicesPath, 'p1', {
      uid: 'p1', name: 'Warmup', start_bpm: 100, end_bpm: 120, bpm_increment: 2,
      bars_per_step: 4, time_signature_beats: 4, time_signature_note_value: 4,
      subdivision: 'quarter', sound_type: 'click', linked_item_uid: null, sort_order: 0,
    });
    await firebaseBackend.pullAllPractices(UID);
    const local = await db.metronomePractices.where('uid').equals('p1').first();
    expect(local.startBpm).toBe(100);
  });

  it('delete-reconciles a synced practice missing from cloud', async () => {
    await db.metronomePractices.add({
      uid: 'gone', name: 'Old', startBpm: 60, endBpm: 60, bpmIncrement: 1, barsPerStep: 1,
      timeSignature: { beats: 4, noteValue: 4 }, subdivision: 'quarter', soundType: 'click',
      linkedItemUid: null, sortOrder: 0, createdAt: '', updatedAt: '', syncedOnce: true,
    });
    await firebaseBackend.pullAllPractices(UID);
    expect(await db.metronomePractices.where('uid').equals('gone').first()).toBeUndefined();
  });
});

describe('pullAllGoals', () => {
  it('adds a new remote goal locally', async () => {
    fs.__seed(goalsPath, 'g1', {
      uid: 'g1', name: 'G', start_date: '2026-01-01', end_date: '2026-12-31',
      target_hours: 100, archived: false, archived_at: null, pinned: false,
      created_at: 0, sort_order: 0,
    });
    await firebaseBackend.pullAllGoals(UID);
    const local = await db.goals.where('uid').equals('g1').first();
    expect(local.startDate).toBe('2026-01-01');
    expect(local.targetHours).toBe(100);
    expect(local.syncedOnce).toBe(true);
  });

  it('updates archived true on an existing local goal', async () => {
    await db.goals.add({
      uid: 'g1', name: 'G', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 100,
      archived: false, archivedAt: null, pinned: false, createdAt: 0, sortOrder: 0, syncedOnce: true,
    });
    fs.__seed(goalsPath, 'g1', {
      uid: 'g1', name: 'G', start_date: '2026-01-01', end_date: '2026-12-31',
      target_hours: 100, archived: true, archived_at: null, pinned: false, created_at: 0, sort_order: 0,
    });
    await firebaseBackend.pullAllGoals(UID);
    const local = await db.goals.where('uid').equals('g1').first();
    expect(local.archived).toBe(true);
  });

  it('delete-reconciles a synced goal missing from cloud', async () => {
    await db.goals.add({
      uid: 'gone', name: 'Old', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 10,
      archived: false, archivedAt: null, pinned: false, createdAt: 0, sortOrder: 0, syncedOnce: true,
    });
    await firebaseBackend.pullAllGoals(UID);
    expect(await db.goals.where('uid').equals('gone').first()).toBeUndefined();
  });
});

describe('subscribeToChanges', () => {
  it('reconciles a seeded item on initial snapshot and applies a modified change', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Original', category: 'fundamentals', sort_order: 0 });
    const onChange = vi.fn();
    const unsub = firebaseBackend.subscribeToChanges(onChange);
    await flush();
    expect((await db.practiceItems.where('uid').equals('a').first()).name).toBe('Original');

    fs.__emit(itemsPath, [{ type: 'modified', id: 'a', data: { uid: 'a', name: 'Renamed', sort_order: 0 } }]);
    await flush();
    expect((await db.practiceItems.where('uid').equals('a').first()).name).toBe('Renamed');
    expect(onChange).toHaveBeenCalled();
    unsub();
  });

  it('remaps a log itemUid when a modified change moves it to another parent', async () => {
    // Two items in both Dexie and cloud.
    const idA = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    const idB = await db.practiceItems.add({ uid: 'b', name: 'B', category: 'fundamentals', sortOrder: 1, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    fs.__seed(itemsPath, 'b', { uid: 'b', name: 'B', category: 'fundamentals', sort_order: 1 });
    // A log under parent 'a' in both Dexie and cloud.
    await db.practiceLogs.add({ itemId: idA, itemUid: 'a', date: '2026-05-01', duration: 60, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 60, logged_at: 1700000000000 });

    const onChange = vi.fn();
    const unsub = firebaseBackend.subscribeToChanges(onChange);
    await flush();

    fs.__emit(logsPath, [{ type: 'modified', id: 'l1', data: { uid: 'l1', item_uid: 'b', item_name: 'B', date: '2026-05-01', duration: 60, logged_at: 1700000000000 } }]);
    await flush();
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.itemUid).toBe('b');
    expect(log.itemId).toBe(idB);
    unsub();
  });
});

describe('flushSyncQueue', () => {
  it('replays an enriched push_goal to cloud and local, then drains the queue', async () => {
    await db.goals.add({
      uid: 'g1', name: 'G', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 100,
      archived: false, archivedAt: null, pinned: false, createdAt: 0, sortOrder: 0, syncedOnce: false,
    });
    await db.syncQueue.add({
      action: 'push_goal',
      payload: { uid: 'g1', name: 'G', startDate: '2026-01-01', endDate: '2026-12-31', targetHours: 100, archived: false, archivedAt: null, pinned: false, createdAt: 0, sortOrder: 0 },
    });
    await firebaseBackend.flushSyncQueue(UID);

    const remote = fs.__get(goalsPath, 'g1');
    expect(remote).toBeTruthy();
    expect(remote.start_date).toBe('2026-01-01');
    expect((await db.goals.where('uid').equals('g1').first()).syncedOnce).toBe(true);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('falls back to local read for a legacy/minimal push_note payload', async () => {
    await db.notes.add({ uid: 'n1', itemUid: 'a', date: '2026-05-01', body: 'hi', trashed: false, trashedAt: null, createdAt: '', syncedOnce: false });
    await db.syncQueue.add({ action: 'push_note', payload: { uid: 'n1' } });
    await firebaseBackend.flushSyncQueue(UID);

    const remote = fs.__get(notesPath, 'n1');
    expect(remote).toBeTruthy();
    expect(remote.body).toBe('hi');
    expect(await db.syncQueue.count()).toBe(0);
  });
});
