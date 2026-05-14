import Dexie from 'dexie';
import { getTodayString } from '../utils/dateHelpers';
import { SUBDIVISIONS } from '../constants/subdivisions';

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

// v10 adds the notes table. No .upgrade() needed — the table is new with nothing to back-fill.
db.version(10).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  notes: '++id, &uid, itemUid, date, trashed',
  syncQueue: '++id, action, collection, localId',
});

// v11 adds created_at to notes for stable cross-device ordering within the same date.
// Existing notes get a synthetic timestamp derived from their local id so within-device
// relative order is preserved (exact value is arbitrary for pre-existing records).
db.version(11).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  notes: '++id, &uid, itemUid, date, trashed',
  syncQueue: '++id, action, collection, localId',
}).upgrade(tx => {
  return tx.table('notes').toCollection().modify(note => {
    if (!note.createdAt) note.createdAt = new Date(note.id).toISOString();
  });
});

// v12 adds the metronomePractices table for the tempo-trainer feature.
// New table — no .upgrade() body needed.
db.version(12).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  notes: '++id, &uid, itemUid, date, trashed',
  metronomePractices: '++id, &uid, sortOrder',
  syncQueue: '++id, action, collection, localId',
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
  return await db.transaction('rw', db.practiceItems, db.practiceLogs, db.notes, async () => {
    const item = await db.practiceItems.get(id);
    await db.practiceLogs.where('itemId').equals(id).delete();
    if (item?.uid) {
      await db.notes.where('itemUid').equals(item.uid).delete();
    }
    return await db.practiceItems.delete(id);
  });
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
  const expiredNotes = await db.notes
    .filter(n => n.trashed && n.trashedAt && n.trashedAt < cutoffISO)
    .toArray();

  await db.transaction('rw', db.practiceItems, db.practiceLogs, db.notes, async () => {
    for (const item of expiredItems) {
      await db.practiceLogs.where('itemId').equals(item.id).delete();
      await db.notes.where('itemUid').equals(item.uid).delete();
      await db.practiceItems.delete(item.id);
    }
    for (const note of expiredNotes) {
      await db.notes.delete(note.id);
    }
  });

  return { expiredItems, expiredNotes };
};

export const mergeItem = async (sourceId, targetId) => {
  if (sourceId === targetId) {
    throw new Error('mergeItem: source and target are the same');
  }
  return await db.transaction('rw', db.practiceItems, db.practiceLogs, db.notes, async () => {
    const source = await db.practiceItems.get(sourceId);
    const target = await db.practiceItems.get(targetId);
    if (!source) throw new Error('mergeItem: source item not found');
    if (!target) throw new Error('mergeItem: target item not found');
    if (source.trashed) throw new Error('mergeItem: source item is trashed');
    if (target.trashed) throw new Error('mergeItem: target item is trashed');

    await db.practiceLogs.where('itemId').equals(sourceId).modify({
      itemId: targetId,
      itemUid: target.uid,
    });
    await db.notes.where('itemUid').equals(source.uid).modify({
      itemUid: target.uid,
    });
    await db.practiceItems.delete(sourceId);

    return { sourceUid: source.uid, targetUid: target.uid, targetName: target.name };
  });
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

// --- Notes ---

export const addNote = async (itemUid, body, date) => {
  if (!itemUid) throw new Error('addNote: itemUid is required');
  if (typeof body !== 'string') throw new Error('addNote: body must be a string');
  if (!date) date = getTodayString();
  const uid = crypto.randomUUID();
  return await db.notes.add({
    uid, itemUid, date, body,
    createdAt: new Date().toISOString(),
    trashed: false, trashedAt: null,
    syncedOnce: false,
  });
};

export const getAllNotes = async () => {
  const notes = await db.notes.toArray();
  return notes
    .filter(n => !n.trashed)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      // Within same date: newer createdAt first; fall back to id for legacy rows
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return b.id - a.id;
    });
};

export const getNotesByItem = async (itemUid) => {
  const notes = await db.notes.where('itemUid').equals(itemUid).toArray();
  return notes
    .filter(n => !n.trashed)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return b.id - a.id;
    });
};

export const updateNote = async (id, body) => {
  if (typeof body !== 'string') throw new Error('updateNote: body must be a string');
  return await db.notes.update(id, { body });
};

export const trashNote = async (id) => {
  return await db.notes.update(id, {
    trashed: true,
    trashedAt: new Date().toISOString(),
  });
};

