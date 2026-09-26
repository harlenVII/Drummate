import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { setFirestoreImpl } from '../src/services/backends/firestoreAccess';
import { createFakeFirestore } from './helpers/fakeFirestore';
import { db } from '../src/services/database';
import firebaseBackend from '../src/services/backends/firebaseBackend';
import { setOfflineMode } from '../src/services/offlineService';

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

let fs;
// Tracks an active subscription so afterEach can deterministically tear it down
// and drain any in-flight listener writes before the next beforeEach clears tables.
let activeUnsub = null;
const subscribe = (onChange) => {
  activeUnsub = firebaseBackend.subscribeToChanges(onChange);
  return activeUnsub;
};
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  fs = createFakeFirestore();
  setFirestoreImpl(fs);
});
afterEach(async () => {
  // Tear down any active subscription (real unsubscribe), then drain every
  // listener callback (initial snapshots + __emit) so no stray async Dexie
  // write lands after the next beforeEach clears tables.
  if (activeUnsub) {
    activeUnsub();
    activeUnsub = null;
  }
  if (fs && fs.__settle) await fs.__settle();
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

  it('logs-fromCache bail: item absent from cloud survives when logsSnap is fromCache', async () => {
    // Items snapshot is NOT fromCache (real server data — empty, i.e. remote deleted item 'a').
    // Logs snapshot IS fromCache (offline cache — bail before deletion-reconciliation).
    //
    // The logs-fromCache guard at line 679 of pullAll returns BEFORE the item-deletion
    // reconciliation loop. So even though item 'a' is absent from the real items snapshot,
    // the bail prevents the deletion loop from running, and the item survives locally.
    //
    // The guard also exits before pullAll's log-deletion loop (see 'does not delete
    // synced logs when the logs snapshot is fromCache'). The observable effect checked
    // here: a synced item that IS absent from the remote items snapshot is NOT
    // deletion-reconciled, because the guard exits before that loop.
    fs = createFakeFirestore({
      // items path is NOT fromCache (fromCache = false by default)
      fromCacheByPath: { [logsPath]: true },
    });
    setFirestoreImpl(fs);
    // Seed a synced local item that is absent from the remote items snapshot.
    // Normally pullAll would delete it (syncedOnce + not in remoteUids). But because
    // the logs snapshot is fromCache, pullAll bails before the deletion loop.
    await db.practiceItems.add({ uid: 'a', name: 'ShouldSurvive', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    // Remote items snapshot is empty — 'a' is "deleted" on the server.
    // Remote logs snapshot is fromCache (empty cache), so pullAll bails early.
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('a').first()).toBeTruthy();
  });

  it('remap-before-delete: log moved to surviving parent b is remapped before item a is deleted', async () => {
    // Invariant: pullAll processes the remote logs loop (including item_uid remapping)
    // BEFORE the item-deletion reconciliation loop. This ensures a log whose item_uid
    // moved to a surviving parent on another device is adopted locally with the new
    // parent BEFORE its old parent is cascade-deleted.
    //
    // Setup:
    //   - Remote items: only 'b' present (item 'a' was deleted on another device)
    //   - Remote logs: log 'l1' carries item_uid: 'b' (merged to b before a was deleted)
    //   - Local: synced items 'a' and 'b'; synced log 'l1' still under parent 'a'
    //
    // Expected outcome after pullAll:
    //   - Item 'a' is deletion-reconciled (absent from remote items snapshot)
    //   - Log 'l1' survives with itemUid === 'b' and itemId === idB
    //     (remapped during the logs loop before a's cascade runs)
    const idA = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    const idB = await db.practiceItems.add({ uid: 'b', name: 'B', category: 'fundamentals', sortOrder: 1, syncedOnce: true });
    // Local log l1 is currently under parent 'a'.
    await db.practiceLogs.add({ uid: 'l1', itemId: idA, itemUid: 'a', date: '2026-01-01', duration: 60, loggedAt: 1000, syncedOnce: true });

    // Remote: only item 'b' exists; log 'l1' has already been moved to 'b'.
    fs.__seed(itemsPath, 'b', { uid: 'b', name: 'B', category: 'fundamentals', sort_order: 1 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'b', item_name: 'B', date: '2026-01-01', duration: 60, logged_at: 1000 });

    await firebaseBackend.pullAll(UID);

    // Item 'a' must be gone (deleted on remote, syncedOnce=true).
    expect(await db.practiceItems.where('uid').equals('a').first()).toBeUndefined();

    // Log 'l1' must survive and point to parent 'b'.
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log).toBeTruthy();
    expect(log.itemUid).toBe('b');
    expect(log.itemId).toBe(idB);
  });

  it('adopts a remote duration change on an existing log', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'Rudiments', date: '2026-05-01', duration: 420, logged_at: 1700000060000 });

    await firebaseBackend.pullAll(UID);

    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(420);
    expect(log.loggedAt).toBe(1700000060000);
  });

  it('deletes a synced log missing from the cloud but keeps unsynced and unresolved ones', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    // Deleted on another device: synced locally, gone from the cloud.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'gone', loggedAt: 1, syncedOnce: true });
    // Created here and not pushed yet.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'local', loggedAt: 2, syncedOnce: false });
    // Still in the cloud, but its remote parent ('x') doesn't resolve locally.
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'orphan', loggedAt: 3, syncedOnce: true });
    fs.__seed(logsPath, 'orphan', { uid: 'orphan', item_uid: 'x', item_name: 'Nope', date: '2026-05-01', duration: 300, logged_at: 3 });

    await firebaseBackend.pullAll(UID);

    expect(await db.practiceLogs.where('uid').equals('gone').first()).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('local').first()).toBeTruthy();
    expect(await db.practiceLogs.where('uid').equals('orphan').first()).toBeTruthy();
  });

  it('does not delete synced logs when the logs snapshot is fromCache', async () => {
    fs = createFakeFirestore({ fromCacheByPath: { [logsPath]: true } });
    setFirestoreImpl(fs);
    const id = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1, syncedOnce: true });

    await firebaseBackend.pullAll(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeTruthy();
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
    const unsub = subscribe(onChange);
    await fs.__settle();
    expect((await db.practiceItems.where('uid').equals('a').first()).name).toBe('Original');

    fs.__emit(itemsPath, [{ type: 'modified', id: 'a', data: { uid: 'a', name: 'Renamed', sort_order: 0 } }]);
    await fs.__settle();
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
    const unsub = subscribe(onChange);
    await fs.__settle();

    fs.__emit(logsPath, [{ type: 'modified', id: 'l1', data: { uid: 'l1', item_uid: 'b', item_name: 'B', date: '2026-05-01', duration: 60, logged_at: 1700000000000 } }]);
    await fs.__settle();
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.itemUid).toBe('b');
    expect(log.itemId).toBe(idB);
    unsub();
  });

  it('adopts a duration change on a modified log', async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1700000000000 });
    const unsub = subscribe(vi.fn());
    await fs.__settle();

    fs.__emit(logsPath, [{ type: 'modified', id: 'l1', data: { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 420, logged_at: 1700000000000 } }]);
    await fs.__settle();

    expect((await db.practiceLogs.where('uid').equals('l1').first()).duration).toBe(420);
    unsub();
  });

  it("reconciles an existing log's changed duration and time from the listener's initial snapshot", async () => {
    const id = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    await db.practiceLogs.add({ itemId: id, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1700000000000, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 420, logged_at: 1700000060000 });

    const unsub = subscribe(vi.fn());
    await fs.__settle();

    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(420);
    expect(log.loggedAt).toBe(1700000060000);
    unsub();
  });

  it("only patches syncedOnce on an existing log whose remote parent can't be resolved locally", async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1000, syncedOnce: false });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'x', item_name: 'Nope', date: '2026-05-01', duration: 999, logged_at: 5000 });

    const unsub = subscribe(vi.fn());
    await fs.__settle();

    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.syncedOnce).toBe(true);
    expect(log.duration).toBe(300);
    expect(log.loggedAt).toBe(1000);
    unsub();
  });

  it('goals listener: add → modified (archived) → removed via reconciler', async () => {
    const onChange = vi.fn();
    const unsub = subscribe(onChange);
    await fs.__settle();

    // added
    fs.__emit(goalsPath, [{ type: 'added', id: 'g1', data: { uid: 'g1', name: 'G', start_date: '2026-01-01', end_date: '2026-12-31', target_hours: 50, archived: false, archived_at: null, pinned: false, created_at: 0, sort_order: 0 } }]);
    await fs.__settle();
    let local = await db.goals.where('uid').equals('g1').first();
    expect(local).toBeTruthy();
    expect(local.startDate).toBe('2026-01-01');
    expect(local.targetHours).toBe(50);
    expect(onChange).toHaveBeenCalled();

    // modified — flip archived
    onChange.mockClear();
    fs.__emit(goalsPath, [{ type: 'modified', id: 'g1', data: { uid: 'g1', name: 'G', start_date: '2026-01-01', end_date: '2026-12-31', target_hours: 50, archived: true, archived_at: null, pinned: false, created_at: 0, sort_order: 0 } }]);
    await fs.__settle();
    local = await db.goals.where('uid').equals('g1').first();
    expect(local.archived).toBe(true);
    expect(onChange).toHaveBeenCalled();

    // removed
    onChange.mockClear();
    fs.__emit(goalsPath, [{ type: 'removed', id: 'g1', data: { uid: 'g1' } }]);
    await fs.__settle();
    expect(await db.goals.where('uid').equals('g1').first()).toBeUndefined();
    expect(onChange).toHaveBeenCalled();

    unsub();
  });

  it('notes listener: add → modified (body) → removed via reconciler', async () => {
    const onChange = vi.fn();
    const unsub = subscribe(onChange);
    await fs.__settle();

    // added
    fs.__emit(notesPath, [{ type: 'added', id: 'n1', data: { uid: 'n1', item_uid: 'itm1', date: '2026-05-01', body: 'first body', trashed: false, trashed_at: null, created_at: '2026-05-01' } }]);
    await fs.__settle();
    let local = await db.notes.where('uid').equals('n1').first();
    expect(local).toBeTruthy();
    expect(local.body).toBe('first body');
    expect(local.itemUid).toBe('itm1');
    expect(onChange).toHaveBeenCalled();

    // modified — body change
    onChange.mockClear();
    fs.__emit(notesPath, [{ type: 'modified', id: 'n1', data: { uid: 'n1', item_uid: 'itm1', date: '2026-05-01', body: 'updated body', trashed: false, trashed_at: null, created_at: '2026-05-01' } }]);
    await fs.__settle();
    local = await db.notes.where('uid').equals('n1').first();
    expect(local.body).toBe('updated body');
    expect(onChange).toHaveBeenCalled();

    // removed
    onChange.mockClear();
    fs.__emit(notesPath, [{ type: 'removed', id: 'n1', data: { uid: 'n1' } }]);
    await fs.__settle();
    expect(await db.notes.where('uid').equals('n1').first()).toBeUndefined();
    expect(onChange).toHaveBeenCalled();

    unsub();
  });
});

