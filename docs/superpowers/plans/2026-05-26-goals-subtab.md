# Goals Subtab & Multi-Goal History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote practice goals to a first-class **Goals** subtab under Report, with multiple active goals, optional names, cross-device history (synced via a new Dexie `goals` table), and user-pinned banner selection.

**Architecture:** A new Dexie v15 `goals` table mirrors the items/notes sync model (`uid`, `syncedOnce`, enriched offline-queue payloads, `fromCache` bail). Status is computed live from `practiceLogs` — never persisted — so editing `targetHours` re-derives met/missed automatically. A new prop-driven `GoalsPage` subscribes via `Dexie.liveQuery`. Pinning is a synced boolean on the record; UI enforces at most one pinned goal at a time. Legacy `localStorage['drummate_goal']` is migrated once on first run.

**Tech Stack:** React 19, Dexie 4, Firebase Firestore, Tailwind v4, Vitest, react-datepicker.

**Spec:** [docs/superpowers/specs/2026-05-26-goals-subtab-design.md](../specs/2026-05-26-goals-subtab-design.md)

---

## File Map

**New:**
- `src/utils/goalStatus.js` — pure helpers (status, current/history split, expiry selection, legacy migration decisions).
- `src/components/GoalsPage.jsx` — subtab body, two sections (Current + History).
- `tests/goalStatus.test.js` — covers all helpers in `goalStatus.js`.

**Modified:**
- `src/services/database.js` — Dexie v15 + goal helpers.
- `src/services/backends/firebaseBackend.js` — `goalsRef`, `pushGoal`, `deleteGoalRemote`, `pullAllGoals`, `pushAllLocalGoals`, `flushSyncQueue` handlers for `push_goal` / `delete_goal_permanent`, `subscribeToChanges` extended with goals listener, `pushAllLocal` extended.
- `src/App.jsx` — init wiring (migration + auto-archive + pull/push/subscribe), `goals` subpage, render `<GoalsPage />`.
- `src/components/GoalSetupModal.jsx` — add optional `name`, switch from localStorage to Dexie + `pushGoal`.
- `src/components/GoalCard.jsx` — refactor to prop-driven (no localStorage read; takes goal + computed status + handlers).
- `src/components/GoalBanner.jsx` — refactor to `liveQuery` the pinned goal from Dexie.
- `src/components/StatsReport.jsx` — remove `<GoalCard />`.
- `src/contexts/LanguageContext.jsx` — new i18n keys (en + zh).

---

## Task 1: Pure helpers in `goalStatus.js`

**Model:** sonnet

**Files:**
- Create: `src/utils/goalStatus.js`
- Test: `tests/goalStatus.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/goalStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  computeGoalStatus,
  isCurrentGoal,
  isHistoryGoal,
  selectExpiredForArchive,
  shouldMigrateLegacy,
  buildMigratedGoal,
} from '../src/utils/goalStatus.js';

const G = (overrides = {}) => ({
  uid: 'g1',
  name: '',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  targetHours: 10,
  archived: false,
  archivedAt: null,
  pinned: false,
  createdAt: 1000,
  syncedOnce: false,
  ...overrides,
});

const L = (date, durationSeconds) => ({ date, duration: durationSeconds });

describe('computeGoalStatus', () => {
  it('sums log durations within the goal date range', () => {
    const goal = G();
    const logs = [L('2026-01-05', 3600), L('2026-01-20', 7200)];
    const s = computeGoalStatus(goal, logs);
    expect(s.practicedSeconds).toBe(10800);
    expect(s.practicedHours).toBeCloseTo(3.0, 5);
  });

  it('ignores logs outside the range', () => {
    const goal = G({ startDate: '2026-02-01', endDate: '2026-02-28' });
    const logs = [L('2026-01-31', 3600), L('2026-03-01', 3600), L('2026-02-15', 1800)];
    const s = computeGoalStatus(goal, logs);
    expect(s.practicedSeconds).toBe(1800);
  });

  it('met=true when practicedHours >= targetHours', () => {
    const goal = G({ targetHours: 1 });
    const logs = [L('2026-01-10', 3600)];
    expect(computeGoalStatus(goal, logs).met).toBe(true);
  });

  it('met=false when practicedHours < targetHours', () => {
    const goal = G({ targetHours: 5 });
    const logs = [L('2026-01-10', 3600)];
    expect(computeGoalStatus(goal, logs).met).toBe(false);
  });

  it('progressPercent is capped at 100', () => {
    const goal = G({ targetHours: 1 });
    const logs = [L('2026-01-10', 36000)];
    expect(computeGoalStatus(goal, logs).progressPercent).toBe(100);
  });

  it('handles empty logs', () => {
    const s = computeGoalStatus(G(), []);
    expect(s.practicedSeconds).toBe(0);
    expect(s.met).toBe(false);
    expect(s.progressPercent).toBe(0);
  });

  it('editing targetHours upward can flip a met goal to missed', () => {
    const logs = [L('2026-01-10', 3600 * 5)]; // 5 hours
    expect(computeGoalStatus(G({ targetHours: 4 }), logs).met).toBe(true);
    expect(computeGoalStatus(G({ targetHours: 10 }), logs).met).toBe(false);
  });
});

describe('isCurrentGoal / isHistoryGoal', () => {
  it('current: not archived and endDate >= today', () => {
    expect(isCurrentGoal(G({ endDate: '2026-05-26' }), '2026-05-26')).toBe(true);
    expect(isCurrentGoal(G({ endDate: '2026-06-01' }), '2026-05-26')).toBe(true);
    expect(isCurrentGoal(G({ endDate: '2026-05-25' }), '2026-05-26')).toBe(false);
    expect(isCurrentGoal(G({ archived: true, endDate: '2026-06-01' }), '2026-05-26')).toBe(false);
  });

  it('history: archived OR endDate < today', () => {
    expect(isHistoryGoal(G({ archived: true, endDate: '2026-06-01' }), '2026-05-26')).toBe(true);
    expect(isHistoryGoal(G({ archived: false, endDate: '2026-05-25' }), '2026-05-26')).toBe(true);
    expect(isHistoryGoal(G({ archived: false, endDate: '2026-05-26' }), '2026-05-26')).toBe(false);
  });

  it('current and history are mutually exclusive', () => {
    const today = '2026-05-26';
    const samples = [
      G({ archived: false, endDate: '2026-05-25' }),
      G({ archived: false, endDate: '2026-05-26' }),
      G({ archived: true,  endDate: '2026-06-30' }),
    ];
    for (const g of samples) {
      expect(isCurrentGoal(g, today)).not.toBe(isHistoryGoal(g, today));
    }
  });
});

describe('selectExpiredForArchive', () => {
  it('returns only goals with !archived && endDate < today', () => {
    const today = '2026-05-26';
    const goals = [
      G({ uid: 'a', archived: false, endDate: '2026-05-25' }),
      G({ uid: 'b', archived: false, endDate: '2026-05-26' }),
      G({ uid: 'c', archived: true,  endDate: '2026-01-01' }),
      G({ uid: 'd', archived: false, endDate: '2026-06-01' }),
    ];
    const out = selectExpiredForArchive(goals, today);
    expect(out.map(g => g.uid)).toEqual(['a']);
  });

  it('is idempotent — running again finds nothing once flipped', () => {
    const today = '2026-05-26';
    const goals = [G({ archived: true, endDate: '2026-05-25' })];
    expect(selectExpiredForArchive(goals, today)).toEqual([]);
  });
});

describe('shouldMigrateLegacy', () => {
  it('true when Dexie empty AND legacy goal is well-formed', () => {
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":10}')).toBe(true);
  });

  it('false when Dexie already has goals', () => {
    expect(shouldMigrateLegacy(3, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":10}')).toBe(false);
  });

  it('false when legacy is absent', () => {
    expect(shouldMigrateLegacy(0, null)).toBe(false);
    expect(shouldMigrateLegacy(0, '')).toBe(false);
  });

  it('false when legacy JSON is malformed', () => {
    expect(shouldMigrateLegacy(0, 'not json')).toBe(false);
  });

  it('false when legacy is missing required fields', () => {
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01"}')).toBe(false);
    expect(shouldMigrateLegacy(0, '{"endDate":"2026-01-31","targetHours":10}')).toBe(false);
    expect(shouldMigrateLegacy(0, '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":0}')).toBe(false);
  });
});

describe('buildMigratedGoal', () => {
  it('produces a record with required defaults', () => {
    const raw = '{"startDate":"2026-01-01","endDate":"2026-01-31","targetHours":12}';
    const out = buildMigratedGoal(raw, 5000, () => 'fixed-uid');
    expect(out).toEqual({
      uid: 'fixed-uid',
      name: '',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      targetHours: 12,
      archived: false,
      archivedAt: null,
      pinned: true,
      createdAt: 5000,
      syncedOnce: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/goalStatus.test.js`
