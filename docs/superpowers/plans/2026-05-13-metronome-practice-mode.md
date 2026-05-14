# Metronome Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Practice Mode" subpage to the Metronome tab that lets users create, edit, reorder, delete, and run named tempo-trainer practices (start BPM → end BPM by a fixed increment over a configurable number of bars per step), with full cross-device sync via Firebase.

**Architecture:** Mirrors the existing items/notes patterns. Practices live in a new `metronomePractices` Dexie table (DB v12), sync to Firestore at `users/{uid}/metronomePractices/{uid}`. The run loop wires a temporary `onBeat` handler into the existing `MetronomeEngine` that counts bars and bumps the engine's BPM at the right moment. State lives in `App.jsx` alongside other metronome state.

**Tech Stack:** React 19, Dexie.js v4, `@dnd-kit/sortable` (already used by `PracticeItemList`), Firebase Firestore, Tailwind CSS v4, existing `MetronomeEngine` Web Audio API class.

**Spec reference:** [docs/superpowers/specs/2026-05-13-metronome-practice-mode-design.md](../specs/2026-05-13-metronome-practice-mode-design.md)

**Testing approach:** This codebase has no automated test infrastructure (no Vitest/Jest/etc.). Each task ends with `npm run build` plus targeted manual verification (run the dev server, perform the user-visible action, observe the result). This matches the existing project pattern.

**Important corrections vs. spec wording:**
- The spec says "DB version 11"; **the DB is already at version 11** (notes `createdAt` migration). The new table goes in **version 12**.
- Engine method names are `setBpm` (not `setBPM`) and `setBeatsPerMeasure` (not `setTimeSignature`). The component layer manages the time-signature tuple; the engine only stores `beatsPerMeasure`.

---

## File Structure

**New files (all under `src/components/`):**
- `PracticePage.jsx` — container; renders list view or run view
- `PracticeEditModal.jsx` — create/edit form modal
- `PracticeRunView.jsx` — the running-practice UI + engine wiring

**Modified files:**
- `src/services/database.js` — DB v12 schema, practice CRUD
- `src/services/backends/firebaseBackend.js` — practice push/pull/subscribe/flush
- `src/audio/metronomeEngine.js` — `triggerOneShotAccent()` method + scheduler override
- `src/contexts/LanguageContext.jsx` — en + zh strings
- `src/App.jsx` — state, handlers, subpage toggle, render, Tab cycle, sync init

---

## Task 1: Database layer — schema v12 + CRUD `[model: haiku]`

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Add Dexie v12 schema**

Append after the existing `db.version(11)` block (around line 119):

```js
// v12 adds the metronomePractices table for the tempo-trainer feature.
// New table — no .upgrade() body needed.
db.version(12).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  notes: '++id, &uid, itemUid, date, trashed',
  metronomePractices: '++id, &uid, sortOrder',
  syncQueue: '++id, action, collection, localId',
});
```

- [ ] **Step 2: Add CRUD helpers at the bottom of `database.js`**

Append after the existing `getNoteByUid` function:

```js
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
  if (typeof subdivision !== 'string' || !subdivision) throw new Error('practice: subdivision required');
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
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/database.js
git commit -m "$(cat <<'EOF'
feat(practice-mode): add metronomePractices Dexie table (v12) + CRUD

Adds the local storage layer for the upcoming Metronome Practice
Mode (tempo trainer). Schema is '++id, &uid, sortOrder'; hard-delete
only, no soft-delete. Validation enforced in the addPractice /
updatePractice helpers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Firebase backend — push, pull, subscribe, flush `[model: haiku]`

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Add the collection ref helper**

After the existing `notesRef` helper (around line 32-35), add:

```js
function practicesRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'metronomePractices');
}
```

- [ ] **Step 2: Add `pushPractice`, `pushDeletePractice`, `pushPracticeReorder`**

Insert after `deleteNoteRemote` (around line 204). These mirror the items/notes patterns:

```js
  async pushPractice(localPractice, userId) {
    if (!localPractice.uid) {
      console.error('pushPractice: missing uid', localPractice);
      return;
    }
    try {
      await setDoc(doc(practicesRef(userId), localPractice.uid), {
        uid: localPractice.uid,
        name: localPractice.name,
        start_bpm: localPractice.startBpm,
        end_bpm: localPractice.endBpm,
        bpm_increment: localPractice.bpmIncrement,
        bars_per_step: localPractice.barsPerStep,
        time_signature_beats: localPractice.timeSignature.beats,
        time_signature_note_value: localPractice.timeSignature.noteValue,
        subdivision: localPractice.subdivision,
        sound_type: localPractice.soundType,
        sort_order: localPractice.sortOrder ?? 0,
        created_at: localPractice.createdAt || '',
        updated_at: localPractice.updatedAt || '',
      }, { merge: true });

      if (localPractice.id != null && !localPractice.syncedOnce) {
        await db.metronomePractices.update(localPractice.id, { syncedOnce: true });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('push_practice', { uid: localPractice.uid });
      } else {
        throw err;
      }
    }
  },

  async pushDeletePractice(uid, userId) {
    try {
      await deleteDoc(doc(practicesRef(userId), uid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_practice', { uid });
      } else {
        throw err;
      }
    }
  },

  async pushPracticeReorder(practices, userId) {
    try {
      for (const p of practices) {
        await updateDoc(doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder_practices', {
          practices: practices.map(p => ({ uid: p.uid, sortOrder: p.sortOrder })),
        });
      } else {
        throw err;
      }
    }
  },
