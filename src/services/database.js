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

// --- Practice Items ---

export const getItems = async () => {
  return await db.practiceItems.orderBy('sortOrder').toArray();
};

export const addItem = async (name) => {
  const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
  const sortOrder = maxOrder ? maxOrder.sortOrder + 1 : 0;
  return await db.practiceItems.add({ name, sortOrder, archived: false, trashed: false, trashedAt: null });
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
    .where('trashed').equals(1)
    .filter(item => item.trashedAt && item.trashedAt < cutoffISO)
    .toArray();

  for (const item of expiredItems) {
    await db.practiceLogs.where('itemId').equals(item.id).delete();
    await db.practiceItems.delete(item.id);
  }

  return expiredItems;
};

// --- Practice Logs ---

export const addLog = async (itemId, duration, date) => {
  if (!date) date = getTodayString();
  const uid = crypto.randomUUID();
  return await db.practiceLogs.add({ itemId, date, duration, uid });
};

export const getTodaysLogs = async () => {
  const today = getTodayString();
  return await db.practiceLogs.where('date').equals(today).toArray();
};

export const getLogsByDate = async (dateString) => {
  return await db.practiceLogs.where('date').equals(dateString).toArray();
};

export const getLogsByDateRange = async (startDate, endDate) => {
  return await db.practiceLogs
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
};
