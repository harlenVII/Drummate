import { pb } from './pocketbase';
import { db } from './database';

// --- Push local changes to PocketBase ---

export async function pushItem(localItem, userId) {
  try {
    if (localItem.remoteId) {
      await pb.collection('practice_items').update(localItem.remoteId, {
        name: localItem.name,
      });
    } else {
      const record = await pb.collection('practice_items').create({
        name: localItem.name,
        user: userId,
      });
      await db.practiceItems.update(localItem.id, { remoteId: record.id });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('create_item', 'practice_items', localItem.id, {
        name: localItem.name,
      });
    } else {
      throw err;
    }
  }
}

export async function pushLog(localLog, userId) {
  try {
    const item = await db.practiceItems.get(localLog.itemId);
    const remoteItemId = item?.remoteId;
    if (!remoteItemId) {
      await queueSync('create_log', 'practice_logs', localLog.id, {
        itemId: localLog.itemId, date: localLog.date, duration: localLog.duration,
      });
      return;
    }

    const record = await pb.collection('practice_logs').create({
      item: remoteItemId,
      user: userId,
      date: localLog.date,
      duration: localLog.duration,
    });
    await db.practiceLogs.update(localLog.id, { remoteId: record.id });
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('create_log', 'practice_logs', localLog.id, {
        itemId: localLog.itemId, date: localLog.date, duration: localLog.duration,
      });
    } else {
      throw err;
    }
  }
}

export async function pushDeleteItem(remoteId) {
  try {
    if (remoteId) {
      await pb.collection('practice_items').delete(remoteId);
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('delete_item', 'practice_items', null, { remoteId });
    } else {
      throw err;
    }
  }
}

export async function pushRenameItem(remoteId, newName) {
  try {
    if (remoteId) {
      await pb.collection('practice_items').update(remoteId, { name: newName });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('rename_item', 'practice_items', null, { remoteId, newName });
    } else {
      throw err;
    }
  }
}

// --- Sync queue for offline writes ---

async function queueSync(action, collection, localId, payload) {
  await db.syncQueue.add({ action, collection, localId, payload });
}

export async function flushSyncQueue(userId) {
  const pending = await db.syncQueue.toArray();
  for (const entry of pending) {
    try {
      if (entry.action === 'create_item') {
        const localItem = await db.practiceItems.get(entry.localId);
        if (localItem) await pushItem(localItem, userId);
      } else if (entry.action === 'create_log') {
        const localLog = await db.practiceLogs.get(entry.localId);
        if (localLog) await pushLog(localLog, userId);
      } else if (entry.action === 'delete_item') {
        if (entry.payload.remoteId) {
          await pb.collection('practice_items').delete(entry.payload.remoteId);
        }
      } else if (entry.action === 'rename_item') {
        if (entry.payload.remoteId) {
          await pb.collection('practice_items').update(entry.payload.remoteId, {
            name: entry.payload.newName,
          });
        }
      }
      await db.syncQueue.delete(entry.id);
    } catch (err) {
      console.error('Sync queue flush failed for entry:', entry, err);
      break;
    }
  }
}

// --- Pull remote data into Dexie (initial sync) ---

export async function pullAll(userId) {
  const remoteItems = await pb.collection('practice_items').getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
    sort: 'created',
  });

  for (const remote of remoteItems) {
    const existing = await db.practiceItems
      .where('remoteId').equals(remote.id).first();
    if (existing) {
      await db.practiceItems.update(existing.id, { name: remote.name });
    } else {
      await db.practiceItems.add({
        name: remote.name,
        remoteId: remote.id,
      });
    }
  }

  const remoteLogs = await pb.collection('practice_logs').getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
  });

  for (const remote of remoteLogs) {
    const existing = await db.practiceLogs
      .where('remoteId').equals(remote.id).first();
    if (!existing) {
      const localItem = await db.practiceItems
        .where('remoteId').equals(remote.item).first();
      if (localItem) {
        await db.practiceLogs.add({
          itemId: localItem.id,
          date: remote.date,
          duration: remote.duration,
          remoteId: remote.id,
        });
      }
    }
  }
}

// --- Push all unsynced local data (migration on first sign-in) ---

export async function pushAllUnsynced(userId) {
  const unsyncedItems = await db.practiceItems
    .filter(item => !item.remoteId).toArray();
  for (const item of unsyncedItems) {
    await pushItem(item, userId);
  }

  const unsyncedLogs = await db.practiceLogs
    .filter(log => !log.remoteId).toArray();
  for (const log of unsyncedLogs) {
    await pushLog(log, userId);
  }
}

// --- Real-time subscriptions ---

export function subscribeToChanges(userId, onDataChanged) {
  // Only handle update and delete events via SSE.
  // Create events from this client are handled by pushItem/pushLog directly.
  // Create events from other devices are handled by pullAll on app load.
  // This avoids race conditions where the SSE 'create' event arrives before
  // the local push function has finished setting remoteId, causing duplicates.

  pb.collection('practice_items').subscribe('*', async (e) => {
    if (e.action === 'update') {
      const existing = await db.practiceItems
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceItems.update(existing.id, { name: e.record.name });
        onDataChanged();
      }
    } else if (e.action === 'delete') {
      const existing = await db.practiceItems
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceLogs.where('itemId').equals(existing.id).delete();
        await db.practiceItems.delete(existing.id);
        onDataChanged();
      }
    }
  });

  pb.collection('practice_logs').subscribe('*', async (e) => {
    if (e.action === 'delete') {
      const existing = await db.practiceLogs
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceLogs.delete(existing.id);
        onDataChanged();
      }
    }
  });

  return () => {
    pb.collection('practice_items').unsubscribe();
    pb.collection('practice_logs').unsubscribe();
  };
}