```

- [ ] **Step 3: Add `pullAllPractices`**

Insert after `pullAllNotes` (around line 523):

```js
  async pullAllPractices(userId) {
    const snap = await getDocs(practicesRef(userId));
    const remoteUids = new Set();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      remoteUids.add(data.uid);

      const fields = {
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
        sortOrder: data.sort_order ?? 0,
        createdAt: data.created_at || '',
        updatedAt: data.updated_at || '',
        syncedOnce: true,
      };

      const local = await db.metronomePractices.where('uid').equals(data.uid).first();
      if (!local) {
        await db.metronomePractices.add(fields);
      } else {
        const updates = {};
        for (const k of ['name', 'startBpm', 'endBpm', 'bpmIncrement', 'barsPerStep',
                         'subdivision', 'soundType', 'sortOrder', 'createdAt', 'updatedAt']) {
          if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
        }
        if (local.timeSignature?.beats !== fields.timeSignature.beats ||
            local.timeSignature?.noteValue !== fields.timeSignature.noteValue) {
          updates.timeSignature = fields.timeSignature;
        }
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.metronomePractices.update(local.id, updates);
        }
      }
    }

    // Reconcile deletes: any local that synced before but is now missing
    // remotely was deleted on another device.
    const allLocal = await db.metronomePractices.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.metronomePractices.delete(local.id);
      }
    }
  },
```

- [ ] **Step 4: Add `pushAllLocalPractices` and extend `pushAllLocal`**

Insert `pushAllLocalPractices` after `pushAllLocalNotes` (around line 531):

```js
  async pushAllLocalPractices(userId) {
    const practices = await db.metronomePractices.toArray();
    for (const p of practices) {
      if (!p.uid) continue;
      await firebaseBackend.pushPractice(p, userId);
    }
  },
```

Then in `pushAllLocal` (around line 533-544), add the call after `pushAllLocalNotes`:

```js
  async pushAllLocal(userId) {
    const items = await db.practiceItems.toArray();
    for (const item of items) {
      if (!item.uid) continue;
      await firebaseBackend.pushItem(item, userId);
    }
    const logs = await db.practiceLogs.toArray();
    for (const log of logs) {
      await firebaseBackend.pushLog(log, userId);
    }
    await firebaseBackend.pushAllLocalNotes(userId);
    await firebaseBackend.pushAllLocalPractices(userId);
  },
