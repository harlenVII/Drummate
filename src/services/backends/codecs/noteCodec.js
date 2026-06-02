// Notes codec. Mirrors the field mapping in pullAllNotes / subscribe notes handler.
export const noteCodec = {
  table: 'notes',
  toRemote(local) {
    return {
      uid: local.uid,
      item_uid: local.itemUid,
      date: local.date,
      body: local.body ?? '',
      trashed: !!local.trashed,
      trashed_at: local.trashedAt || '',
      created_at: local.createdAt || '',
    };
  },
  toLocal(data) {
    return {
      uid: data.uid,
      itemUid: data.item_uid,
      date: data.date,
      body: data.body ?? '',
      trashed: !!data.trashed,
      trashedAt: data.trashed_at || null,
      createdAt: data.created_at || '',
      syncedOnce: true,
    };
  },
  diff(data, local) {
    if (!local) return { action: 'add', fields: this.toLocal(data) };
    const updates = {};
    if (data.item_uid && local.itemUid !== data.item_uid) updates.itemUid = data.item_uid;
    if (data.date != null && local.date !== data.date) updates.date = data.date;
    if (data.body != null && local.body !== data.body) updates.body = data.body;
    if (data.trashed != null && local.trashed !== !!data.trashed) {
      updates.trashed = !!data.trashed;
      updates.trashedAt = data.trashed_at || null;
    }
    if (data.created_at && !local.createdAt) updates.createdAt = data.created_at;
    if (!local.syncedOnce) updates.syncedOnce = true;
    return { action: Object.keys(updates).length ? 'update' : 'skip', fields: updates };
  },
};
