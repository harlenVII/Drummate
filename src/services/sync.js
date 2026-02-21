import { pb } from './pocketbase';
import { db } from './database';

// --- Push local changes to PocketBase ---

export async function pushItem(localItem, userId) {
  try {
    // Check if this item already exists remotely by name
    const existing = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name: localItem.name }),
    });
    if (existing.totalItems > 0) return; // Already exists remotely

    await pb.collection('practice_items').create({
      name: localItem.name,
      user: userId,
    });
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('create_item', { name: localItem.name });
    } else {
      throw err;
    }
  }
}

export async function pushLog(localLog, userId) {
  try {
    const item = await db.practiceItems.get(localLog.itemId);
    if (!item) return;

    // Check if this log already exists remotely by uid
    const existing = await pb.collection('practice_logs').getList(1, 1, {
      filter: pb.filter('uid = {:uid}', { uid: localLog.uid }),
    });
    if (existing.totalItems > 0) return; // Already exists remotely

    // Find the remote item by name to get the relation
    const remoteItems = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name: item.name }),
    });
    if (remoteItems.totalItems === 0) {
      // Remote item doesn't exist yet, queue for later
      await queueSync('create_log', {
        itemName: item.name, date: localLog.date, duration: localLog.duration, uid: localLog.uid,
      });
      return;
    }

    await pb.collection('practice_logs').create({
      item: remoteItems.items[0].id,
      user: userId,
      date: localLog.date,
      duration: localLog.duration,
      uid: localLog.uid,
    });
  } catch (err) {
    if (!navigator.onLine) {
      const item = await db.practiceItems.get(localLog.itemId);
      await queueSync('create_log', {
        itemName: item?.name, date: localLog.date, duration: localLog.duration, uid: localLog.uid,
      });
    } else {
      throw err;
    }
  }
}

export async function pushDeleteItem(name, userId) {
  try {
    const remoteItems = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name }),
    });
    if (remoteItems.totalItems > 0) {
      await pb.collection('practice_items').delete(remoteItems.items[0].id);
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('delete_item', { name });
    } else {
      throw err;
    }
  }
}

export async function pushRenameItem(oldName, newName, userId) {
  try {
    const remoteItems = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name: oldName }),
    });
    if (remoteItems.totalItems > 0) {
      await pb.collection('practice_items').update(remoteItems.items[0].id, { name: newName });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('rename_item', { oldName, newName });
    } else {
      throw err;
    }
  }
}

// --- Sync queue for offline writes ---

async function queueSync(action, payload) {
  await db.syncQueue.add({ action, payload });
}

export async function flushSyncQueue(userId) {
  const pending = await db.syncQueue.toArray();
  for (const entry of pending) {
    try {
      if (entry.action === 'create_item') {
        await pushItem({ name: entry.payload.name }, userId);
      } else if (entry.action === 'create_log') {
        const localItem = await db.practiceItems
          .where('name').equals(entry.payload.itemName).first();
        if (localItem) {
          await pushLog({
            itemId: localItem.id, date: entry.payload.date,
            duration: entry.payload.duration, uid: entry.payload.uid,
          }, userId);
        }
      } else if (entry.action === 'delete_item') {
        await pushDeleteItem(entry.payload.name, userId);
      } else if (entry.action === 'rename_item') {
        await pushRenameItem(entry.payload.oldName, entry.payload.newName, userId);
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
      .where('name').equals(remote.name).first();
    if (!existing) {
      await db.practiceItems.add({ name: remote.name });
    }
  }

  const remoteLogs = await pb.collection('practice_logs').getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
  });

  for (const remote of remoteLogs) {
    if (!remote.uid) continue; // Skip legacy logs without uid
    const existing = await db.practiceLogs
      .where('uid').equals(remote.uid).first();
    if (!existing) {
      // Find local item by looking up the remote item's name
      const remoteItem = remoteItems.find(ri => ri.id === remote.item);
      if (!remoteItem) continue;
      const localItem = await db.practiceItems
        .where('name').equals(remoteItem.name).first();
      if (localItem) {
        await db.practiceLogs.add({
          itemId: localItem.id,
          date: remote.date,
          duration: remote.duration,
          uid: remote.uid,
        });
      }
    }
  }
}

// --- Push all local data (on first sign-in) ---

export async function pushAllLocal(userId) {
  const items = await db.practiceItems.toArray();
  for (const item of items) {
    await pushItem(item, userId);
  }

  const logs = await db.practiceLogs.toArray();
  for (const log of logs) {
    await pushLog(log, userId);
  }
}

// --- Real-time subscriptions ---

export function subscribeToChanges(onDataChanged) {
  // Handle create, update, and delete events via SSE for real-time sync.
  // Deduplication: items by name, logs by uid.

  pb.collection('practice_items').subscribe('*', async (e) => {
    if (e.action === 'create') {
      const existing = await db.practiceItems
        .where('name').equals(e.record.name).first();
      if (!existing) {
        await db.practiceItems.add({ name: e.record.name });
        onDataChanged();
      }
    } else if (e.action === 'update') {
      // We don't know the old name from the SSE event, so check if the new
      // name already exists locally. If not, a rename happened on another
      // device — find the local item that doesn't match any remote record.
      const alreadyExists = await db.practiceItems
        .where('name').equals(e.record.name).first();
      if (!alreadyExists) {
        // Fetch all remote items to find which local item was renamed
        const remoteItems = await pb.collection('practice_items').getFullList({
          filter: pb.filter('user = {:userId}', { userId: e.record.user }),
        });
        const remoteNames = new Set(remoteItems.map(r => r.name));
        const localItems = await db.practiceItems.toArray();
        // The renamed item is the local one whose name no longer exists remotely
        const staleItem = localItems.find(li => !remoteNames.has(li.name));
        if (staleItem) {
          await db.practiceItems.update(staleItem.id, { name: e.record.name });
        }
      }
      onDataChanged();
    } else if (e.action === 'delete') {
      const existing = await db.practiceItems
        .where('name').equals(e.record.name).first();
      if (existing) {
        await db.practiceLogs.where('itemId').equals(existing.id).delete();
        await db.practiceItems.delete(existing.id);
        onDataChanged();
      }
    }
  });

  pb.collection('practice_logs').subscribe('*', async (e) => {
    if (e.action === 'create' && e.record.uid) {
      const existing = await db.practiceLogs
        .where('uid').equals(e.record.uid).first();
      if (!existing) {
        // Find local item — we need to look up the remote item to get its name
        const remoteItem = await pb.collection('practice_items').getOne(e.record.item);
        const localItem = await db.practiceItems
          .where('name').equals(remoteItem.name).first();
        if (localItem) {
          await db.practiceLogs.add({
            itemId: localItem.id,
            date: e.record.date,
            duration: e.record.duration,
            uid: e.record.uid,
          });
          onDataChanged();
        }
      }
    } else if (e.action === 'delete' && e.record.uid) {
      const existing = await db.practiceLogs
        .where('uid').equals(e.record.uid).first();
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