Expected: FAIL — `Cannot find module '../src/utils/goalStatus.js'`.

- [ ] **Step 3: Create `src/utils/goalStatus.js` with the implementation**

```js
export function computeGoalStatus(goal, logs) {
  let practicedSeconds = 0;
  for (const l of logs) {
    if (!l || !l.date) continue;
    if (l.date >= goal.startDate && l.date <= goal.endDate) {
      practicedSeconds += l.duration || 0;
    }
  }
  const practicedHours = practicedSeconds / 3600;
  const targetHours = goal.targetHours > 0 ? goal.targetHours : 0;
  const progressPercent = targetHours > 0
    ? Math.min(100, (practicedHours / targetHours) * 100)
    : 0;
  const met = targetHours > 0 && practicedHours >= targetHours;
  return { practicedSeconds, practicedHours, progressPercent, met };
}

export function isCurrentGoal(goal, today) {
  return !goal.archived && goal.endDate >= today;
}

export function isHistoryGoal(goal, today) {
  return !!goal.archived || goal.endDate < today;
}

export function selectExpiredForArchive(goals, today) {
  return goals.filter(g => !g.archived && g.endDate < today);
}

function parseLegacy(raw) {
  if (!raw) return null;
  let g;
  try { g = JSON.parse(raw); } catch { return null; }
  if (!g || typeof g !== 'object') return null;
  if (!g.startDate || !g.endDate) return null;
  if (typeof g.targetHours !== 'number' || g.targetHours <= 0) return null;
  return g;
}

export function shouldMigrateLegacy(dexieCount, legacyRaw) {
  if (dexieCount > 0) return false;
  return parseLegacy(legacyRaw) !== null;
}

export function buildMigratedGoal(legacyRaw, nowMs, uuid) {
  const g = parseLegacy(legacyRaw);
  if (!g) return null;
  return {
    uid: uuid(),
    name: '',
    startDate: g.startDate,
    endDate: g.endDate,
    targetHours: g.targetHours,
    archived: false,
    archivedAt: null,
    pinned: true,
    createdAt: nowMs,
    syncedOnce: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/goalStatus.test.js`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/goalStatus.js tests/goalStatus.test.js
git commit -m "$(cat <<'EOF'
feat(goals): add pure helpers for status, lifecycle, and legacy migration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: i18n keys

**Model:** haiku

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add `goals` to the English `reportSubpages` block**

Edit `src/contexts/LanguageContext.jsx`. Find the English `reportSubpages` block (around line 238):

Replace:
```js
    reportSubpages: {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
      stats: 'Stats',
    },
```

With:
```js
    reportSubpages: {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
      stats: 'Stats',
      goals: 'Goals',
    },
```

- [ ] **Step 2: Extend the English `goal` block with new keys**

Find the English `goal` block (around line 337). Replace the closing brace with the new keys added before it. After this step the block should read:

```js
    goal: {
      title: 'Practice Goal',
      setGoal: 'Set Goal',
      editGoal: 'Edit',
      clearGoal: 'Clear',
      noGoal: 'No practice goal set',
      startDate: 'Start Date',
      endDate: 'End Date',
      targetHours: 'Target Hours (e.g. 20)',
      met: 'Goal met!',
      missed: 'Goal missed',
      startsIn: 'Starts in {days} days',
      daysLeft: '{days} days left',
      needPerDay: 'Need {amount}/day',
      errorDates: 'Please enter a start and end date',
      errorDateOrder: 'End date must be after start date',
      errorHours: 'Target hours must be greater than 0',
      optionalName: 'Name (optional)',
      namePlaceholder: 'e.g. Summer grind',
      newGoal: '+ New goal',
      archiveNow: 'Archive now',
      archiveConfirm: 'Archive this goal now? It will move to History.',
      deleteConfirm: 'Permanently delete this goal? This cannot be undone.',
      delete: 'Delete',
      pin: 'Pin to Practice tab',
      unpin: 'Unpin',
      pinned: 'Pinned',
      current: 'Current',
      history: 'History',
      emptyCurrent: 'No active goals. Tap "+ New goal" to start tracking.',
      emptyHistory: 'No past goals yet.',
      statusMet: 'Met',
      statusMissed: 'Missed',
    },
```

- [ ] **Step 3: Add `goals` to the Chinese `reportSubpages` block**

Find the Chinese `reportSubpages` block (around line 616). Replace:
```js
    reportSubpages: {
      daily: '每日',
      weekly: '每周',
      monthly: '每月',
      yearly: '每年',
      stats: '统计',
    },
```