export const restoreNote = async (id) => {
  return await db.notes.update(id, {
    trashed: false,
    trashedAt: null,
  });
};

export const getTrashedNotes = async () => {
  const notes = await db.notes.toArray();
  return notes
    .filter(n => n.trashed)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return b.id - a.id;
    });
};

export const purgeNote = async (id) => {
  await db.notes.delete(id);
};

export const getNoteByUid = async (uid) => {
  return await db.notes.where('uid').equals(uid).first();
};

// --- Metronome Practices ---

const VALID_SOUND_TYPES = new Set(['click', 'woodBlock', 'hiHat', 'rimshot', 'beep']);

function validatePractice(input) {
  const { name, startBpm, endBpm, bpmIncrement, barsPerStep, timeSignature, subdivision, soundType } = input;
  if (typeof name !== 'string' || !name.trim()) throw new Error('practice: name required');
  if (!Number.isInteger(startBpm) || startBpm < 30 || startBpm > 300) throw new Error('practice: invalid startBpm');
  if (!Number.isInteger(endBpm) || endBpm < 30 || endBpm > 300) throw new Error('practice: invalid endBpm');
  if (endBpm < startBpm) throw new Error('practice: endBpm must be >= startBpm');
  if (!Number.isInteger(bpmIncrement) || bpmIncrement < 1) throw new Error('practice: bpmIncrement must be >= 1');
  if (!Number.isInteger(barsPerStep) || barsPerStep < 1) throw new Error('practice: barsPerStep must be >= 1');
  if (!timeSignature || !Number.isInteger(timeSignature.beats) || !Number.isInteger(timeSignature.noteValue)) {
    throw new Error('practice: invalid timeSignature');
  }
  if (timeSignature.beats < 1 || timeSignature.beats > 16) throw new Error('practice: timeSignature.beats out of range');
  if (![2, 4, 8, 16].includes(timeSignature.noteValue)) throw new Error('practice: timeSignature.noteValue must be 2, 4, 8, or 16');
  if (typeof subdivision !== 'string' || !subdivision) throw new Error('practice: subdivision required');
  const validSubdivisionKeys = new Set(SUBDIVISIONS.filter(s => s.pattern !== null).map(s => s.key));
  if (!validSubdivisionKeys.has(subdivision)) throw new Error(`practice: invalid subdivision "${subdivision}"`);
  if (!VALID_SOUND_TYPES.has(soundType)) throw new Error('practice: invalid soundType');
}

export const getPractices = async () => {
  return await db.metronomePractices.orderBy('sortOrder').toArray();
};

export const getPracticeByUid = async (uid) => {
  return await db.metronomePractices.where('uid').equals(uid).first();
};

export const addPractice = async (input) => {
  validatePractice(input);
  const maxOrder = await db.metronomePractices.orderBy('sortOrder').last();
  const sortOrder = maxOrder ? maxOrder.sortOrder + 1 : 0;
  const now = new Date().toISOString();
  const record = {
    uid: crypto.randomUUID(),
    name: input.name.trim(),
    startBpm: input.startBpm,
    endBpm: input.endBpm,
    bpmIncrement: input.bpmIncrement,
    barsPerStep: input.barsPerStep,
    timeSignature: { beats: input.timeSignature.beats, noteValue: input.timeSignature.noteValue },
    subdivision: input.subdivision,
    soundType: input.soundType,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    syncedOnce: false,
  };
  const id = await db.metronomePractices.add(record);
  return { id, ...record };
};

export const updatePractice = async (id, input) => {
  validatePractice(input);
  return await db.metronomePractices.update(id, {
    name: input.name.trim(),
    startBpm: input.startBpm,
    endBpm: input.endBpm,
    bpmIncrement: input.bpmIncrement,
    barsPerStep: input.barsPerStep,
    timeSignature: { beats: input.timeSignature.beats, noteValue: input.timeSignature.noteValue },
    subdivision: input.subdivision,
    soundType: input.soundType,
    updatedAt: new Date().toISOString(),
  });
};

export const deletePractice = async (id) => {
  return await db.metronomePractices.delete(id);
};

export const updatePracticeOrder = async (orderedIds) => {
  await db.transaction('rw', db.metronomePractices, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.metronomePractices.update(orderedIds[i], { sortOrder: i });
    }
  });
};
