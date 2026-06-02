import { db } from '../database';

// Apply a single remote doc to local Dexie via the codec's diff rule.
// `onChange` is an optional callback fired after a write (used by live listeners).
export async function applyRemoteDoc(codec, data, { onChange } = {}) {
  if (!data.uid) return;
  const local = await db[codec.table].where('uid').equals(data.uid).first();
  const { action, fields } = codec.diff(data, local);
  if (action === 'add') {
    await db[codec.table].add(fields);
    onChange?.();
  } else if (action === 'update') {
    await db[codec.table].update(local.id, fields);
    onChange?.();
  }
}

// Full-snapshot pull: apply every doc, then delete locally-synced rows that
// vanished remotely (cross-device delete reconciliation). Mirrors pullAll*.
export async function reconcileSnapshot(codec, snap) {
  if (snap.metadata.fromCache) return; // offline-cache guard — never delete
  const remoteUids = new Set();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data.uid) continue;
    remoteUids.add(data.uid);
    await applyRemoteDoc(codec, data);
  }
  const allLocal = await db[codec.table].toArray();
  for (const local of allLocal) {
    if (local.syncedOnce && !remoteUids.has(local.uid)) {
      await db[codec.table].delete(local.id);
    }
  }
}

// Live-listener change handler for a single docChange. Mirrors the
// added/modified/removed branches of the subscribe listeners.
export async function applyChange(codec, change, { onChange } = {}) {
  const data = change.doc.data();
  if (!data.uid) return;
  if (change.type === 'added' || change.type === 'modified') {
    await applyRemoteDoc(codec, data, { onChange });
  } else if (change.type === 'removed') {
    const existing = await db[codec.table].where('uid').equals(data.uid).first();
    if (existing) { await db[codec.table].delete(existing.id); onChange?.(); }
  }
}