With (verify the existing Chinese strings match; only the trailing `goals` line is new):
```js
    reportSubpages: {
      daily: '每日',
      weekly: '每周',
      monthly: '每月',
      yearly: '每年',
      stats: '统计',
      goals: '目标',
    },
```

If the existing Chinese strings for daily/weekly/monthly/yearly/stats differ from what is shown above, keep the file's existing values and add only the `goals: '目标',` line.

- [ ] **Step 4: Extend the Chinese `goal` block with new keys**

Find the Chinese `goal` block (around line 715). Replace with the existing keys preserved plus new keys appended:

```js
    goal: {
      title: '练习目标',
      setGoal: '设置目标',
      editGoal: '编辑',
      clearGoal: '清除',
      noGoal: '未设置练习目标',
      startDate: '开始日期',
      endDate: '结束日期',
      targetHours: '目标小时（例如 20）',
      met: '目标达成！',
      missed: '目标未达成',
      startsIn: '{days} 天后开始',
      daysLeft: '剩余 {days} 天',
      needPerDay: '每天需要 {amount}',
      errorDates: '请输入开始和结束日期',
      errorDateOrder: '结束日期必须晚于开始日期',
      errorHours: '目标时长必须大于 0',
      optionalName: '名称（可选）',
      namePlaceholder: '例如：夏季冲刺',
      newGoal: '+ 新目标',
      archiveNow: '立即归档',
      archiveConfirm: '现在归档此目标？它将移至历史记录。',
      deleteConfirm: '永久删除此目标？此操作无法撤销。',
      delete: '删除',
      pin: '固定到练习页',
      unpin: '取消固定',
      pinned: '已固定',
      current: '当前目标',
      history: '历史记录',
      emptyCurrent: '没有进行中的目标。点击「+ 新目标」开始追踪。',
      emptyHistory: '尚无历史目标。',
      statusMet: '已达成',
      statusMissed: '未达成',
    },
```

- [ ] **Step 5: Run build to confirm nothing's broken**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "$(cat <<'EOF'
feat(i18n): add Goals subtab and goal-history strings (en, zh)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Dexie v15 schema + goal CRUD helpers

**Model:** sonnet

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Add the v15 schema block**

Open `src/services/database.js`. Immediately after the existing `db.version(14).stores({ ... })` block (which currently ends around line 164 with its `.upgrade(...)` callback closing), append:

```js
// v15 adds the goals table. No .upgrade() body needed — the table is new with nothing to back-fill.
db.version(15).stores({
  practiceItems:      '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs:       '++id, itemId, itemUid, date, duration, uid, loggedAt',
  notes:              '++id, &uid, itemUid, date, trashed',
  metronomePractices: '++id, &uid, sortOrder',
  syncQueue:          '++id, action, collection, localId',
  goals:              '++id, &uid, startDate, endDate, archived, pinned',
});
```

- [ ] **Step 2: Append the goal CRUD helpers at the bottom of `database.js`**

Append (at end of file, after the existing helpers):

```js
// --- Goals ---

export const getAllGoals = async () => {
  return await db.goals.toArray();
};

export const getGoalByUid = async (uid) => {
  return await db.goals.where('uid').equals(uid).first();
};

export const getPinnedGoal = async () => {
  const all = await db.goals.toArray();
  return all.find(g => g.pinned) || null;
};

export const addGoal = async ({ name = '', startDate, endDate, targetHours }) => {
  const uid = crypto.randomUUID();
  const now = Date.now();
  await db.goals.add({
    uid,
    name,
    startDate,
    endDate,
    targetHours,
    archived: false,
    archivedAt: null,
    pinned: false,
    createdAt: now,
    syncedOnce: false,
  });
  return uid;
};

export const insertGoalRecord = async (record) => {
  // Used by legacy-migration to insert an already-built record verbatim.
  await db.goals.add(record);
  return record.uid;
};

export const updateGoal = async (uid, patch) => {
  const local = await db.goals.where('uid').equals(uid).first();
  if (!local) return null;
  const updates = { ...patch, syncedOnce: false };
  // Un-archive on Edit if endDate moves back into the future.
  if (patch.endDate !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    if (patch.endDate >= today && local.archived) {
      updates.archived = false;
      updates.archivedAt = null;
    }
  }
  await db.goals.update(local.id, updates);
  return { ...local, ...updates };
};

export const archiveGoal = async (uid) => {
  const local = await db.goals.where('uid').equals(uid).first();
  if (!local) return null;
  await db.goals.update(local.id, {
    archived: true,
    archivedAt: Date.now(),
    syncedOnce: false,
  });
  return { ...local, archived: true, archivedAt: Date.now(), syncedOnce: false };
};

export const setGoalPinned = async (uid) => {
  // Single transaction: unpin everything, then pin the chosen one. Returns the
  // list of goals whose pinned field changed, so the caller can push them.
  const changed = [];
  await db.transaction('rw', db.goals, async () => {
    const all = await db.goals.toArray();
    for (const g of all) {
      if (g.uid === uid) {
        if (!g.pinned) {
          await db.goals.update(g.id, { pinned: true, syncedOnce: false });
          changed.push({ ...g, pinned: true, syncedOnce: false });
        }
      } else if (g.pinned) {
        await db.goals.update(g.id, { pinned: false, syncedOnce: false });
        changed.push({ ...g, pinned: false, syncedOnce: false });
      }
    }
  });
  return changed;
};

export const unpinGoal = async (uid) => {
  const local = await db.goals.where('uid').equals(uid).first();
  if (!local || !local.pinned) return null;
  await db.goals.update(local.id, { pinned: false, syncedOnce: false });
  return { ...local, pinned: false, syncedOnce: false };
};

export const deleteGoalLocal = async (uid) => {
  const local = await db.goals.where('uid').equals(uid).first();
  if (!local) return null;
  await db.goals.delete(local.id);
  return local;
};
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds (no type/import errors).

- [ ] **Step 4: Run the existing test suite**

Run: `npm run test`
Expected: all tests pass (no DB-touching tests should break — the schema bump is additive).

- [ ] **Step 5: Commit**

```bash
git add src/services/database.js
git commit -m "$(cat <<'EOF'
feat(db): bump to v15 with goals table and CRUD helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `firebaseBackend.js` — pull, push, delete, queue handlers

**Model:** sonnet

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Add the `goalsRef` helper**

Find the existing `practicesRef` helper (around line 48–51). Immediately after it, add:

```js
function goalsRef(userId) {
  if (!userId) throw new Error('goalsRef requires userId');
  return collection(firestore, 'users', userId, 'goals');
}
```

- [ ] **Step 2: Add `pushGoal` after `pushPractice` block**

Locate the `pushPractice` method (around line 272). After its closing brace and comma, add the following before the next method:

```js
  async pushGoal(localGoal, userId) {
    if (!localGoal.uid) {
      console.error('pushGoal: missing uid', localGoal);
      return;
    }
    const enrichedGoalPayload = () => ({
      uid: localGoal.uid,
      name: localGoal.name ?? '',
      startDate: localGoal.startDate,
      endDate: localGoal.endDate,
      targetHours: localGoal.targetHours,
      archived: !!localGoal.archived,
      archivedAt: localGoal.archivedAt ?? null,
      pinned: !!localGoal.pinned,
      createdAt: localGoal.createdAt || 0,
    });
    if (getOfflineMode()) {
      await queueSync('push_goal', enrichedGoalPayload());
      return;
    }
    try {
      await setDoc(doc(goalsRef(userId), localGoal.uid), {
        uid: localGoal.uid,
        name: localGoal.name ?? '',
        start_date: localGoal.startDate,
        end_date: localGoal.endDate,
        target_hours: localGoal.targetHours,
        archived: !!localGoal.archived,
        archived_at: localGoal.archivedAt ?? null,
        pinned: !!localGoal.pinned,
        created_at: localGoal.createdAt || 0,
        updated_at: serverTimestamp(),
      }, { merge: true });

      if (localGoal.id != null && !localGoal.syncedOnce) {
        await db.goals.update(localGoal.id, { syncedOnce: true });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('push_goal', enrichedGoalPayload());
      } else {
        throw err;
      }
    }
  },

  async deleteGoalRemote(goalUid, userId) {
    if (getOfflineMode()) {
      await queueSync('delete_goal_permanent', { uid: goalUid });
      return;
    }
    try {
      await deleteDoc(doc(goalsRef(userId), goalUid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_goal_permanent', { uid: goalUid });
      } else {
        throw err;
      }
    }
  },
```

- [ ] **Step 3: Add `pullAllGoals` after `pullAllPractices`**

Locate `pullAllPractices` (around line 810). After its closing brace and comma, add:

```js
  async pullAllGoals(userId) {
    const snap = await getDocs(goalsRef(userId));
    if (snap.metadata.fromCache) {
      // Cached/offline snapshot — skip reconciliation to avoid false deletions.
      return;
    }
    const remoteUids = new Set();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      remoteUids.add(data.uid);

      const fields = {
        uid: data.uid,
        name: data.name ?? '',
        startDate: data.start_date,
        endDate: data.end_date,
        targetHours: data.target_hours,
        archived: !!data.archived,
        archivedAt: data.archived_at ?? null,
        pinned: !!data.pinned,
        createdAt: data.created_at || 0,
        syncedOnce: true,
      };

      const local = await db.goals.where('uid').equals(data.uid).first();
      if (!local) {
        await db.goals.add(fields);
      } else {
        const updates = {};
        for (const k of ['name', 'startDate', 'endDate', 'targetHours',
                         'archived', 'archivedAt', 'pinned', 'createdAt']) {
          if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
        }
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.goals.update(local.id, updates);
        }
      }
    }

    // Reconcile deletes: a local goal that synced before but is missing
    // remotely was deleted on another device.
    const allLocal = await db.goals.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.goals.delete(local.id);
      }
    }
  },
```

- [ ] **Step 4: Add `pushAllLocalGoals` after `pushAllLocalPractices`**

Locate `pushAllLocalPractices` (around line 887). After its closing brace and comma, add:

```js
  async pushAllLocalGoals(userId) {
    if (getOfflineMode()) return;
    const goals = await db.goals.toArray();
    await Promise.all(
      goals
        .filter((g) => g.uid && !g.syncedOnce)
        .map((g) => firebaseBackend.pushGoal(g, userId)),
    );
  },
```

- [ ] **Step 5: Wire goals into `pushAllLocal`**

Locate `pushAllLocal` (around line 897). Inside the body, find the trailing `Promise.all([...])` block that pushes logs, notes, and practices. Add `firebaseBackend.pushAllLocalGoals(userId)` to that array:

```js
    await Promise.all([
      Promise.all(logs.filter((l) => !l.syncedOnce).map((log) => firebaseBackend.pushLog(log, userId))),
      firebaseBackend.pushAllLocalNotes(userId),
      firebaseBackend.pushAllLocalPractices(userId),
      firebaseBackend.pushAllLocalGoals(userId),
    ]);
```

- [ ] **Step 6: Add `flushSyncQueue` handlers for `push_goal` and `delete_goal_permanent`**

Locate `flushSyncQueue` (around line 922). Find the chain of `else if (entry.action === ...)` branches. After the `reorder_practices` branch (the final branch today, around line 1061–1069), add **before** the closing `}` that wraps the `try` block:

```js
        } else if (entry.action === 'push_goal') {
          // Push from payload (not from local Dexie) — pullAllGoals earlier
          // in init may have overwritten the offline edit back to cloud's
          // prior state. The payload carries the user's actual intent.
          const p = entry.payload;
          if (p.uid && p.startDate && p.endDate && p.targetHours !== undefined) {
            await setDoc(doc(goalsRef(userId), p.uid), {
              uid: p.uid,
              name: p.name ?? '',
              start_date: p.startDate,
              end_date: p.endDate,
              target_hours: p.targetHours,
              archived: !!p.archived,
              archived_at: p.archivedAt ?? null,
              pinned: !!p.pinned,
              created_at: p.createdAt || 0,
              updated_at: serverTimestamp(),
            }, { merge: true });
            const localGoal = await db.goals.where('uid').equals(p.uid).first();
            if (localGoal) {
              await db.goals.update(localGoal.id, {
                name: p.name ?? '',
                startDate: p.startDate,
                endDate: p.endDate,
                targetHours: p.targetHours,
                archived: !!p.archived,
                archivedAt: p.archivedAt ?? null,
                pinned: !!p.pinned,
                createdAt: p.createdAt || localGoal.createdAt || 0,
                syncedOnce: true,
              });
            }
          } else {
            // Legacy minimal payload — fall back to re-reading local.
            const local = await db.goals.where('uid').equals(p.uid).first();
            if (local) await firebaseBackend.pushGoal(local, userId);
          }
        } else if (entry.action === 'delete_goal_permanent') {
          await firebaseBackend.deleteGoalRemote(entry.payload.uid, userId);
          const local = await db.goals.where('uid').equals(entry.payload.uid).first();
          if (local) await db.goals.delete(local.id);
```

- [ ] **Step 7: Extend `subscribeToChanges` with a goals listener**

Locate `subscribeToChanges` (around line 1079). After the `unsubPractices = onSnapshot(...)` block (around line 1259–1314), add another listener:

