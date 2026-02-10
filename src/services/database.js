import Dexie from 'dexie';

export const db = new Dexie('DrummateDB');

db.version(2).stores({
  practiceItems: '++id, name',
  practiceLogs: '++id, itemId, date, duration',
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

export const addLog = async (itemId, duration) => {
  const date = new Date().toISOString().split('T')[0];
  return await db.practiceLogs.add({ itemId, date, duration });
};

export const getTodaysLogs = async () => {
  const today = new Date().toISOString().split('T')[0];
  return await db.practiceLogs.where('date').equals(today).toArray();
};
