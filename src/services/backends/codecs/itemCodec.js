// Practice-items codec. Mirrors the field mapping + diff logic in the
// pullAll items add/update branches (and the snake_case shape in pushItem).
//
// Note: toRemote omits sort_order when sortOrder is null, mirroring pushItem
// which only sets data.sort_order when localItem.sortOrder != null.
export const itemCodec = {
  table: 'practiceItems',
  toRemote(local) {
    const data = {
      uid: local.uid,
      name: local.name,
      category: local.category ?? 'fundamentals',
      archived: local.archived ?? false,
      trashed: local.trashed ?? false,
      trashed_at: local.trashedAt || '',
    };
    if (local.sortOrder != null) data.sort_order = local.sortOrder;
    return data;
  },
  toLocal(data) {
    return {
      uid: data.uid,
      name: data.name,
      category: data.category ?? 'fundamentals',
      sortOrder: data.sort_order ?? 0,
      archived: data.archived ?? false,
      trashed: data.trashed ?? false,
      trashedAt: data.trashed_at || null,
      syncedOnce: true,
    };
  },
  diff(data, local) {
    if (!local) return { action: 'add', fields: this.toLocal(data) };
    const updates = {};
    if (data.name != null && local.name !== data.name) updates.name = data.name;
    if (data.sort_order != null && local.sortOrder !== data.sort_order) updates.sortOrder = data.sort_order;
    if (data.archived != null && local.archived !== data.archived) updates.archived = data.archived;
    if (data.trashed != null && local.trashed !== data.trashed) {
      updates.trashed = data.trashed;
      updates.trashedAt = data.trashed_at || null;
    }
    if (data.category !== undefined && local.category !== data.category) updates.category = data.category;
    if (!local.syncedOnce) updates.syncedOnce = true;
    return { action: Object.keys(updates).length ? 'update' : 'skip', fields: updates };
  },
};