```js
    const unsubGoals = onSnapshot(goalsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (!data.uid) continue;

        const buildFields = () => ({
          uid: data.uid,
          name: data.name ?? '',
          startDate: data.start_date,
          endDate: data.end_date,
          targetHours: data.target_hours,
          archived: !!data.archived,
          archivedAt: data.archived_at ?? null,
          pinned: !!data.pinned,
          createdAt: data.created_at || 0,
          syncedOnce: true,
        });

        // Combined added/modified handling — Firestore's initial snapshot
        // reports our own writes as 'added', so a separate 'added' branch
        // would skip reconciling field updates from queued push_goal replays.
        if (change.type === 'added' || change.type === 'modified') {
          const local = await db.goals.where('uid').equals(data.uid).first();
          if (!local) {
            await db.goals.add(buildFields());
            onDataChanged();
          } else {
            const fields = buildFields();
            const updates = {};
            for (const k of ['name', 'startDate', 'endDate', 'targetHours',
                             'archived', 'archivedAt', 'pinned', 'createdAt']) {
              if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
            }
            if (!local.syncedOnce) updates.syncedOnce = true;
            if (Object.keys(updates).length > 0) {
              await db.goals.update(local.id, updates);
              onDataChanged();
            }
          }
        } else if (change.type === 'removed') {
          const existing = await db.goals.where('uid').equals(data.uid).first();
          if (existing) {
            await db.goals.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });
```

Then find the existing return statement at the end of `subscribeToChanges` that returns the unsubscribe function. It currently looks like:

```js
    return () => {
      unsubItems();
      unsubLogs();
      unsubNotes();
      unsubPractices();
    };
```

Add `unsubGoals();` to the body:

```js
    return () => {
      unsubItems();
      unsubLogs();
      unsubNotes();
      unsubPractices();
      unsubGoals();
    };
```

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Run the existing test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "$(cat <<'EOF'
feat(sync): pull, push, delete, queue, and subscribe for goals collection

Mirrors the notes/practices sync model exactly: fromCache bail in
pullAllGoals, syncedOnce filter in pushAllLocalGoals, enriched offline
payloads for push_goal/delete_goal_permanent, and added/modified
handled identically in the live listener.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refactor `GoalSetupModal.jsx` — name field + Dexie

**Model:** sonnet

**Files:**
- Modify: `src/components/GoalSetupModal.jsx`

- [ ] **Step 1: Replace the entire file with the new implementation**

Overwrite `src/components/GoalSetupModal.jsx` with:

```jsx
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';

const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null);
const fromPickerDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function GoalSetupModal({ isOpen, onClose, onSave, goal }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (goal) {
      setName(goal.name || '');
      setStartDate(goal.startDate);
      setEndDate(goal.endDate);
      setTargetHours(String(goal.targetHours));
    } else {
      setName('');
      setStartDate(getTodayString());
      setEndDate('');
      setTargetHours('');
    }
    setError('');
  }, [isOpen, goal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!startDate || !endDate) { setError(t('goal.errorDates')); return; }
    if (startDate >= endDate) { setError(t('goal.errorDateOrder')); return; }
    const hours = parseFloat(targetHours);
    if (isNaN(hours) || hours <= 0) { setError(t('goal.errorHours')); return; }
    const trimmedName = name.trim();
    try {
      await onSave({
        uid: goal?.uid,
        name: trimmedName,
        startDate,
        endDate,
        targetHours: hours,
      });
      onClose();
    } catch (err) {
      console.error('GoalSetupModal save failed:', err);
      setError(String(err?.message || err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">{t('goal.title')}</h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.optionalName')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('goal.namePlaceholder')}
            maxLength={80}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.startDate')}</span>
          <DatePicker
            selected={toPickerDate(startDate)}
            onChange={(d) => { setStartDate(fromPickerDate(d)); setError(''); }}
            dateFormat="MM/dd/yyyy"
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
            wrapperClassName="w-full"
            popperProps={{ strategy: 'fixed' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.endDate')}</span>
          <DatePicker
            selected={toPickerDate(endDate)}
            onChange={(d) => { setEndDate(fromPickerDate(d)); setError(''); }}
            dateFormat="MM/dd/yyyy"
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
            wrapperClassName="w-full"
            popperProps={{ strategy: 'fixed' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.targetHours')}</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={targetHours}
            onChange={(e) => { setTargetHours(e.target.value); setError(''); }}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 dark:bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoalSetupModal;
```

Note: this modal no longer touches localStorage. The caller (`GoalsPage`) passes an `onSave({ uid, name, startDate, endDate, targetHours })` handler that does the Dexie write and Firestore push. `uid` is `undefined` for new goals (modal opens without preset) and present for edits.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds. (Pre-existing `GoalCard` still imports `GoalSetupModal` with the old `() => {}` `onSave` signature — that will be fixed in Task 6.)

If the build fails because `GoalCard` calls `onSave()` with no arguments, that's expected — Task 6 fixes it. Proceed to commit anyway only if the build error is localized to `GoalCard.jsx`. Otherwise debug.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalSetupModal.jsx
git commit -m "$(cat <<'EOF'
refactor(goal): GoalSetupModal accepts onSave({uid, name, ...}) payload

Adds optional name field. Drops localStorage write — caller now owns
persistence (Dexie + Firestore push happens in GoalsPage handler).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refactor `GoalCard.jsx` — prop-driven

**Model:** sonnet

**Files:**
- Modify: `src/components/GoalCard.jsx`

- [ ] **Step 1: Replace the entire file**

Overwrite `src/components/GoalCard.jsx` with:

