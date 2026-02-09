import Dexie from 'dexie';

// Initialize Dexie database
export const db = new Dexie('DrummateDB');

// Define schema
db.version(1).stores({
  practices: '++id, date, duration, notes, timestamp'
});

// Database operations
export const addPracticeSession = async (duration, notes) => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format

  return await db.practices.add({
    date: dateStr,
    duration: duration, // in seconds
    notes: notes || '',
    timestamp: now
  });
};

export const getTodaysPractices = async () => {
  const today = new Date().toISOString().split('T')[0];
  return await db.practices
    .where('date')
    .equals(today)
    .reverse()
    .sortBy('timestamp');
};

export const deletePracticeSession = async (id) => {
  return await db.practices.delete(id);
};

export const getAllPractices = async () => {
  return await db.practices.toArray();
};
