// Goals codec. Mirrors the field mapping + diff logic in pullAllGoals
// (and the snake_case shape in pushGoal).
export const goalCodec = {
  table: 'goals',
  toRemote(local) {
    return {
      uid: local.uid,
      name: local.name ?? '',
      start_date: local.startDate,
      end_date: local.endDate,
      target_hours: local.targetHours,
      archived: !!local.archived,
      archived_at: local.archivedAt ?? null,
      pinned: !!local.pinned,
      created_at: local.createdAt || 0,
      sort_order: local.sortOrder ?? 0,
    };
  },
  toLocal(data) {
    return {
      uid: data.uid,
      name: data.name ?? '',
      startDate: data.start_date,
      endDate: data.end_date,
      targetHours: data.target_hours,
      archived: !!data.archived,
      archivedAt: data.archived_at ?? null,
      pinned: !!data.pinned,
      createdAt: data.created_at || 0,
      sortOrder: data.sort_order ?? 0,
      syncedOnce: true,
    };
  },
  diff(data, local) {
    if (!local) return { action: 'add', fields: this.toLocal(data) };
    const fields = this.toLocal(data);
    const updates = {};
    for (const k of ['name', 'startDate', 'endDate', 'targetHours',
      'archived', 'archivedAt', 'pinned', 'createdAt', 'sortOrder']) {
      if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
    }
    if (!local.syncedOnce) updates.syncedOnce = true;
    return { action: Object.keys(updates).length ? 'update' : 'skip', fields: updates };
  },
};