```

- [ ] **Step 5: Extend `flushSyncQueue` for the new actions**

In `flushSyncQueue` (around line 546-591), add the new action handlers inside the if/else-if chain, before the closing `await db.syncQueue.delete(entry.id);`:

```js
        } else if (entry.action === 'push_practice') {
          const local = await db.metronomePractices.where('uid').equals(entry.payload.uid).first();
          if (local) await firebaseBackend.pushPractice(local, userId);
        } else if (entry.action === 'delete_practice') {
          await firebaseBackend.pushDeletePractice(entry.payload.uid, userId);
        } else if (entry.action === 'reorder_practices') {
          for (const p of entry.payload.practices) {
            await updateDoc(doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
          }
        }
```

- [ ] **Step 6: Extend `subscribeToChanges` to include practices**

In `subscribeToChanges` (around line 594-758), after the existing `unsubNotes = onSnapshot(...)` block, add a fourth subscription:

```js
    const unsubPractices = onSnapshot(practicesRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (!data.uid) continue;

        const buildFields = () => ({
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
          sortOrder: data.sort_order ?? 0,
          createdAt: data.created_at || '',
          updatedAt: data.updated_at || '',
          syncedOnce: true,
        });

        if (change.type === 'added') {
          const existing = await db.metronomePractices.where('uid').equals(data.uid).first();
          if (existing) continue;
          await db.metronomePractices.add(buildFields());
          onDataChanged();
        } else if (change.type === 'modified') {
          const local = await db.metronomePractices.where('uid').equals(data.uid).first();
          if (!local) continue;
          const fields = buildFields();
          const updates = {};
          for (const k of ['name', 'startBpm', 'endBpm', 'bpmIncrement', 'barsPerStep',
                           'subdivision', 'soundType', 'sortOrder', 'createdAt', 'updatedAt']) {
            if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
          }
          if (local.timeSignature?.beats !== fields.timeSignature.beats ||
              local.timeSignature?.noteValue !== fields.timeSignature.noteValue) {
            updates.timeSignature = fields.timeSignature;
          }
          if (!local.syncedOnce) updates.syncedOnce = true;
          if (Object.keys(updates).length > 0) {
            await db.metronomePractices.update(local.id, updates);
            onDataChanged();
          }
        } else if (change.type === 'removed') {
          const existing = await db.metronomePractices.where('uid').equals(data.uid).first();
          if (existing) {
            await db.metronomePractices.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });
```

And update the returned cleanup function to include `unsubPractices`:

```js
    return () => {
      unsubItems();
      unsubLogs();
      unsubNotes();
      unsubPractices();
    };
```

- [ ] **Step 7: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "$(cat <<'EOF'
feat(practice-mode): wire metronomePractices sync into firebase backend

Adds push/pull/reorder/delete for practices at
users/{uid}/metronomePractices/{uid}, plus subscribeToChanges
extension, sync-queue actions, and pushAllLocalPractices in the
normal init flow. Mirrors the items/notes patterns.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Audio engine — `triggerOneShotAccent` `[model: haiku]`

**Files:**
- Modify: `src/audio/metronomeEngine.js`

- [ ] **Step 1: Add the `_oneShotAccent` flag**

In the constructor (around line 33, right after `this.accentFirstBeat = true;`), add:

```js
    // One-shot accent for cases like practice-mode step transitions:
    // the next scheduled downbeat (beat 0, subIndex 0) plays the accent
    // sound regardless of `accentFirstBeat`.
    this._oneShotAccent = false;
```

- [ ] **Step 2: Add the public method**

After `setAccentFirstBeat` (around line 425), add:

```js
  triggerOneShotAccent() {
    this._oneShotAccent = true;
  }
```

- [ ] **Step 3: Honor the flag in `_scheduleNote`**

In `_scheduleNote` (around line 472), find the accent check:

```js
    const isMainBeat = subIndex === 0;
    const isAccent = this.accentFirstBeat && beat === 0 && isMainBeat;
```

Replace with:

```js
    const isMainBeat = subIndex === 0;
    const isDownbeat = beat === 0 && isMainBeat;
    const isOneShot = this._oneShotAccent && isDownbeat;
    const isAccent = isDownbeat && (this.accentFirstBeat || isOneShot);
    if (isOneShot) this._oneShotAccent = false;
```

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src/audio/metronomeEngine.js
git commit -m "$(cat <<'EOF'
feat(metronome): add triggerOneShotAccent for practice-mode step changes

The next downbeat scheduled after this call uses the accent buffer
regardless of the user's accent-first-beat preference. Used by the
upcoming practice-mode runner to mark a tempo-step transition.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Translation keys (en + zh) `[model: haiku]`

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add English keys**

In the `en` block, add after the `sequencerInsertAfter` line (around line 83):

```js
    metronomeSubpages: {
      metronome: 'Metronome',
      sequencer: 'Sequencer',
      practice: 'Practice',
    },
    practiceMode: {
      empty: 'No practices yet. Tap "+" to create one.',
      addPractice: 'Add Practice',
      editPractice: 'Edit Practice',
      deletePractice: 'Delete Practice',
      confirmDelete: 'Delete this practice? This cannot be undone.',
      name: 'Name',
      namePlaceholder: 'e.g. Singles 80→120',
      startBpm: 'Start BPM',
      endBpm: 'End BPM',
      bpmIncrement: 'BPM Increment',
      barsPerStep: 'Bars per Step',
      timeSignature: 'Time Signature',
      subdivision: 'Subdivision',
      sound: 'Sound',
      start: 'Start',
      pause: 'Pause',
      resume: 'Resume',
      end: 'End',
      complete: 'Practice Complete',
      done: 'Done',
      summary: '{start} → {end} BPM, +{inc} every {bars} bars, {beats}/{noteValue}',
      stepProgress: 'Step {current}/{total}',
      barProgress: 'Bar {current}/{total}',
      validation: {
        nameRequired: 'Name is required',
        endBeforeStart: 'End BPM must be at least Start BPM',
        positiveIncrement: 'Increment must be at least 1',
        positiveBars: 'Bars per step must be at least 1',
      },
    },
```

- [ ] **Step 2: Add Chinese keys**

In the `zh` block, add after the `sequencerInsertAfter` line (around line 340):

```js
    metronomeSubpages: {
      metronome: '节拍器',
      sequencer: '复杂节奏',
      practice: '练习',
    },
    practiceMode: {
      empty: '还没有练习。点击"+"创建一个。',
      addPractice: '添加练习',
      editPractice: '编辑练习',
      deletePractice: '删除练习',
      confirmDelete: '删除此练习？此操作无法撤销。',
      name: '名称',
      namePlaceholder: '例如 单击练习 80→120',
      startBpm: '起始 BPM',
      endBpm: '结束 BPM',
      bpmIncrement: 'BPM 增量',
      barsPerStep: '每段小节数',
      timeSignature: '拍号',
      subdivision: '细分',
      sound: '音色',
      start: '开始',
      pause: '暂停',
      resume: '继续',
      end: '结束',
      complete: '练习完成',
      done: '完成',
      summary: '{start} → {end} BPM,每 {bars} 小节 +{inc},{beats}/{noteValue}',
      stepProgress: '第 {current}/{total} 段',
      barProgress: '第 {current}/{total} 小节',
      validation: {
        nameRequired: '名称为必填项',
        endBeforeStart: '结束 BPM 不能小于起始 BPM',
        positiveIncrement: '增量至少为 1',
        positiveBars: '每段小节数至少为 1',
      },
    },
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "$(cat <<'EOF'
feat(practice-mode): add en/zh translation keys

Adds metronomeSubpages.* and practiceMode.* nested keys for the
upcoming practice-mode UI.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `PracticeEditModal` component `[model: haiku]`

**Files:**
- Create: `src/components/PracticeEditModal.jsx`

- [ ] **Step 1: Create the modal component**

```jsx
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const TIME_SIGNATURES = [
  { beats: 2, noteValue: 4 },
  { beats: 3, noteValue: 4 },
  { beats: 4, noteValue: 4 },
  { beats: 5, noteValue: 4 },
  { beats: 6, noteValue: 8 },
  { beats: 7, noteValue: 8 },
];
const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

const DEFAULTS = {
  name: '',
  startBpm: 80,
  endBpm: 120,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: 'quarter',
  soundType: 'click',
};

export default function PracticeEditModal({ practice, onSave, onDelete, onCancel }) {
  const { t } = useLanguage();
  const isEdit = !!practice;
  const [form, setForm] = useState(() =>
    practice ? { ...practice } : { ...DEFAULTS }
  );
  const [error, setError] = useState(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = (k) => (e) => {
    const v = parseInt(e.target.value, 10);
    setField(k, Number.isFinite(v) ? v : 0);
  };

  const validate = () => {
    if (!form.name.trim()) return t('practiceMode.validation.nameRequired');
    if (form.endBpm < form.startBpm) return t('practiceMode.validation.endBeforeStart');
    if (form.bpmIncrement < 1) return t('practiceMode.validation.positiveIncrement');
    if (form.barsPerStep < 1) return t('practiceMode.validation.positiveBars');
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) { setError(err); return; }
    onSave({
      ...form,
      name: form.name.trim(),
      startBpm: Math.max(30, Math.min(300, form.startBpm)),
      endBpm: Math.max(30, Math.min(300, form.endBpm)),
    });
  };

  const handleDelete = () => {
    if (window.confirm(t('practiceMode.confirmDelete'))) {
      onDelete();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-800">
            {isEdit ? t('practiceMode.editPractice') : t('practiceMode.addPractice')}
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.name')}</span>
            <input
              ref={firstInputRef}
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder={t('practiceMode.namePlaceholder')}
              className="border border-gray-300 rounded-lg px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.startBpm')}</span>
              <input type="number" min="30" max="300" value={form.startBpm}
                onChange={setNum('startBpm')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.endBpm')}</span>
              <input type="number" min="30" max="300" value={form.endBpm}
                onChange={setNum('endBpm')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.bpmIncrement')}</span>
              <input type="number" min="1" max="50" value={form.bpmIncrement}
                onChange={setNum('bpmIncrement')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.barsPerStep')}</span>
              <input type="number" min="1" max="64" value={form.barsPerStep}
                onChange={setNum('barsPerStep')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.timeSignature')}</span>
            <select
              value={`${form.timeSignature.beats}/${form.timeSignature.noteValue}`}
              onChange={(e) => {
                const [beats, noteValue] = e.target.value.split('/').map(Number);
                setField('timeSignature', { beats, noteValue });
              }}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {TIME_SIGNATURES.map((ts) => (
                <option key={`${ts.beats}/${ts.noteValue}`} value={`${ts.beats}/${ts.noteValue}`}>
                  {ts.beats}/{ts.noteValue}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.subdivision')}</span>
            <select
              value={form.subdivision}
              onChange={(e) => setField('subdivision', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {SUBDIVISIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.key}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.sound')}</span>
            <select
              value={form.soundType}
              onChange={(e) => setField('soundType', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {SOUND_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {isEdit ? (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 font-medium"
              >
                {t('delete')}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticeEditModal.jsx
git commit -m "$(cat <<'EOF'
feat(practice-mode): add PracticeEditModal component

Create/edit form for tempo-trainer practices. Fields: name,
start/end BPM, increment, bars-per-step, time signature,
subdivision, sound. Validates inline. Escape/Cancel/Save/Delete
only — backdrop click intentionally disabled (matches NoteEditModal).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `PracticeRunView` component `[model: haiku]`

**Files:**
- Create: `src/components/PracticeRunView.jsx`

- [ ] **Step 1: Create the run view**

```jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

function computeSteps(startBpm, endBpm, bpmIncrement) {
  const steps = [];
  for (let bpm = startBpm; bpm < endBpm; bpm += bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(endBpm);
  return steps;
}

export default function PracticeRunView({
  practice,
  engineRef,
  noSleepRef,
  onEnd,
}) {
  const { t } = useLanguage();
  const steps = computeSteps(practice.startBpm, practice.endBpm, practice.bpmIncrement);
  const totalSteps = steps.length;
  const totalBars = totalSteps * practice.barsPerStep;

  const [stepIndex, setStepIndex] = useState(0);
  const [barIndex, setBarIndex] = useState(0); // bars completed within current step
  const [isPlaying, setIsPlaying] = useState(false);
  const [complete, setComplete] = useState(false);

  // Refs mirror state for use inside the onBeat callback (which closes over
  // its initial values).
  const stepIndexRef = useRef(0);
  const barIndexRef = useRef(0);
  // Track previous beat number so we can detect bar boundaries (beat wraps 0).
  const prevBeatRef = useRef(-1);
  // Suppress the initial beat=0 firing on start (which would falsely count as
  // a completed bar before any bar has actually played).
  const sawFirstBeatRef = useRef(false);
  // Prevent the onBeat handler from firing twice after engine.stop() is
  // called for completion.
  const stoppedRef = useRef(false);

  // Configure engine for this practice's settings on mount, restore on unmount.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBpm(practice.startBpm);
    engine.setBeatsPerMeasure(practice.timeSignature.beats);
    const sub = SUBDIVISIONS.find((s) => s.key === practice.subdivision);
    engine.setSubdivision(sub && sub.pattern ? sub.pattern : [0]);
    engine.setSoundType(practice.soundType);
    engine.setSequence(null);
  }, [engineRef, practice]);

  const handleEnd = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.isPlaying) engine.stop();
    engine && (engine.onBeat = null);
    noSleepRef.current?.disable?.();
    onEnd();
  }, [engineRef, noSleepRef, onEnd]);

  const handleTogglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      // Pause: stop audio, preserve {stepIndex, barIndex}; resume will
      // restart at start of current bar (beat 0). beat-mid resume is not
      // supported by the engine.
      engine.stop();
      sawFirstBeatRef.current = false;
      prevBeatRef.current = -1;
      noSleepRef.current?.disable?.();
      setIsPlaying(false);
      return;
    }

    if (complete) {
      // Restart from scratch.
      setStepIndex(0);
      setBarIndex(0);
      stepIndexRef.current = 0;
      barIndexRef.current = 0;
      setComplete(false);
      stoppedRef.current = false;
      engine.setBpm(steps[0]);
    } else {
      // Resume / start: re-assert this step's BPM in case it was changed.
      engine.setBpm(steps[stepIndexRef.current]);
    }

    sawFirstBeatRef.current = false;
    prevBeatRef.current = -1;

    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      // Bar boundary: previous beat was nonzero, current is 0 (wrap).
      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      const nextBarIndex = barIndexRef.current + 1;
      if (nextBarIndex < practice.barsPerStep) {
        barIndexRef.current = nextBarIndex;
        setBarIndex(nextBarIndex);
        return;
      }

      // Step transition.
      const nextStepIndex = stepIndexRef.current + 1;
      if (nextStepIndex >= totalSteps) {
        // Completion.
        stoppedRef.current = true;
        engine.stop();
        engine.onBeat = null;
        noSleepRef.current?.disable?.();
        // Bump bar counter to total so the bar display reads barsPerStep/barsPerStep.
        barIndexRef.current = practice.barsPerStep;
        setBarIndex(practice.barsPerStep);
        setIsPlaying(false);
        setComplete(true);
        return;
      }

      stepIndexRef.current = nextStepIndex;
      barIndexRef.current = 0;
      setStepIndex(nextStepIndex);
      setBarIndex(0);
      engine.setBpm(steps[nextStepIndex]);
      engine.triggerOneShotAccent();
    };

    noSleepRef.current?.enable?.();
    await engine.start();
    setIsPlaying(true);
  }, [engineRef, isPlaying, complete, noSleepRef, practice.barsPerStep, steps, totalSteps]);

  // Stop on unmount.
  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      if (engine?.isPlaying) engine.stop();
      if (engine) engine.onBeat = null;
      noSleepRef.current?.disable?.();
    };
  }, [engineRef, noSleepRef]);

  const currentBpm = complete ? steps[steps.length - 1] : steps[stepIndex];
  const barsCompletedTotal = stepIndex * practice.barsPerStep + barIndex;
  const progressPct = Math.min(100, (barsCompletedTotal / totalBars) * 100);

  return (
    <div className="flex flex-col gap-6 items-center">
      <h2 className="text-2xl font-bold text-gray-800 text-center">{practice.name}</h2>

      <div className="text-6xl font-bold text-gray-900 tabular-nums">{currentBpm}</div>

      <div className="text-sm text-gray-600 flex flex-col items-center gap-1">
        <div>{t('practiceMode.stepProgress', { current: stepIndex + 1, total: totalSteps })}</div>
        <div>{t('practiceMode.barProgress', { current: Math.min(barIndex + (isPlaying ? 1 : 0), practice.barsPerStep), total: practice.barsPerStep })}</div>
      </div>

      <div className="w-full max-w-sm h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {complete ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-lg font-semibold text-green-700">{t('practiceMode.complete')}</div>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {t('practiceMode.done')}
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleTogglePlay}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 min-w-[100px]"
          >
            {isPlaying ? t('practiceMode.pause') : (stepIndex === 0 && barIndex === 0 ? t('practiceMode.start') : t('practiceMode.resume'))}
          </button>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 font-medium hover:bg-gray-300"
          >
            {t('practiceMode.end')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticeRunView.jsx
git commit -m "$(cat <<'EOF'
feat(practice-mode): add PracticeRunView component

Runs a tempo-trainer practice via the existing MetronomeEngine.
Counts bars via the onBeat callback, advances BPM on step
transitions, triggers a one-shot downbeat accent at each step
change, and shows a completion state at the end. Pause preserves
{stepIndex, barIndex}; resume restarts at the start of the current
bar at the current step's BPM.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `PracticePage` component (list view + drag-and-drop) `[model: haiku]`

**Files:**
- Create: `src/components/PracticePage.jsx`

- [ ] **Step 1: Create the page component**

```jsx
import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLanguage } from '../contexts/LanguageContext';
import PracticeEditModal from './PracticeEditModal';
import PracticeRunView from './PracticeRunView';

function PracticeRow({ practice, onStart, onEdit }) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: practice.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-400 hover:text-gray-600 cursor-grab touch-none px-1"
        aria-label="drag"
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 truncate">{practice.name}</div>
        <div className="text-sm text-gray-500 truncate">
          {t('practiceMode.summary', {
            start: practice.startBpm,
            end: practice.endBpm,
            inc: practice.bpmIncrement,
            bars: practice.barsPerStep,
            beats: practice.timeSignature.beats,
            noteValue: practice.timeSignature.noteValue,
          })}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
      >
        {t('edit')}
      </button>
      <button
        onClick={onStart}
        className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white font-medium hover:bg-blue-700"
      >
        {t('practiceMode.start')}
      </button>
    </div>
  );
}

export default function PracticePage({
  practices,
  runningPracticeUid,
  engineRef,
  noSleepRef,
  onAddPractice,
  onUpdatePractice,
  onDeletePractice,
  onReorderPractices,
  onStartPractice,
  onEndPractice,
}) {
  const { t } = useLanguage();
  const [modalState, setModalState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', practice }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = practices.findIndex((p) => p.id === active.id);
    const newIndex = practices.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(practices, oldIndex, newIndex);
    onReorderPractices(reordered.map((p) => p.id));
  };

  if (runningPracticeUid) {
    const practice = practices.find((p) => p.uid === runningPracticeUid);
    if (!practice) {
      // The practice was deleted/synced-away while running — just end.
      onEndPractice();
      return null;
    }
    return (
      <PracticeRunView
        practice={practice}
        engineRef={engineRef}
        noSleepRef={noSleepRef}
        onEnd={onEndPractice}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {practices.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            {t('practiceMode.empty')}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={practices.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {practices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    onStart={() => onStartPractice(p.uid)}
                    onEdit={() => setModalState({ mode: 'edit', practice: p })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <button
          onClick={() => setModalState({ mode: 'create' })}
          className="self-end px-4 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          + {t('practiceMode.addPractice')}
        </button>
      </div>

      {modalState && (
        <PracticeEditModal
          practice={modalState.mode === 'edit' ? modalState.practice : null}
          onSave={async (data) => {
            if (modalState.mode === 'edit') {
              await onUpdatePractice(modalState.practice.id, data);
            } else {
              await onAddPractice(data);
            }
            setModalState(null);
          }}
          onDelete={async () => {
            await onDeletePractice(modalState.practice.id, modalState.practice.uid);
            setModalState(null);
          }}
          onCancel={() => setModalState(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticePage.jsx
git commit -m "$(cat <<'EOF'
feat(practice-mode): add PracticePage with dnd-kit reorder

Container for the metronome practice subpage. List view shows
all practices with drag-and-drop reorder (single SortableContext,
no category grouping), an edit button per row, and a "+" CTA.
Switches to PracticeRunView when a practice is running.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Integrate into `App.jsx` `[model: sonnet]`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add database + page imports**

Find the existing imports for `database.js` functions (around line 25-30) and add `getPractices, addPractice, updatePractice, deletePractice, updatePracticeOrder`. Also import `PracticePage`:

```js
import {
  // ...existing imports kept as-is...
  getPractices,
  addPractice as dbAddPractice,
  updatePractice as dbUpdatePractice,
  deletePractice as dbDeletePractice,
  updatePracticeOrder,
} from './services/database';
```

```js
import PracticePage from './components/PracticePage';
```

The aliases (`dbAddPractice`, etc.) avoid colliding with App-level handlers named `handleAddPractice` and prevent shadowing.

- [ ] **Step 2: Add state for practices and running state**

Near the other metronome state (after `metronomeSubpage`, around line 148), add:

```js
  const [metronomePractices, setMetronomePractices] = useState([]);
  // null when idle; otherwise { uid }. Lives in App so it persists
  // across app-tab switches; cleared on metronome-subpage switch.
  const [runningPracticeUid, setRunningPracticeUid] = useState(null);
```

- [ ] **Step 3: Load practices in `loadData`**

In `loadData` (around line 265-277), change the `Promise.all` line:

Before:
```js
    const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
```

After:
```js
    const [allItems, logs, practices] = await Promise.all([getItems(), getTodaysLogs(), getPractices()]);
    setMetronomePractices(practices);
```

(Insert the `setMetronomePractices(practices);` call right after the existing `setItems(allItems);`.)

- [ ] **Step 4: Add `pullAllPractices` to the sync init flow**

In the `init` async function inside the sync `useEffect` (around line 336-351), add `pullAllPractices` after `pullAllNotes`:

Before:
```js
        await firebaseBackend.pullAll(user.id);
        await firebaseBackend.pullAllNotes(user.id);
        await loadData();
```

After:
```js
        await firebaseBackend.pullAll(user.id);
        await firebaseBackend.pullAllNotes(user.id);
        await firebaseBackend.pullAllPractices(user.id);
        await loadData();
```

- [ ] **Step 5: Add practice handlers**

After the existing item/note handlers in `App.jsx` (find a logical place — for example, after `handleArchiveItem` near line ~660), insert:

```js
  const handleAddPractice = useCallback(
    async (data) => {
      const record = await dbAddPractice(data);
      await loadData();
      if (user) {
        const local = await getPractices().then(ps => ps.find(p => p.uid === record.uid));
        if (local) firebaseBackend.pushPractice(local, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handleUpdatePractice = useCallback(
    async (id, data) => {
      await dbUpdatePractice(id, data);
      await loadData();
      if (user) {
        const updated = await getPractices().then(ps => ps.find(p => p.id === id));
        if (updated) firebaseBackend.pushPractice(updated, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handleDeletePractice = useCallback(
    async (id, uid) => {
      // If the running practice is being deleted, end the run first.
      if (runningPracticeUid && uid === runningPracticeUid) {
        setRunningPracticeUid(null);
      }
      await dbDeletePractice(id);
      await loadData();
      if (user) {
        firebaseBackend.pushDeletePractice(uid, user.id).catch(console.error);
      }
    },
    [loadData, user, runningPracticeUid],
  );

  const handleReorderPractices = useCallback(
    async (orderedIds) => {
      await updatePracticeOrder(orderedIds);
      await loadData();
      if (user) {
        const updated = await getPractices();
        firebaseBackend.pushPracticeReorder(updated, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handleStartPractice = useCallback((uid) => {
    setRunningPracticeUid(uid);
  }, []);

  const handleEndPractice = useCallback(() => {
    setRunningPracticeUid(null);
  }, []);
```

- [ ] **Step 6: Clear `runningPracticeUid` on subpage change**

In `handleSubpageChange` (around line 779-792), add a clear:

Before:
```js
  const handleSubpageChange = useCallback(
    (subpage) => {
      if (metronomeIsPlaying) {
        metronomeEngineRef.current.stop();
        metronomeEngineRef.current.setSequence(null);
        setMetronomeIsPlaying(false);
        setMetronomeCurrentBeat(-1);
        setSequencerPlayingSlot(-1);
        noSleepRef.current.disable();
      }
      setMetronomeSubpage(subpage);
    },
    [metronomeIsPlaying],
  );
```

After:
```js
  const handleSubpageChange = useCallback(
    (subpage) => {
      if (metronomeIsPlaying) {
        metronomeEngineRef.current.stop();
        metronomeEngineRef.current.setSequence(null);
        setMetronomeIsPlaying(false);
        setMetronomeCurrentBeat(-1);
        setSequencerPlayingSlot(-1);
        noSleepRef.current.disable();
      }
      // End any active practice run when leaving (or re-entering) the practice subpage.
      if (runningPracticeUid) {
        if (metronomeEngineRef.current?.isPlaying) {
          metronomeEngineRef.current.stop();
        }
        metronomeEngineRef.current && (metronomeEngineRef.current.onBeat = null);
        noSleepRef.current?.disable?.();
        setRunningPracticeUid(null);
      }
      setMetronomeSubpage(subpage);
    },
    [metronomeIsPlaying, runningPracticeUid],
  );
```

- [ ] **Step 7: Update the metronome `Tab` cycle to include `'practice'`**

In the keyboard shortcut effect (around line 1212-1219), change:

Before:
```js
        if (activeTabRef.current === 'metronome') {
          e.preventDefault();
          const pages = ['metronome', 'sequencer'];
```

After:
```js
        if (activeTabRef.current === 'metronome') {
          e.preventDefault();
          const pages = ['metronome', 'sequencer', 'practice'];
```

- [ ] **Step 8: Add the Practice button to the subpage toggle and render `PracticePage`**

In the JSX where the subpage toggle lives (around line 1325-1388), replace the existing toggle + conditional render with this:

```jsx
          {activeTab === 'metronome' && (
            <>
              {/* Subpage toggle */}
              <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
                <button
                  onClick={() => handleSubpageChange('metronome')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'metronome'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t('metronomeSubpages.metronome')}
                </button>
                <button
                  onClick={() => handleSubpageChange('sequencer')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'sequencer'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t('metronomeSubpages.sequencer')}
                </button>
                <button
                  onClick={() => handleSubpageChange('practice')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'practice'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t('metronomeSubpages.practice')}
                </button>
              </div>

              {metronomeSubpage === 'metronome' ? (
                <Metronome
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  bpm={metronomeBpm}
                  setBpm={setMetronomeBpm}
                  isPlaying={metronomeIsPlaying}
                  setIsPlaying={setMetronomeIsPlaying}
                  currentBeat={metronomeCurrentBeat}
                  setCurrentBeat={setMetronomeCurrentBeat}
                  timeSignature={metronomeTimeSignature}
                  setTimeSignature={setMetronomeTimeSignature}
                  subdivision={metronomeSubdivision}
                  setSubdivision={setMetronomeSubdivision}
                  soundType={metronomeSoundType}
                  setSoundType={setMetronomeSoundType}
                  accentFirstBeat={metronomeAccentFirstBeat}
                  setAccentFirstBeat={setMetronomeAccentFirstBeat}
                />
              ) : metronomeSubpage === 'sequencer' ? (
                <SequencerPage
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  bpm={sequencerBpm}
                  setBpm={setSequencerBpm}
                  isPlaying={metronomeIsPlaying}
                  setIsPlaying={setMetronomeIsPlaying}
                  soundType={sequencerSoundType}
                  setSoundType={setSequencerSoundType}
                  slots={sequencerSlots}
                  setSlots={setSequencerSlots}
                  playingSlot={sequencerPlayingSlot}
                  setPlayingSlot={setSequencerPlayingSlot}
                  nextIdRef={sequencerNextIdRef}
                />
              ) : (
                <PracticePage
                  practices={metronomePractices}
                  runningPracticeUid={runningPracticeUid}
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  onAddPractice={handleAddPractice}
                  onUpdatePractice={handleUpdatePractice}
                  onDeletePractice={handleDeletePractice}
                  onReorderPractices={handleReorderPractices}
                  onStartPractice={handleStartPractice}
                  onEndPractice={handleEndPractice}
                />
              )}
            </>
          )}
```

(The `{t('metronome')}` and `{t('sequencer')}` calls in the existing toggle are replaced with the new nested-key versions for consistency.)

- [ ] **Step 9: Verify build succeeds**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat(practice-mode): wire practice subpage into App.jsx

- Three-button subpage toggle (Metronome / Sequencer / Practice)
- Tab key cycle includes the practice subpage
- Practice state (list + running uid) lives in App; sync init
  pulls practices alongside items/notes
- Subpage transitions end any active practice run
- Add/update/delete/reorder/start/end handlers wired through
  the new PracticePage props

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end verification `[model: sonnet]`

**Files:** none (manual verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts on http://localhost:5173 with no console errors.

- [ ] **Step 2: Verify subpage toggle and Tab cycle**

In the browser at http://localhost:5173:
1. Sign in.
2. Press `2` to switch to the Metronome tab.
3. Confirm three buttons appear in the subpage toggle: Metronome, Sequencer, Practice.
4. Press `Tab` three times: cycles Metronome → Sequencer → Practice → Metronome.
5. Press `Shift+Tab`: cycles in reverse.

- [ ] **Step 3: Create a practice**

1. On the Practice subpage, click "+ Add Practice".
2. Fill in: name "Test 80-100", startBpm 80, endBpm 100, increment 5, bars 2, time signature 4/4, subdivision quarter, sound click.
3. Click Done.
4. Confirm the row appears in the list with the correct summary text.

- [ ] **Step 4: Run the practice**

1. Click Start on the row.
2. Confirm: the run view shows "80", "Step 1/5", "Bar 1/2", play button reads "Start".
3. Click "Start" — audio begins, NoSleep enables, bar counter advances every 2 bars (~3 sec at 80 BPM × 4/4), step advances every 8 beats.
4. Each step transition: the BPM number changes (80 → 85 → 90 → 95 → 100), and the next downbeat is audibly accented.
5. After the last step's bars play out: audio stops, "Practice Complete" appears with a Done button.

- [ ] **Step 5: Pause/resume**

1. Run a new practice (or restart by clicking Done then Start).
2. After a few bars, click Pause. Audio stops; bar/step counter freezes.
3. Click Resume. Audio resumes from the start of the current bar at the same BPM.

- [ ] **Step 6: End mid-practice**

1. During a run, click End.
2. Confirm: audio stops, return to list view.

- [ ] **Step 7: Edit a practice**

1. Click Edit on a row. Modal opens pre-filled.
2. Change a value, click Done. Row updates.
3. Click Edit again, click Delete, confirm. Row disappears.

- [ ] **Step 8: Reorder via drag**

1. With ≥ 2 practices in the list, drag a row's `⋮⋮` handle up or down.
2. Order persists after refresh (`Cmd-R`).

- [ ] **Step 9: Sync to another device / browser**

1. Open the app in a private/incognito window, sign in with the same account.
2. Create a practice in window A → appears in window B within seconds (live subscription).
3. Edit / delete / reorder in A → reflected in B.

- [ ] **Step 10: Subpage transition stops practice**

1. Start a practice (audio playing).
2. Click Sequencer in the subpage toggle. Audio stops. Switch back to Practice — list view is shown (run state cleared).

- [ ] **Step 11: Tab switch keeps practice running**

1. Start a practice.
2. Press `1` to switch to the Practice tab. Audio continues.
3. Press `2` to return. Run view still active in the same step/bar position.

- [ ] **Step 12: Language toggle**

1. Press `C` to switch to Chinese. All practice-mode UI strings are translated.
2. Press `E` to return to English.

- [ ] **Step 13: DB upgrade from v11 to v12**

If possible, install a fresh build that still uses v11, create some data, then upgrade to v12 and verify nothing is lost. (If you don't have v11 build available, skip — the migration body is empty, so the only risk is the new table failing to create, which would show up immediately on `loadData()`.)

- [ ] **Step 14: Final commit (only if any fixups were needed)**

If verification revealed bugs, fix them in additional commits scoped to the relevant area (e.g. `fix(practice-mode): ...`). If everything passed without changes, no final commit is needed.

---

## Self-review notes

- **Spec coverage:** all sections of the spec map to Tasks 1–8: data model → Task 1; UI architecture → Tasks 5/6/7/8; state → Task 8; audio engine integration → Tasks 3 and 6; sync (push/pull/subscribe/flush/order) → Tasks 2 and 8; reorder flow → Tasks 1/2/7/8; i18n → Task 4; keyboard → Task 8; testing checklist → Task 9.
- **Type consistency:** practice fields use camelCase locally (`startBpm`, `bpmIncrement`, `barsPerStep`, `timeSignature`) and snake_case in Firestore docs (`start_bpm`, `bpm_increment`, `bars_per_step`, `time_signature_beats`, `time_signature_note_value`). Mapping is applied symmetrically in `pushPractice` / `pullAllPractices` / `subscribeToChanges`. The `triggerOneShotAccent` name is used consistently across the engine, the run view, and the spec. The engine's actual method names are `setBpm` and `setBeatsPerMeasure` (not `setBPM` / `setTimeSignature`); the plan uses the correct names.
- **DB version:** spec said v11; the codebase is already at v11, so this plan uses v12. Migration body is empty (new table only).
