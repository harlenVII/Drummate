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

// --- Practice Items ---

export const getItems = async () => {
  return await db.practiceItems.toArray();
};

export const addItem = async (name) => {
  return await db.practiceItems.add({ name });
};

export const renameItem = async (id, newName) => {
  return await db.practiceItems.update(id, { name: newName });
};

export const deleteItem = async (id) => {
  await db.practiceLogs.where('itemId').equals(id).delete();
  return await db.practiceItems.delete(id);
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
