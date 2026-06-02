import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../src/services/database';
import { goalCodec } from '../src/services/backends/codecs';
import { applyRemoteDoc, reconcileSnapshot, applyChange } from '../src/services/backends/reconcile';

// Build a remote goal doc (snake_case wire shape) with overrides.
function goalDoc(overrides = {}) {
  return {
    uid: 'g1',
    name: 'Practice 50h',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    target_hours: 50,
    archived: false,
    archived_at: null,
    pinned: false,
    created_at: 1000,
    sort_order: 0,
    ...overrides,
  };
}

// Build a fake full-snapshot from an array of data objects.
function snapshot(datas, fromCache = false) {
  return {
    docs: datas.map((d) => ({ data: () => d })),
    metadata: { fromCache },
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('applyRemoteDoc', () => {
  it('adds a new row with toLocal mapping + syncedOnce', async () => {
    await applyRemoteDoc(goalCodec, goalDoc());
    const rows = await db.goals.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: 'g1',
      name: 'Practice 50h',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      targetHours: 50,
      archived: false,
      pinned: false,
      createdAt: 1000,
      sortOrder: 0,
      syncedOnce: true,
    });
  });

  it('updates a changed field on an existing row', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    await applyRemoteDoc(goalCodec, goalDoc({ name: 'Practice 80h', target_hours: 80 }));
    const row = await db.goals.where('uid').equals('g1').first();
    expect(row.name).toBe('Practice 80h');
    expect(row.targetHours).toBe(80);
  });

  it('skips when local is identical (no change)', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    const before = await db.goals.where('uid').equals('g1').first();
    await applyRemoteDoc(goalCodec, goalDoc());
    const after = await db.goals.where('uid').equals('g1').first();
    expect(await db.goals.count()).toBe(1);
    expect(after).toEqual(before);
  });

  it('ignores docs with no uid', async () => {
    await applyRemoteDoc(goalCodec, goalDoc({ uid: undefined }));
    expect(await db.goals.count()).toBe(0);
  });

  it('fires onChange when it writes (add)', async () => {
    const onChange = vi.fn();
    await applyRemoteDoc(goalCodec, goalDoc(), { onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not fire onChange when it skips', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    const onChange = vi.fn();
    await applyRemoteDoc(goalCodec, goalDoc(), { onChange });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('reconcileSnapshot', () => {
  it('bails on fromCache and does NOT delete synced locals', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    await reconcileSnapshot(goalCodec, snapshot([], true));
    expect(await db.goals.count()).toBe(1);
  });

  it('deletes a synced local absent from a non-cache snapshot', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    await reconcileSnapshot(goalCodec, snapshot([]));
    expect(await db.goals.count()).toBe(0);
  });

  it('preserves an unsynced local absent from the snapshot', async () => {
    await db.goals.add({ ...goalCodec.toLocal(goalDoc()), syncedOnce: false });
    await reconcileSnapshot(goalCodec, snapshot([]));
    expect(await db.goals.count()).toBe(1);
  });

  it('applies every doc in the snapshot', async () => {
    await reconcileSnapshot(goalCodec, snapshot([
      goalDoc({ uid: 'g1' }),
      goalDoc({ uid: 'g2', name: 'Goal 2' }),
    ]));
    expect(await db.goals.count()).toBe(2);
    expect((await db.goals.where('uid').equals('g2').first()).name).toBe('Goal 2');
  });
});

describe('applyChange', () => {
  it('added writes the row and fires onChange', async () => {
    const onChange = vi.fn();
    await applyChange(goalCodec, { type: 'added', doc: { data: () => goalDoc() } }, { onChange });
    expect(await db.goals.count()).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('modified updates the row and fires onChange', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    const onChange = vi.fn();
    await applyChange(
      goalCodec,
      { type: 'modified', doc: { data: () => goalDoc({ name: 'Renamed' }) } },
      { onChange },
    );
    expect((await db.goals.where('uid').equals('g1').first()).name).toBe('Renamed');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removed deletes the row and fires onChange', async () => {
    await db.goals.add(goalCodec.toLocal(goalDoc()));
    const onChange = vi.fn();
    await applyChange(
      goalCodec,
      { type: 'removed', doc: { data: () => ({ uid: 'g1' }) } },
      { onChange },
    );
    expect(await db.goals.count()).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removed for an absent uid does nothing and does not fire onChange', async () => {
    const onChange = vi.fn();
    await applyChange(
      goalCodec,
      { type: 'removed', doc: { data: () => ({ uid: 'missing' }) } },
      { onChange },
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
