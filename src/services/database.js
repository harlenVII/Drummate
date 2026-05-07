import Dexie from 'dexie';
import { getTodayString } from '../utils/dateHelpers';

export const db = new Dexie('DrummateDB');

db.version(2).stores({
  practiceItems: '++id, name',
  practiceLogs: '++id, itemId, date, duration',
});

db.version(3).stores({
  practiceItems: '++id, name, remoteId',
  practiceLogs: '++id, itemId, date, duration, remoteId',
  syncQueue: '++id, action, collection, localId',
});

db.version(4).stores({
  practiceItems: '++id, name',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(tx => {
  // Remove remoteId from existing records
  tx.table('practiceItems').toCollection().modify(item => {
    delete item.remoteId;
  });
  tx.table('practiceLogs').toCollection().modify(log => {
    delete log.remoteId;
    // Generate uid for existing logs that don't have one
    if (!log.uid) {
      log.uid = crypto.randomUUID();
    }
  });
});

db.version(5).stores({
  practiceItems: '++id, name, sortOrder',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  let order = 0;
  await tx.table('practiceItems').toCollection().modify(item => {
    item.sortOrder = order++;
  });
});

db.version(6).stores({
  practiceItems: '++id, name, sortOrder, archived',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    item.archived = false;
  });
});

db.version(7).stores({
  practiceItems: '++id, name, sortOrder, archived, trashed',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    item.trashed = false;
    item.trashedAt = null;
  });
});

db.version(8).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    if (!item.uid) item.uid = crypto.randomUUID();
    if (item.syncedOnce == null) item.syncedOnce = true;
  });

  const items = await tx.table('practiceItems').toArray();
  const idToUid = new Map(items.map(i => [i.id, i.uid]));
  await tx.table('practiceLogs').toCollection().modify(log => {
    if (!log.itemUid) {
      const uid = idToUid.get(log.itemId);
      if (uid) log.itemUid = uid;
    }
  });

  await tx.table('syncQueue').clear();
});

db.version(9).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    if (!item.category) item.category = 'fundamentals';
  });
});

// --- Practice Items ---

export const getItems = async () => {
  return await db.practiceItems.orderBy('sortOrder').toArray();
};

export const addItem = async (name, category) => {
  if (category !== 'fundamentals' && category !== 'songs') {
    throw new Error(`addItem: invalid category "${category}"`);
  }
  const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
  const sortOrder = maxOrder ? maxOrder.sortOrder + 1 : 0;
  const uid = crypto.randomUUID();
  return await db.practiceItems.add({
    uid, name, category, sortOrder, archived: false, trashed: false, trashedAt: null,
    syncedOnce: false,
  });
};

export const renameItem = async (id, newName) => {
  return await db.practiceItems.update(id, { name: newName });
};

export const deleteItem = async (id) => {
  await db.practiceLogs.where('itemId').equals(id).delete();
  return await db.practiceItems.delete(id);
};

export const updateItemOrder = async (orderedIds) => {
  await db.transaction('rw', db.practiceItems, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.practiceItems.update(orderedIds[i], { sortOrder: i });
    }
  });
};

export const archiveItem = async (id, archived) => {
  return await db.practiceItems.update(id, { archived });
};

export const setItemCategory = async (id, category) => {
  if (category !== 'fundamentals' && category !== 'songs') {
    throw new Error(`setItemCategory: invalid category "${category}"`);
  }
  return await db.practiceItems.update(id, { category });
};

export const trashItem = async (id) => {
  return await db.practiceItems.update(id, {
    trashed: true,
    trashedAt: new Date().toISOString(),
  });
};

export const restoreItem = async (id) => {
  return await db.practiceItems.update(id, {
    trashed: false,
    trashedAt: null,
    archived: false,
  });
};

export const purgeExpiredTrash = async (daysOld = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffISO = cutoff.toISOString();

  const expiredItems = await db.practiceItems
    .filter(item => item.trashed && item.trashedAt && item.trashedAt < cutoffISO)
    .toArray();

  await db.transaction('rw', db.practiceItems, db.practiceLogs, async () => {
    for (const item of expiredItems) {
      await db.practiceLogs.where('itemId').equals(item.id).delete();
      await db.practiceItems.delete(item.id);
    }
  });

  return expiredItems;
};

// --- Practice Logs ---

export const addLog = async (itemId, duration, date) => {
  if (!date) date = getTodayString();
  const uid = crypto.randomUUID();
  const item = await db.practiceItems.get(itemId);
  const itemUid = item?.uid || null;
  return await db.practiceLogs.add({ itemId, itemUid, date, duration, uid });
};

export const getTodaysLogs = async () => {
  const today = getTodayString();
  return await db.practiceLogs.where('date').equals(today).toArray();
};

export const getLogsByDate = async (dateString) => {
  return await db.practiceLogs.where('date').equals(dateString).toArray();
};

export const getAllLogs = async () => {
  return await db.practiceLogs.toArray();
};

export const getLogsByDateRange = async (startDate, endDate) => {
  return await db.practiceLogs
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
};

// --- UID lookups (used by sync layer) ---

export const getItemByUid = async (uid) => {
  return await db.practiceItems.where('uid').equals(uid).first();
};

export const getItemByName = async (name) => {
  return await db.practiceItems.where('name').equals(name).first();
};