```jsx
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { computeGoalStatus } from '../utils/goalStatus';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function formatRequired(hoursPerDay, t) {
  if (hoursPerDay <= 0) return t('goal.met');
  if (hoursPerDay < 1) return `${(hoursPerDay * 60).toFixed(2)} ${t('minutes')}`;
  return `${hoursPerDay.toFixed(1)} ${t('hours')}`;
}

function GoalCard({
  goal,
  logs,
  variant = 'current',          // 'current' | 'history'
  onEdit,
  onPin,
  onArchive,
  onDelete,
  compactMode = false,
}) {
  const { t } = useLanguage();
  const today = getTodayString();
  const status = computeGoalStatus(goal, logs);
  const { practicedHours, progressPercent, met } = status;

  const expired = today > goal.endDate;
  const notStarted = today < goal.startDate;
  const totalDays = dateDiffDays(goal.startDate, goal.endDate) + 1;
  const remainingHours = Math.max(0, goal.targetHours - practicedHours);

  let statusText = '';
  let requiredText = '';

  if (notStarted) {
    const daysUntilStart = dateDiffDays(today, goal.startDate);
    statusText = t('goal.startsIn', { days: daysUntilStart });
    const perDay = goal.targetHours / totalDays;
    requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
  } else if (expired || variant === 'history') {
    statusText = met ? t('goal.statusMet') : t('goal.statusMissed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    statusText = t('goal.daysLeft', { days: daysLeft });
    if (met) {
      requiredText = t('goal.met');
    } else {
      const perDay = remainingHours / daysLeft;
      requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
    }
  }

  const padding = compactMode ? 'p-3' : 'p-4';
  const gap = compactMode ? 'gap-2' : 'gap-3';
  const radius = compactMode ? 'rounded-md' : 'rounded-lg';

  const canArchiveNow = variant === 'current' && !goal.archived && today >= goal.startDate;
  const headerLabel = goal.name?.trim()
    ? goal.name.trim()
    : `${goal.startDate} – ${goal.endDate}`;

  return (
    <div className={`bg-white dark:bg-slate-800 ${radius} shadow-sm ${padding} flex flex-col ${gap}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onPin && (
            <button
              type="button"
              onClick={() => onPin(goal)}
              title={goal.pinned ? t('goal.unpin') : t('goal.pin')}
              aria-label={goal.pinned ? t('goal.unpin') : t('goal.pin')}
              className={`text-base shrink-0 ${goal.pinned ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}
            >
              {goal.pinned ? '📌' : '📍'}
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
              {headerLabel}
            </span>
            {goal.name?.trim() && (
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {goal.startDate} – {goal.endDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          {onEdit && (
            <button onClick={() => onEdit(goal)} className="text-xs text-blue-600 dark:text-indigo-600 hover:underline">
              {t('goal.editGoal')}
            </button>
          )}
          {canArchiveNow && onArchive && (
            <button onClick={() => onArchive(goal)} className="text-xs text-amber-600 hover:underline">
              {t('goal.archiveNow')}
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(goal)} className="text-xs text-red-500 hover:underline">
              {t('goal.delete')}
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500 dark:bg-indigo-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
        <span>
          {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
        </span>
        <span className={met ? 'text-green-600 font-medium' : ''}>
          {statusText}
        </span>
      </div>

      {requiredText && (
        <div className="text-xs text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-700 pt-2">
          {requiredText}
        </div>
      )}
    </div>
  );
}

export default GoalCard;
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds.

If `StatsReport.jsx` still passes the old (no-prop) signature to `GoalCard`, the build may pass but the runtime would crash on Stats tab. We will remove that render entirely in Task 9 — for now the Stats subtab will display a broken GoalCard until Task 9. Acceptable interim.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalCard.jsx
git commit -m "$(cat <<'EOF'
refactor(goal): GoalCard is now prop-driven (goal, logs, handlers)

Reads no localStorage. Status computed via computeGoalStatus from
goalStatus.js. Adds pin / archive-now / delete affordances controlled
by handler presence; name (when set) shown as header.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Refactor `GoalBanner.jsx` — liveQuery pinned goal

**Model:** sonnet

**Files:**
- Modify: `src/components/GoalBanner.jsx`

- [ ] **Step 1: Replace the entire file**

Overwrite `src/components/GoalBanner.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { db, getLogsByDateRange } from '../services/database';
import { computeGoalStatus } from '../utils/goalStatus';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function GoalBanner() {
  const { t } = useLanguage();
  const [goal, setGoal] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.goals.toArray()).subscribe({
      next: (all) => setGoal(all.find(g => g.pinned) || null),
      error: (err) => console.error('GoalBanner liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!goal) { setLogs([]); return; }
    let cancelled = false;
    (async () => {
      const rangeLogs = await getLogsByDateRange(goal.startDate, goal.endDate);
      if (!cancelled) setLogs(rangeLogs);
    })();
    return () => { cancelled = true; };
  }, [goal]);

  if (!goal) return null;

  const today = getTodayString();
  const expired = today > goal.endDate;
  const { practicedHours, progressPercent, met } = computeGoalStatus(goal, logs);

  let rightText = '';
  if (met) {
    rightText = t('goal.met');
  } else if (expired) {
    rightText = t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    const remainingHours = Math.max(0, goal.targetHours - practicedHours);
    const perDay = remainingHours / daysLeft;
    const amount = perDay < 1
      ? `${(perDay * 60).toFixed(2)} ${t('minutes')}`
      : `${perDay.toFixed(1)} ${t('hours')}`;
    rightText = t('goal.needPerDay', { amount });
  }

  const headerLabel = goal.name?.trim() || t('goal.title');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
        <span className="truncate">
          {headerLabel}: {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
        </span>
        <span className={met ? 'text-green-600 font-medium shrink-0 ml-2' : 'shrink-0 ml-2'}>
          {rightText}
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500 dark:bg-indigo-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export default GoalBanner;
```

The `refreshKey` prop is no longer required (liveQuery handles refresh). Existing callers may still pass it — that's a benign extra prop.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalBanner.jsx
git commit -m "$(cat <<'EOF'
refactor(goal): GoalBanner subscribes to the pinned Dexie goal

Replaces the single localStorage record read with a liveQuery over
db.goals filtered to pinned: true. Returns null silently when nothing
is pinned.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create `GoalsPage.jsx`

**Model:** sonnet

**Files:**
- Create: `src/components/GoalsPage.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/GoalsPage.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import {
  db,
  addGoal,
  updateGoal,
  archiveGoal,
  setGoalPinned,
  deleteGoalLocal,
  getGoalByUid,
} from '../services/database';
import { isCurrentGoal, isHistoryGoal } from '../utils/goalStatus';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import GoalCard from './GoalCard';
import GoalSetupModal from './GoalSetupModal';

function GoalsPage({ compactMode = false }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const backend = useBackend();
  const [goals, setGoals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const sub = liveQuery(() => db.goals.toArray()).subscribe({
      next: (all) => setGoals(all),
      error: (err) => console.error('GoalsPage goals liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.practiceLogs.toArray()).subscribe({
      next: (all) => setLogs(all),
      error: (err) => console.error('GoalsPage logs liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  const today = getTodayString();

  const { currentGoals, historyGoals } = useMemo(() => {
    const current = goals.filter(g => isCurrentGoal(g, today));
    const history = goals.filter(g => isHistoryGoal(g, today));
    // Current: pinned first, then by endDate asc, then createdAt asc.
    current.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.endDate !== b.endDate) return a.endDate < b.endDate ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    // History: by endDate desc.
    history.sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0));
    return { currentGoals: current, historyGoals: history };
  }, [goals, today]);

  const pushOne = async (goalUid) => {
    if (!user) return;
    const fresh = await getGoalByUid(goalUid);
    if (fresh) await backend.pushGoal(fresh, user.id);
  };

  const handleSave = async (payload) => {
    let uid = payload.uid;
    if (uid) {
      await updateGoal(uid, {
        name: payload.name,
        startDate: payload.startDate,
        endDate: payload.endDate,
        targetHours: payload.targetHours,
      });
    } else {
      uid = await addGoal({
        name: payload.name,
        startDate: payload.startDate,
        endDate: payload.endDate,
        targetHours: payload.targetHours,
      });
    }
    await pushOne(uid);
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingGoal(null);
    setShowModal(true);
  };

  const handlePin = async (goal) => {
    const changed = await setGoalPinned(goal.uid);
    if (!user) return;
    for (const g of changed) {
      const fresh = await getGoalByUid(g.uid);
      if (fresh) await backend.pushGoal(fresh, user.id);
    }
  };

  const handleArchive = async (goal) => {
    if (!window.confirm(t('goal.archiveConfirm'))) return;
    await archiveGoal(goal.uid);
    await pushOne(goal.uid);
  };

  const handleDelete = async (goal) => {
    if (!window.confirm(t('goal.deleteConfirm'))) return;
    await deleteGoalLocal(goal.uid);
    if (user) await backend.deleteGoalRemote(goal.uid, user.id);
  };

  const sectionGap = compactMode ? 'gap-2' : 'gap-3';
  const wrapperGap = compactMode ? 'gap-3' : 'gap-4';

  return (
    <div className={`flex flex-col ${wrapperGap}`}>
      {/* Current section */}
      <section className={`flex flex-col ${sectionGap}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('goal.current')}</h3>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 bg-blue-600 dark:bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors"
          >
            {t('goal.newGoal')}
          </button>
        </div>
        {currentGoals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 text-sm text-gray-500 dark:text-slate-400">
            {t('goal.emptyCurrent')}
          </div>
        ) : (
          currentGoals.map(g => (
            <GoalCard
              key={g.uid}
              goal={g}
              logs={logs}
              variant="current"
              onEdit={handleEdit}
              onPin={handlePin}
              onArchive={handleArchive}
              onDelete={handleDelete}
              compactMode={compactMode}
            />
          ))
        )}
      </section>

      {/* History section */}
      <section className={`flex flex-col ${sectionGap}`}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('goal.history')}</h3>
        {historyGoals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 text-sm text-gray-500 dark:text-slate-400">
            {t('goal.emptyHistory')}
          </div>
        ) : (
          historyGoals.map(g => (
            <GoalCard
              key={g.uid}
              goal={g}
              logs={logs}
              variant="history"
              onEdit={handleEdit}
              onPin={handlePin}
              onDelete={handleDelete}
              compactMode={compactMode}
            />
          ))
        )}
      </section>

      <GoalSetupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        goal={editingGoal}
      />
    </div>
  );
}

export default GoalsPage;
```

- [ ] **Step 2: Verify the imports for AuthContext and BackendContext exist**

Run: `grep -n "export.*useAuth\|export.*useBackend" src/contexts/*.jsx`
Expected: both hooks exported. If `useAuth` lives elsewhere (e.g., the AuthContext module exports a `useAuth` directly), adjust the imports accordingly. If `useBackend` is not a hook, replace it with the direct module import:

```js
import { firebaseBackend as backendDefault } from '../services/backends/firebaseBackend';
```

…and substitute `backend` references with `backendDefault`. The rest of the file structure is unchanged.

If neither hook exists, fall back to importing `firebaseBackend` directly and reading the user via the existing `useAuth` hook — check `src/contexts/AuthContext.jsx` for the exact named export.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalsPage.jsx
git commit -m "$(cat <<'EOF'
feat(goals): add GoalsPage with Current and History sections

LiveQuery subscriptions on db.goals and db.practiceLogs drive a
prop-driven render. Pin / archive / edit / delete handlers wire through
Dexie helpers and Firestore backend.pushGoal / deleteGoalRemote.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire into `App.jsx` + remove GoalCard from StatsReport

**Model:** sonnet

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/StatsReport.jsx`

- [ ] **Step 1: Strip the GoalCard from StatsReport**

Open `src/components/StatsReport.jsx`. Remove the `import GoalCard from './GoalCard';` line near the top. Remove the `<GoalCard />` element from the render output. (It is currently rendered above the sections — search for `<GoalCard` and delete that line.)

- [ ] **Step 2: Import the new pieces in `App.jsx`**

Open `src/App.jsx`. Near the existing component imports (around the top of the file), add:

```js
import GoalsPage from './components/GoalsPage';
```

Add a helper-imports line for the Dexie + migration utilities (find an existing similar import block — likely the line that imports from `./services/database`):

```js
import { db, insertGoalRecord, archiveGoal, getGoalByUid } from './services/database';
import { shouldMigrateLegacy, buildMigratedGoal, selectExpiredForArchive } from './utils/goalStatus';
import { getTodayString } from './utils/dateHelpers';
```

(If `db` is already imported from `./services/database`, do not duplicate; instead append the new named exports to the existing import.)

- [ ] **Step 3: Add `goals` to the report subpage list**

Find the line (around 1772):

```js
                {['daily', 'weekly', 'monthly', 'yearly', 'stats'].map((page) => (
```

Replace with:

```js
                {['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'].map((page) => (
```

- [ ] **Step 4: Render `<GoalsPage />` when the goals subpage is active**

Locate the existing `{reportSubpage === 'stats' && ( ... )}` block (around line 1842). Immediately after its closing `)}`, append:

```jsx
              {reportSubpage === 'goals' && (
                <GoalsPage compactMode={compactMode} />
              )}
```

- [ ] **Step 5: Also update the `pages` array in any keyboard-shortcut cycling code**

Find the line (around 1499) that reads:

```js
          const pages = ['daily', 'weekly', 'monthly', 'yearly', 'stats'];
```

Replace with:

```js
          const pages = ['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'];
```

- [ ] **Step 6: Update the date-step keyboard handler so `goals` is a no-op**

In the same handler block (around line 1517–1540), the existing `if (subpage === 'daily') { ... } else if (subpage === 'weekly') { ... } ...` chain handles date stepping for each subpage. Confirm there is no branch for `'stats'` — Goals will inherit the same "no-op" behavior automatically. No change required.

- [ ] **Step 7: Add migration helper + auto-archive helper inside the `init` function**

Find the existing `init = async () => { ... }` function (around line 445). Immediately after the existing `await Promise.all([ initTimezone, initPriorHours, pullAll, pullAllNotes, pullAllPractices ])` block, modify the Promise.all to include `pullAllGoals`:

Before:
```js
        await Promise.all([
          initTimezone(firebaseBackend, user.id),
          initPriorHours(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
          firebaseBackend.pullAllPractices(user.id),
        ]);
```

After:
```js
        await Promise.all([
          initTimezone(firebaseBackend, user.id),
          initPriorHours(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
          firebaseBackend.pullAllPractices(user.id),
          firebaseBackend.pullAllGoals(user.id),
        ]);
```

- [ ] **Step 8: Insert migration + auto-archive between pulls and flushSyncQueue**

After the `if (getOfflineMode()) return;` guard that follows the Promise.all (around line 474), and BEFORE `await firebaseBackend.flushSyncQueue(user.id);`, insert:

```js
        // One-shot legacy migration: if Dexie has no goals AND localStorage
        // has a single goal from the pre-v15 schema, promote it.
        const dexieCount = await db.goals.count();
        const legacyRaw = localStorage.getItem('drummate_goal');
        if (shouldMigrateLegacy(dexieCount, legacyRaw)) {
          const record = buildMigratedGoal(legacyRaw, Date.now(), () => crypto.randomUUID());
          if (record) {
            await insertGoalRecord(record);
            // pushAllLocalGoals below will push it to cloud.
          }
        }
        if (legacyRaw) localStorage.removeItem('drummate_goal');
```

- [ ] **Step 9: Add auto-archive pass after pushAllLocal**

Immediately AFTER `await firebaseBackend.pushAllLocal(user.id);` (still inside the `try` block, around line 483), insert:

```js
        // Auto-archive any expired goals. Runs after pushAllLocal so the
        // archive-flip writes use the normal push path (no race with pull
        // reconciliation).
        const today = getTodayString();
        const allGoals = await db.goals.toArray();
        const expired = selectExpiredForArchive(allGoals, today);
        for (const g of expired) {
          await archiveGoal(g.uid);
          const fresh = await getGoalByUid(g.uid);
          if (fresh) await firebaseBackend.pushGoal(fresh, user.id);
        }
```

- [ ] **Step 10: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 11: Run the test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx src/components/StatsReport.jsx
git commit -m "$(cat <<'EOF'
feat(goals): wire Goals subtab + init migration + auto-archive

Adds 'goals' to report subpages and renders GoalsPage. Init flow now
pulls goals in parallel, migrates the legacy localStorage goal once,
runs an auto-archive pass after pushAllLocal so expired goals move to
History on every app load. Removes the now-orphan GoalCard from
StatsReport.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Manual smoke test + final build

**Model:** sonnet

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds without errors.

- [ ] **Step 3: Start the dev server in the background**

Run (in background): `npm run dev`
Wait for the dev server to print `Local: http://localhost:5173`.

- [ ] **Step 4: Walk through the manual checklist in the browser**

Open `http://localhost:5173`. Verify the following, recording observations:

1. **Migration:** sign in as an existing user whose Dexie was populated under v14. The legacy `drummate_goal` (if present) should appear as a single pinned goal in the new Goals subtab. `localStorage['drummate_goal']` should be gone.
2. **Goals subtab loads:** click Report → Goals. Current and History sections render. Empty state copy shows when appropriate.
3. **Create:** click "+ New goal" → modal opens → fill name + dates + hours → save. New row appears in Current. The row is unpinned by default unless it's the first goal.
4. **Pin toggle:** clicking the pin on an unpinned active goal pins it, unpins any previously pinned goal, and updates the Practice tab banner immediately.
5. **Edit:** open an active goal → change target hours → save. Progress bar recomputes. Open an archived (history) goal → change target hours → status badge flips between Met/Missed accordingly.
6. **Archive now:** archive an active goal → confirm → row moves to History. The pin (if it was on this goal) stays — the banner now shows the archived pinned goal (acceptable, banner respects user's choice).
7. **Delete:** delete a history row → confirm → row disappears locally and remotely.
8. **Auto-archive on load:** create a goal with `endDate` in the past, reload, verify it lands in History with `archived: true`.
9. **Stats subtab:** confirm GoalCard is no longer rendered there.
10. **Compact mode:** toggle Compact Mode in settings → GoalsPage and GoalCard tighten their padding/gaps/radii.
11. **Language toggle:** switch to Chinese → all new strings render correctly.
12. **Sync:** open the app on a second logged-in device/browser → the goals + pin state appears within a few seconds.
13. **Offline mode:** in DevTools, go offline → create a new goal → pending count in the offline banner ticks up → go online → goal syncs through.

Capture any failing behaviors and fix them inline before proceeding. If a fix requires touching the spec or design assumptions, stop and raise the issue.

- [ ] **Step 5: Stop the dev server**

Stop the background `npm run dev` process.

- [ ] **Step 6: Final lint pass**

Run: `npm run lint`
Expected: no new lint errors introduced. Fix any that are new.

- [ ] **Step 7: Commit any incidental fixes from the smoke pass**

If any fixes were required in Step 4 or Step 6, stage and commit them with a focused message (e.g., `fix(goals): ...`).

If nothing changed, skip this step.

---

## Self-Review

**Spec coverage:**

- New `goals` subtab under Report — Task 9 (subpages list + render).
- Multiple active goals — Tasks 3, 8 (no single-goal constraint in helpers or UI).
- Optional `name` field — Task 5 (modal input), Task 6 (header rendering).
- History persistence + edit + permanent delete — Tasks 6 (UI), 8 (handlers), 9 (auto-archive into history).
- Cross-device sync (Dexie + Firestore mirror) — Tasks 3, 4.
- Pinning syncs across devices, single pin enforced — Tasks 3 (`setGoalPinned` transaction), 4 (push of pin flips), 8 (handler).
- Status computed from logs, recomputes on field edit — Task 1 (`computeGoalStatus`).
- Auto-archive on expiry + manual archive — Task 9 (init pass), Task 8 (handler).
- Legacy migration one-shot, idempotent — Task 1 (`shouldMigrateLegacy` / `buildMigratedGoal`), Task 9 (init wiring).
- Compact mode honored — Tasks 6, 8.
- i18n keys (en + zh) — Task 2.
- `fromCache` bail, `syncedOnce` filter, enriched payloads, identical added/modified handling — all in Task 4.

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague directives. Every step has full code or an exact command. Task 8 Step 2 has a fallback path described concretely (named import name to grep for) rather than vague language.

**Type consistency:** `computeGoalStatus`, `isCurrentGoal`, `isHistoryGoal`, `selectExpiredForArchive`, `shouldMigrateLegacy`, `buildMigratedGoal` — same signatures across the helpers, tests, and consumers. Goal record shape (`uid`, `name`, `startDate`, `endDate`, `targetHours`, `archived`, `archivedAt`, `pinned`, `createdAt`, `syncedOnce`) is identical in Dexie schema (Task 3), `buildMigratedGoal` (Task 1), `pushGoal` payload (Task 4), `pullAllGoals` mapping (Task 4), `subscribeToChanges` mapping (Task 4), and `flushSyncQueue` push_goal handler (Task 4). Firestore wire-format uses snake_case (`start_date`, `end_date`, `target_hours`, `archived_at`, `created_at`) mapped consistently in both directions.

**Out-of-scope guardrails:** No goal templates, no per-item goals, no notifications, no multi-goal banner aggregation. Matches the spec's "Out of scope" section.
