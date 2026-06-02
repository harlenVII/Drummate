// Metronome-practice codec. Mirrors the field mapping + diff logic in
// pullAllPractices (and the snake_case shape in pushPractice).
export const practiceCodec = {
  table: 'metronomePractices',
  toRemote(local) {
    return {
      uid: local.uid,
      name: local.name,
      start_bpm: local.startBpm,
      end_bpm: local.endBpm,
      bpm_increment: local.bpmIncrement,
      bars_per_step: local.barsPerStep,
      time_signature_beats: local.timeSignature?.beats,
      time_signature_note_value: local.timeSignature?.noteValue,
      subdivision: local.subdivision,
      sound_type: local.soundType,
      linked_item_uid: local.linkedItemUid ?? null,
      sort_order: local.sortOrder ?? 0,
      created_at: local.createdAt || '',
      updated_at: local.updatedAt || '',
    };
  },
  toLocal(data) {
    return {
      uid: data.uid,
      name: data.name ?? '',
      startBpm: data.start_bpm ?? 60,
      endBpm: data.end_bpm ?? 60,
      bpmIncrement: data.bpm_increment ?? 1,
      barsPerStep: data.bars_per_step ?? 1,
      timeSignature: {
        beats: data.time_signature_beats ?? 4,
        noteValue: data.time_signature_note_value ?? 4,
      },
      subdivision: data.subdivision ?? 'quarter',
      soundType: data.sound_type ?? 'click',
      linkedItemUid: data.linked_item_uid ?? null,
      sortOrder: data.sort_order ?? 0,
      createdAt: data.created_at || '',
      updatedAt: data.updated_at || '',
      syncedOnce: true,
    };
  },
  diff(data, local) {
    if (!local) return { action: 'add', fields: this.toLocal(data) };
    const fields = this.toLocal(data);
    const updates = {};
    for (const k of ['name', 'startBpm', 'endBpm', 'bpmIncrement', 'barsPerStep',
      'subdivision', 'soundType', 'linkedItemUid', 'sortOrder', 'createdAt', 'updatedAt']) {
      if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
    }
    if (local.timeSignature?.beats !== fields.timeSignature.beats ||
        local.timeSignature?.noteValue !== fields.timeSignature.noteValue) {
      updates.timeSignature = fields.timeSignature;
    }
    if (!local.syncedOnce) updates.syncedOnce = true;
    return { action: Object.keys(updates).length ? 'update' : 'skip', fields: updates };
  },
};