describe('pushLog', () => {
  it("queues create_log with the row's loggedAt when offline", async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    setOfflineMode(true);
    try {
      await firebaseBackend.pushLog({ itemId, itemUid: 'a', uid: 'l1', date: '2026-05-01', duration: 420, loggedAt: 1000 }, UID);
    } finally {
      setOfflineMode(false);
    }
    const [entry] = await db.syncQueue.toArray();
    expect(entry.action).toBe('create_log');
    expect(entry.payload).toEqual({ itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1000, uid: 'l1' });
  });
});

describe('deleteLogRemote', () => {
  it('deletes the cloud doc when online', async () => {
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1 });
    await firebaseBackend.deleteLogRemote({ uid: 'l1', itemId: 1, duration: 300, date: '2026-05-01' }, UID);
    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
  });

  it('queues delete_log with a labelled payload when offline', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'Rudiments', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    setOfflineMode(true);
    try {
      await firebaseBackend.deleteLogRemote({ uid: 'l1', itemId, duration: 300, date: '2026-05-01' }, UID);
    } finally {
      setOfflineMode(false);
    }
    const [entry] = await db.syncQueue.toArray();
    expect(entry.action).toBe('delete_log');
    expect(entry.payload).toEqual({ uid: 'l1', itemName: 'Rudiments', duration: 300, date: '2026-05-01' });
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

  it('replays delete_log: removes the cloud doc and the row pullAll re-added', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1 });
    // pullAll re-added the row from the cloud before the flush ran.
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1, syncedOnce: true });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 300, date: '2026-05-01' } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('create_log replay restores an offline edit that pullAll reverted (offline merge regression)', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    // The cloud still has the pre-merge values.
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-02', duration: 300, logged_at: 2000 });
    // Offline, the log was moved to the previous day and lengthened; the change was queued.
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 420, uid: 'l1', loggedAt: 1000, syncedOnce: true });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1000 } });

    // Reconnect runs pullAll first (reverting local to the cloud copy), then flushes.
    await firebaseBackend.pullAll(UID);
    expect((await db.practiceLogs.where('uid').equals('l1').first()).loggedAt).toBe(2000);
    await firebaseBackend.flushSyncQueue(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toMatchObject({ loggedAt: 1000, duration: 420, date: '2026-05-01' });
    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1000, duration: 420, date: '2026-05-01' });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('falls back to reading local for a legacy create_log payload without loggedAt', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 300, uid: 'l1', loggedAt: 1000, syncedOnce: false });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 300 } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1000, duration: 300 });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('a create then a delete queued offline for a log never in the cloud leaves nothing behind', async () => {
    // Created and deleted offline: the row is gone locally and never reached the cloud.
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 300, loggedAt: 1000 } });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 300, date: '2026-05-01' } });

    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('two queued edits to one log replay in order, and the second wins', async () => {
    const itemId = await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1000 });
    await db.practiceLogs.add({ itemId, itemUid: 'a', date: '2026-05-01', duration: 600, uid: 'l1', loggedAt: 1300, syncedOnce: true });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1100 } });
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 600, loggedAt: 1300 } });

    await firebaseBackend.pullAll(UID);
    await firebaseBackend.flushSyncQueue(UID);

    expect(await db.practiceLogs.where('uid').equals('l1').first()).toMatchObject({ loggedAt: 1300, duration: 600 });
    expect(fs.__get(logsPath, 'l1')).toMatchObject({ logged_at: 1300, duration: 600 });
  });

  it('an edit then a delete queued offline ends deleted', async () => {
    await db.practiceItems.add({ uid: 'a', name: 'A', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'A', category: 'fundamentals', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'A', date: '2026-05-01', duration: 300, logged_at: 1000 });
    // Offline: lengthened (queued), then deleted (row removed locally, queued).
    await db.syncQueue.add({ action: 'create_log', payload: { uid: 'l1', itemUid: 'a', itemName: 'A', date: '2026-05-01', duration: 420, loggedAt: 1100 } });
    await db.syncQueue.add({ action: 'delete_log', payload: { uid: 'l1', itemName: 'A', duration: 420, date: '2026-05-01' } });

    await firebaseBackend.pullAll(UID); // re-adds l1 from the cloud
    await firebaseBackend.flushSyncQueue(UID);

    expect(fs.__get(logsPath, 'l1')).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });
});
