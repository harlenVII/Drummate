# Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, session-scoped offline mode that lets the user dismiss the blocking sync overlay, work fully against Dexie (with writes queued to `syncQueue`), and inspect pending changes via a banner + modal — while also fixing the destructive `pullAll` deletion-reconciliation loop that wipes local items when `getDocs` returns a cached/offline snapshot.

**Architecture:** Module-level `offlineService` holds an in-memory boolean. `firebaseBackend.js` pull functions guard their deletion-reconciliation loops with `snap.metadata.fromCache`. Push functions check `getOfflineMode()` and short-circuit to `syncQueue` with enriched display payloads. `App.jsx` owns the React state, the sync-overlay button, the banner, and the modal. Pending count + list are reactive via `Dexie.liveQuery`. Spec: [docs/superpowers/specs/2026-05-18-offline-mode-design.md](../specs/2026-05-18-offline-mode-design.md).

**Tech Stack:** React 19, Dexie 4.3 (with built-in `liveQuery`), Firebase Web SDK, Tailwind v4, Vitest (Node env) for unit tests.

---

### Task 1: Fix data-loss in pull functions (fromCache guard)

This is the prerequisite from the spec — required before offline mode is wired up so that an in-flight `pullAll` can't destroy data while the user clicks "Enter offline mode."

**Files:**
- Modify: `src/services/backends/firebaseBackend.js` — `pullAll` (around line 422), `pullAllNotes` (around line 565), `pullAllPractices` (around line 615).

[model: Sonnet]

- [ ] **Step 1: Read current `pullAll` to confirm line numbers**

Run: `grep -n "async pullAll\|async pullAllNotes\|async pullAllPractices\|const itemsSnap\|const snap\|const logsSnap" src/services/backends/firebaseBackend.js`

Expected output: confirms the three function start lines and the `getDocs` assignments.

- [ ] **Step 2: Add fromCache guard to `pullAll` items snapshot**

In `src/services/backends/firebaseBackend.js`, locate the line:

```js
async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    const remoteUids = new Set();
```

Change it to:

```js
async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    if (itemsSnap.metadata.fromCache) {
      // Server unreachable — snapshot is from the offline cache.
      // Skip reconciliation; deleting locally-synced items based on a
      // cached/empty snapshot is the data-loss bug we're guarding against.
      return;
    }
    const remoteUids = new Set();
```

- [ ] **Step 3: Add fromCache guard to `pullAll` logs snapshot**

Still in `pullAll`, locate:

```js
    // Pull logs BEFORE reconciling item deletions, so logs whose `item_uid`
    // moved to a different parent (via merge on another device) get remapped
    // locally before their old parent gets deleted.
    const logsSnap = await getDocs(logsRef(userId));
    for (const docSnap of logsSnap.docs) {
```

Insert the guard immediately after the `logsSnap` line:

```js
    // Pull logs BEFORE reconciling item deletions, so logs whose `item_uid`
    // moved to a different parent (via merge on another device) get remapped
    // locally before their old parent gets deleted.
    const logsSnap = await getDocs(logsRef(userId));
    if (logsSnap.metadata.fromCache) {
      return;
    }
    for (const docSnap of logsSnap.docs) {
```

- [ ] **Step 4: Add fromCache guard to `pullAllNotes`**

Locate:

```js
  async pullAllNotes(userId) {
    const snap = await getDocs(notesRef(userId));
```

Change to:

```js
  async pullAllNotes(userId) {
    const snap = await getDocs(notesRef(userId));
    if (snap.metadata.fromCache) {
      return;
    }
```

- [ ] **Step 5: Add fromCache guard to `pullAllPractices`**

Locate:

```js
  async pullAllPractices(userId) {
    const snap = await getDocs(practicesRef(userId));
```

Change to:

```js
  async pullAllPractices(userId) {
    const snap = await getDocs(practicesRef(userId));
    if (snap.metadata.fromCache) {
      return;
    }
```

- [ ] **Step 6: Build to verify no syntax errors**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manually verify the fix (DevTools → Network → Offline → reload)**

With at least one practice item present locally:
1. Open the app online to seed Dexie.
2. Open DevTools → Network tab → throttle to "Offline."
3. Reload the page.
4. Confirm: the app loads (from SW cache), the items list is still populated, and the items are NOT wiped from Dexie after the failed sync attempt.

If items disappear, the guards aren't taking effect — re-check that the `if (...fromCache) return;` blocks were placed AFTER the `await getDocs(...)` and BEFORE any subsequent processing in each function.

- [ ] **Step 8: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "fix(sync): bail pull reconciliation on cached/offline snapshots

pullAll/pullAllNotes/pullAllPractices each call getDocs() with no
persistent local cache configured. When the server is unreachable,
the SDK resolves with an empty snapshot flagged metadata.fromCache.
The deletion-reconciliation loops at the end of each function then
treated every locally-synced row as 'deleted on another device' and
hard-deleted them all from Dexie. Refreshing the app offline would
wipe the user's entire practice item list, all notes, and all saved
metronome practices.

Guard each pull function with an early return when the snapshot is
fromCache. No behavior change when online (fromCache is false).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Create `offlineService` module + unit tests

**Files:**
- Create: `src/services/offlineService.js`
- Create: `tests/offlineService.test.js`

[model: Haiku]

- [ ] **Step 1: Write the failing test**

Create `tests/offlineService.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('offlineService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults to false on first import', async () => {
    const m = await import('../src/services/offlineService.js');
    expect(m.getOfflineMode()).toBe(false);
  });

  it('setOfflineMode(true) flips the value', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode(true);
    expect(m.getOfflineMode()).toBe(true);
  });

  it('setOfflineMode(false) flips it back', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode(true);
    m.setOfflineMode(false);
    expect(m.getOfflineMode()).toBe(false);
  });

  it('coerces non-boolean values to boolean', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode('truthy');
    expect(m.getOfflineMode()).toBe(true);
    m.setOfflineMode(0);
    expect(m.getOfflineMode()).toBe(false);
  });

  it('state does not leak across module resets', async () => {
    const m1 = await import('../src/services/offlineService.js');
    m1.setOfflineMode(true);
    vi.resetModules();
    const m2 = await import('../src/services/offlineService.js');
    expect(m2.getOfflineMode()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/offlineService.test.js`
Expected: FAIL with "Cannot find module '../src/services/offlineService.js'" or similar.

- [ ] **Step 3: Create the module**

Create `src/services/offlineService.js`:

```js
let isOffline = false;

export function getOfflineMode() {
  return isOffline;
}

export function setOfflineMode(value) {
  isOffline = !!value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/offlineService.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineService.js tests/offlineService.test.js
git commit -m "feat(offline): add offlineService module-level flag

In-memory boolean toggled via setOfflineMode/getOfflineMode. No
persistence — refreshing the page returns to false. Mirrors the
shape of timezoneService.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Add offline-mode short-circuit to push methods

Each Firestore-mutating function in `firebaseBackend.js` gains a guard at the top: if `getOfflineMode()` is true, enqueue an enriched payload and return without touching Firestore.

**Files:**
- Modify: `src/services/backends/firebaseBackend.js` — 14 push/delete/merge functions plus the `import` block.

[model: Sonnet]

- [ ] **Step 1: Add the import**

At the top of `src/services/backends/firebaseBackend.js`, find the existing imports and add:

```js
import { getOfflineMode } from '../offlineService';
```

(Place it near the other relative imports — e.g. directly above or below the `legacyDateToLoggedAt` import.)

- [ ] **Step 2: Guard `pushItem`**

Locate the start of `pushItem`:

```js
  async pushItem(localItem, userId) {
    if (!localItem.uid) {
      console.error('pushItem: missing uid', localItem);
      return;
    }
    try {
```

Insert after the uid check and before the `try`:

```js
  async pushItem(localItem, userId) {
    if (!localItem.uid) {
      console.error('pushItem: missing uid', localItem);
      return;
    }
    if (getOfflineMode()) {
      await queueSync('create_item', {
        uid: localItem.uid,
        name: localItem.name,
        displayName: localItem.name,
      });
      return;
    }
    try {
```

- [ ] **Step 3: Guard `pushLog`**

Locate the start of `pushLog`:

```js
  async pushLog(localLog, userId) {
    try {
      const item = await db.practiceItems.get(localLog.itemId);
```

Insert before the `try`:

```js
  async pushLog(localLog, userId) {
    if (getOfflineMode()) {
      const item = await db.practiceItems.get(localLog.itemId);
      await queueSync('create_log', {
        itemUid: localLog.itemUid || item?.uid,
        itemName: item?.name,
        date: localLog.date,
        duration: localLog.duration,
        uid: localLog.uid,
      });
      return;
    }
    try {
      const item = await db.practiceItems.get(localLog.itemId);
```

- [ ] **Step 4: Guard `pushNote`**

Locate the start of `pushNote`:

```js
  async pushNote(localNote, userId) {
    if (!localNote.uid) {
      console.error('pushNote: missing uid', localNote);
      return;
    }
    if (!localNote.itemUid) {
      console.error('pushNote: missing itemUid', localNote);
      return;
    }
    try {
```

Insert after the validation and before the `try`:

```js
  async pushNote(localNote, userId) {
    if (!localNote.uid) {
      console.error('pushNote: missing uid', localNote);
      return;
    }
    if (!localNote.itemUid) {
      console.error('pushNote: missing itemUid', localNote);
      return;
    }
    if (getOfflineMode()) {
      const item = await db.practiceItems.where('uid').equals(localNote.itemUid).first();
      await queueSync('push_note', {
        uid: localNote.uid,
        itemName: item?.name,
        date: localNote.date,
      });
      return;
    }
    try {
```

- [ ] **Step 5: Guard `deleteNoteRemote`**

Locate:

```js
  async deleteNoteRemote(noteUid, userId) {
    try {
      await deleteDoc(doc(notesRef(userId), noteUid));
    } catch (err) {
```

Change to:

```js
  async deleteNoteRemote(noteUid, userId) {
    if (getOfflineMode()) {
      await queueSync('delete_note', { uid: noteUid });
      return;
    }
    try {
      await deleteDoc(doc(notesRef(userId), noteUid));
    } catch (err) {
```

- [ ] **Step 6: Guard `pushDeleteItem`**

Run: `grep -n "async pushDeleteItem\|async pushRenameItem\|async pushReorder\|async pushArchiveItem\|async pushTrashItem\|async pushSetCategory\|async mergeItems\|async pushPractice\|async pushDeletePractice\|async pushReorderPractices" src/services/backends/firebaseBackend.js`

Expected: lists the line numbers for each function so you can locate them.

Then locate `pushDeleteItem`. It will look approximately like:

```js
  async pushDeleteItem(uid, userId) {
    try {
      // ...firestore delete...
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_item', { uid });
      } else {
        throw err;
      }
    }
  },
```

Add at the top:

```js
  async pushDeleteItem(uid, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('delete_item', {
        uid,
        displayName: local?.name,
      });
      return;
    }
    try {
      // ...existing body unchanged...
    } catch (err) {
      // ...existing catch unchanged...
    }
  },
```

- [ ] **Step 7: Guard `pushRenameItem`**

Locate `pushRenameItem`. Add at the top:

```js
  async pushRenameItem(uid, newName, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('rename_item', {
        uid,
        newName,
        previousName: local?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

Note: at the moment this push runs, the local row's `name` has already been updated to `newName` by the caller (the rename flow updates Dexie first, then calls push). To capture the previous name, the caller would need to pass it. **Confirm during implementation by reading the rename flow in `database.js` / App.jsx**; if the local row at push time has `newName`, accept that and use:

```js
        previousName: localItem.name, // = newName at this point; fallback only
```

…and adjust the formatter (Task 5) to render "Renamed to *X*" when `previousName === newName`. This is a known minor degradation for the read-only display; the actual replay payload (`uid`, `newName`) is correct.

- [ ] **Step 8: Guard `pushReorder`**

Locate `pushReorder`. Add at the top:

```js
  async pushReorder(items, userId) {
    if (getOfflineMode()) {
      await queueSync('reorder', {
        items: items.map(({ uid, sortOrder, category }) => ({ uid, sortOrder, category })),
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 9: Guard `pushArchiveItem`**

Locate `pushArchiveItem`. Add at the top:

```js
  async pushArchiveItem(uid, archived, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('archive_item', {
        uid,
        archived,
        displayName: local?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 10: Guard `pushTrashItem`**

Locate `pushTrashItem`. Add at the top:

```js
  async pushTrashItem(uid, trashed, trashedAt, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('trash_item', {
        uid,
        trashed,
        trashedAt,
        displayName: local?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 11: Guard `pushSetCategory`**

Locate `pushSetCategory`. Add at the top:

```js
  async pushSetCategory(uid, category, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('set_category', {
        uid,
        category,
        displayName: local?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 12: Guard `mergeItems`**

Locate `mergeItems`. Add at the top:

```js
  async mergeItems(sourceUid, targetUid, targetName, userId) {
    if (getOfflineMode()) {
      const sourceLocal = await db.practiceItems.where('uid').equals(sourceUid).first();
      await queueSync('merge_items', {
        sourceUid,
        targetUid,
        targetName,
        previousName: sourceLocal?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 13: Guard `pushPractice`**

Locate `pushPractice`. Add at the top:

```js
  async pushPractice(localPractice, userId) {
    if (!localPractice.uid) {
      console.error('pushPractice: missing uid', localPractice);
      return;
    }
    if (getOfflineMode()) {
      await queueSync('push_practice', {
        uid: localPractice.uid,
        name: localPractice.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

(Insert the offline guard after the uid validation, before the existing `try`.)

- [ ] **Step 14: Guard `pushDeletePractice`**

Locate `pushDeletePractice`. Add at the top:

```js
  async pushDeletePractice(uid, userId) {
    if (getOfflineMode()) {
      const local = await db.metronomePractices.where('uid').equals(uid).first();
      await queueSync('delete_practice', {
        uid,
        name: local?.name,
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 15: Guard `pushReorderPractices`**

Locate `pushReorderPractices`. Add at the top:

```js
  async pushReorderPractices(practices, userId) {
    if (getOfflineMode()) {
      await queueSync('reorder_practices', {
        practices: practices.map(({ uid, sortOrder }) => ({ uid, sortOrder })),
      });
      return;
    }
    // ...existing body unchanged...
  },
```

- [ ] **Step 16: Build to verify no syntax errors**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 17: Verify `flushSyncQueue` still accepts these enriched payloads**

Read `flushSyncQueue` (around line 703 of `firebaseBackend.js`). Each handler should reference only the canonical fields (`uid`, `newName`, `archived`, etc.). Extra `displayName` / `previousName` / `itemName` keys are ignored. No change needed; this is just confirmation.

- [ ] **Step 18: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat(offline): short-circuit push methods to syncQueue when offline

When getOfflineMode() is true, every Firestore-mutating method
enqueues the action directly without touching the network. Payloads
are enriched with displayName / previousName / itemName hints so
the upcoming pending-changes modal can render human-readable
summaries. The existing navigator.onLine catch-block fallbacks
remain in place as belt-and-suspenders for when navigator.onLine
lies.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Add translation keys

**Files:**
- Modify: `src/contexts/LanguageContext.jsx` — English (around line 154) and Chinese (around line 453) translation blocks.

[model: Sonnet]

- [ ] **Step 1: Locate the English `auth` block**

Run: `grep -n "syncing: 'Syncing\|enterOfflineMode" src/contexts/LanguageContext.jsx`

Expected: shows the English `syncing` line. The Chinese one follows the same structure ~300 lines below.

- [ ] **Step 2: Add the English `offline` namespace**

In `src/contexts/LanguageContext.jsx`, find the English `auth` object ending. Right after the closing `},` of the `auth` object, add a new `offline` section. Place it adjacent to `auth` for grouping. Locate:

```js
      syncing: 'Syncing...',
      sessionExpired: 'Session expired. Please sign in again.',
    },
    settings: 'Settings',
```

Change to:

```js
      syncing: 'Syncing...',
      sessionExpired: 'Session expired. Please sign in again.',
      enterOfflineMode: 'Enter offline mode',
    },
    offline: {
      modeLabel: 'Offline mode',
      goOnline: 'Go online',
      noPendingChanges: 'No pending changes',
      pendingChanges: '{count} pending changes',
      pendingChangesTitle: 'Pending changes',
      noPendingChangesEmpty: 'No pending changes — nothing to sync.',
      settingsRow: 'Offline mode',
      settingsPendingRow: 'Pending changes: {count}',
      settingsHint: 'No network sync this session. Edits queue until you go online.',
      action: {
        createItem: 'Created practice item: {name}',
        createLog: 'Logged {duration} min on {name} ({date})',
        renameItem: 'Renamed {from} → {to}',
        renameItemTo: 'Renamed to {to}',
        renameItemGeneric: 'Renamed an item',
        deleteItem: 'Deleted practice item: {name}',
        deleteItemGeneric: 'Deleted a practice item',
        reorder: 'Reordered {count} items',
        archive: 'Archived {name}',
        unarchive: 'Unarchived {name}',
        archiveGeneric: 'Changed archive state of an item',
        trash: 'Moved {name} to trash',
        restore: 'Restored {name}',
        trashGeneric: 'Changed trash state of an item',
        setCategory: 'Moved {name} to {category}',
        setCategoryGeneric: 'Changed category of an item',
        categoryFundamentals: 'Fundamentals',
        categorySongs: 'Songs',
        merge: 'Merged {from} → {to}',
        mergeGeneric: 'Merged two items',
        pushNote: 'Saved note for {name} ({date})',
        pushNoteGeneric: 'Saved a note',
        deleteNote: 'Deleted note',
        pushPractice: 'Saved metronome practice: {name}',
        pushPracticeGeneric: 'Saved a metronome practice',
        deletePractice: 'Deleted metronome practice',
        reorderPractices: 'Reordered {count} metronome practices',
      },
    },
    settings: 'Settings',
```

- [ ] **Step 3: Add the Chinese `offline` namespace**

Find the Chinese `auth` object ending (around line 453). Locate:

```js
      syncing: '同步中...',
      sessionExpired: '会话已过期。请重新登录。',
    },
```

Change to:

```js
      syncing: '同步中...',
      sessionExpired: '会话已过期。请重新登录。',
      enterOfflineMode: '进入离线模式',
    },
    offline: {
      modeLabel: '离线模式',
      goOnline: '上线',
      noPendingChanges: '无待同步更改',
      pendingChanges: '{count} 项待同步更改',
      pendingChangesTitle: '待同步更改',
      noPendingChangesEmpty: '无待同步更改 — 无需同步。',
      settingsRow: '离线模式',
      settingsPendingRow: '待同步更改：{count}',
      settingsHint: '本次会话不进行网络同步。所有编辑将在上线时同步。',
      action: {
        createItem: '创建练习项目：{name}',
        createLog: '在 {name} 上记录 {duration} 分钟（{date}）',
        renameItem: '重命名 {from} → {to}',
        renameItemTo: '重命名为 {to}',
        renameItemGeneric: '重命名了一个项目',
        deleteItem: '删除练习项目：{name}',
        deleteItemGeneric: '删除了一个练习项目',
        reorder: '重排了 {count} 个项目',
        archive: '归档 {name}',
        unarchive: '取消归档 {name}',
        archiveGeneric: '更改了项目归档状态',
        trash: '将 {name} 移至废纸篓',
        restore: '恢复 {name}',
        trashGeneric: '更改了项目废纸篓状态',
        setCategory: '将 {name} 移至 {category}',
        setCategoryGeneric: '更改了项目分类',
        categoryFundamentals: '基本功',
        categorySongs: '歌曲',
        merge: '合并 {from} → {to}',
        mergeGeneric: '合并了两个项目',
        pushNote: '为 {name} 保存笔记（{date}）',
        pushNoteGeneric: '保存了一条笔记',
        deleteNote: '删除了笔记',
        pushPractice: '保存节拍器练习：{name}',
        pushPracticeGeneric: '保存了一个节拍器练习',
        deletePractice: '删除节拍器练习',
        reorderPractices: '重排了 {count} 个节拍器练习',
      },
    },
```

- [ ] **Step 4: Build to verify JSON structure**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Verify lookup works**

Open the browser console after `npm run dev`, run in a React component or temporarily log in `App.jsx`:

```js
console.log(t('offline.modeLabel'), t('offline.pendingChanges', { count: 3 }));
```

Expected: prints `Offline mode 3 pending changes` in English. Remove the log before committing.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(i18n): add offline-mode translation keys (en + zh)

Adds offline.* namespace with banner labels, settings rows, modal
title, and per-action human-readable strings for the pending-changes
modal in both English and Chinese.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Create `pendingActionFormatter` + unit tests

**Files:**
- Create: `src/utils/pendingActionFormatter.js`
- Create: `tests/pendingActionFormatter.test.js`

[model: Sonnet]

- [ ] **Step 1: Write the failing test**

Create `tests/pendingActionFormatter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatPendingAction } from '../src/utils/pendingActionFormatter.js';

// Minimal t() that just renders the key + interpolations as a string —
// enough to assert that the right key + payload made it through.
function makeT() {
  return (key, params) => {
    if (!params) return key;
    let out = key + '|';
    out += Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',');
    return out;
  };
}

describe('formatPendingAction', () => {
  const t = makeT();

  it('create_item with name', () => {
    const entry = { action: 'create_item', payload: { uid: 'a', name: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.createItem|name=Snare');
  });

  it('create_log with itemName, duration, date', () => {
    const entry = { action: 'create_log', payload: { itemUid: 'a', itemName: 'Hi-hat', duration: 720, date: '2026-05-17' } };
    // duration is stored in SECONDS in payload; formatter converts to minutes.
    expect(formatPendingAction(entry, t)).toBe('offline.action.createLog|duration=12,name=Hi-hat,date=2026-05-17');
  });

  it('rename_item with previousName !== newName', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a', previousName: 'Snare', newName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItem|from=Snare,to=Snare Drum');
  });

  it('rename_item with previousName === newName falls back to renameItemTo', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a', previousName: 'Snare Drum', newName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItemTo|to=Snare Drum');
  });

  it('rename_item with no names falls back to generic', () => {
    const entry = { action: 'rename_item', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.renameItemGeneric');
  });

  it('delete_item with displayName', () => {
    const entry = { action: 'delete_item', payload: { uid: 'a', displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteItem|name=Snare');
  });

  it('delete_item without displayName falls back to generic', () => {
    const entry = { action: 'delete_item', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteItemGeneric');
  });

  it('reorder counts the items array', () => {
    const entry = { action: 'reorder', payload: { items: [{}, {}, {}, {}] } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.reorder|count=4');
  });

  it('archive_item archived=true', () => {
    const entry = { action: 'archive_item', payload: { uid: 'a', archived: true, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.archive|name=Snare');
  });

  it('archive_item archived=false renders unarchive', () => {
    const entry = { action: 'archive_item', payload: { uid: 'a', archived: false, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.unarchive|name=Snare');
  });

  it('trash_item trashed=true', () => {
    const entry = { action: 'trash_item', payload: { uid: 'a', trashed: true, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.trash|name=Snare');
  });

  it('trash_item trashed=false renders restore', () => {
    const entry = { action: 'trash_item', payload: { uid: 'a', trashed: false, displayName: 'Snare' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.restore|name=Snare');
  });

  it('set_category renders localized category label', () => {
    const entry = { action: 'set_category', payload: { uid: 'a', category: 'songs', displayName: 'Sweet Child O Mine' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.setCategory|name=Sweet Child O Mine,category=offline.action.categorySongs');
  });

  it('merge_items renders from → to', () => {
    const entry = { action: 'merge_items', payload: { sourceUid: 'a', targetUid: 'b', previousName: 'Snare', targetName: 'Snare Drum' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.merge|from=Snare,to=Snare Drum');
  });

  it('push_note with itemName + date', () => {
    const entry = { action: 'push_note', payload: { uid: 'a', itemName: 'Kick', date: '2026-05-17' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.pushNote|name=Kick,date=2026-05-17');
  });

  it('delete_note generic', () => {
    const entry = { action: 'delete_note', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deleteNote');
  });

  it('push_practice with name', () => {
    const entry = { action: 'push_practice', payload: { uid: 'a', name: 'Slow build' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.pushPractice|name=Slow build');
  });

  it('delete_practice generic', () => {
    const entry = { action: 'delete_practice', payload: { uid: 'a' } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.deletePractice');
  });

  it('reorder_practices counts the practices array', () => {
    const entry = { action: 'reorder_practices', payload: { practices: [{}, {}] } };
    expect(formatPendingAction(entry, t)).toBe('offline.action.reorderPractices|count=2');
  });

  it('unknown action falls back to action name', () => {
    const entry = { action: 'unknown_action', payload: {} };
    expect(formatPendingAction(entry, t)).toBe('unknown_action');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pendingActionFormatter.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create the formatter**

Create `src/utils/pendingActionFormatter.js`:

```js
export function formatPendingAction(entry, t) {
  const { action, payload = {} } = entry;
  switch (action) {
    case 'create_item':
      return payload.name
        ? t('offline.action.createItem', { name: payload.name })
        : t('offline.action.createItem', { name: payload.displayName ?? '' });

    case 'create_log': {
      const minutes = Math.round((payload.duration ?? 0) / 60);
      return t('offline.action.createLog', {
        duration: minutes,
        name: payload.itemName ?? '',
        date: payload.date ?? '',
      });
    }

    case 'rename_item': {
      const { previousName, newName } = payload;
      if (!newName) return t('offline.action.renameItemGeneric');
      if (previousName && previousName !== newName) {
        return t('offline.action.renameItem', { from: previousName, to: newName });
      }
      return t('offline.action.renameItemTo', { to: newName });
    }

    case 'delete_item':
      return payload.displayName
        ? t('offline.action.deleteItem', { name: payload.displayName })
        : t('offline.action.deleteItemGeneric');

    case 'reorder':
      return t('offline.action.reorder', { count: (payload.items ?? []).length });

    case 'archive_item':
      if (!payload.displayName) return t('offline.action.archiveGeneric');
      return payload.archived
        ? t('offline.action.archive', { name: payload.displayName })
        : t('offline.action.unarchive', { name: payload.displayName });

    case 'trash_item':
      if (!payload.displayName) return t('offline.action.trashGeneric');
      return payload.trashed
        ? t('offline.action.trash', { name: payload.displayName })
        : t('offline.action.restore', { name: payload.displayName });

    case 'set_category': {
      if (!payload.displayName) return t('offline.action.setCategoryGeneric');
      const categoryKey =
        payload.category === 'songs'
          ? 'offline.action.categorySongs'
          : 'offline.action.categoryFundamentals';
      return t('offline.action.setCategory', {
        name: payload.displayName,
        category: t(categoryKey),
      });
    }

    case 'merge_items': {
      const from = payload.previousName;
      const to = payload.targetName;
      if (from && to) {
        return t('offline.action.merge', { from, to });
      }
      return t('offline.action.mergeGeneric');
    }

    case 'push_note':
      if (payload.itemName) {
        return t('offline.action.pushNote', {
          name: payload.itemName,
          date: payload.date ?? '',
        });
      }
      return t('offline.action.pushNoteGeneric');

    case 'delete_note':
      return t('offline.action.deleteNote');

    case 'push_practice':
      return payload.name
        ? t('offline.action.pushPractice', { name: payload.name })
        : t('offline.action.pushPracticeGeneric');

    case 'delete_practice':
      return t('offline.action.deletePractice');

    case 'reorder_practices':
      return t('offline.action.reorderPractices', {
        count: (payload.practices ?? []).length,
      });

    default:
      return action;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pendingActionFormatter.test.js`
Expected: PASS (19 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/pendingActionFormatter.js tests/pendingActionFormatter.test.js
git commit -m "feat(offline): add pendingActionFormatter helper

Pure function mapping a syncQueue entry to a localized display string
for the pending-changes modal. Each action type has a specific-fields
path and a generic fallback for entries missing display hints (e.g.
legacy queue entries from the catch-block fallback path).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Create `OfflineBanner` component

**Files:**
- Create: `src/components/OfflineBanner.jsx`

[model: Sonnet]

- [ ] **Step 1: Confirm the Dexie liveQuery shape**

Run: `grep -n "Dexie.liveQuery\|liveQuery(" src/services/database.js`
Expected: no usages yet. We'll import `liveQuery` directly from `dexie` and subscribe to `db.syncQueue.count()`.

- [ ] **Step 2: Create the component**

Create `src/components/OfflineBanner.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';

function OfflineBanner({ onShowPending, onGoOnline }) {
  const { t } = useLanguage();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const sub = liveQuery(() => db.syncQueue.count()).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error('OfflineBanner pendingCount liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  const pendingLabel = pendingCount === 0
    ? t('offline.noPendingChanges')
    : t('offline.pendingChanges', { count: pendingCount });

  return (
    <div
      className="bg-amber-500 text-white text-sm px-3 py-1.5 flex items-center justify-between gap-2 shrink-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true">⚡</span>
        <span className="font-medium">{t('offline.modeLabel')}</span>
        <span aria-hidden="true">·</span>
        <button
          onClick={onShowPending}
          className="underline truncate"
        >
          {pendingLabel}
        </button>
      </div>
      <button
        onClick={onGoOnline}
        className="underline font-medium shrink-0"
      >
        {t('offline.goOnline')}
      </button>
    </div>
  );
}

export default OfflineBanner;
```

- [ ] **Step 3: Build to verify imports resolve**

Run: `npm run build`
Expected: succeeds. (The component is not yet wired into the tree; build only checks syntax + imports.)

- [ ] **Step 4: Commit**

```bash
git add src/components/OfflineBanner.jsx
git commit -m "feat(offline): add OfflineBanner component

Top-bar banner shown while in offline mode. Subscribes to
db.syncQueue via Dexie.liveQuery for a live pending-changes count;
exposes a tappable label that opens the inspection modal and a
'Go online' link.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Create `PendingChangesModal` component

**Files:**
- Create: `src/components/PendingChangesModal.jsx`

[model: Sonnet]

- [ ] **Step 1: Reference an existing modal pattern**

Run: `grep -n "fixed inset-0\|backdrop\|onClick={onClose}" src/components/NoteEditModal.jsx | head -10`
Expected: shows the backdrop + dialog pattern used by NoteEditModal so the new modal can mirror its structure.

Open `src/components/NoteEditModal.jsx` and skim ~30 lines around the JSX root. The new modal should match its visual conventions (rounded card, max-w, bg-white/dark, header + body + footer) but allow backdrop-click dismissal (NoteEditModal disables it on purpose; this one does not).

- [ ] **Step 2: Create the component**

Create `src/components/PendingChangesModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';
import { formatPendingAction } from '../utils/pendingActionFormatter';

function PendingChangesModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    const sub = liveQuery(() => db.syncQueue.orderBy('id').toArray()).subscribe({
      next: (rows) => setEntries(rows),
      error: (err) => console.error('PendingChangesModal liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-changes-title"
      >
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 id="pending-changes-title" className="text-lg font-semibold text-gray-800">
            {t('offline.pendingChangesTitle')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {t('offline.noPendingChangesEmpty')}
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="text-sm text-gray-700 px-3 py-2 bg-gray-50 rounded-md"
                >
                  {formatPendingAction(entry, t)}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('common.close') ?? 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PendingChangesModal;
```

Note: if `common.close` is not already in the translations, the `?? 'Close'` fallback covers both languages adequately. If you prefer a localized close, add `common: { close: 'Close' / '关闭' }` to `LanguageContext.jsx` in this same task — but the spec doesn't require it.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/PendingChangesModal.jsx
git commit -m "feat(offline): add PendingChangesModal

Read-only modal listing every entry in db.syncQueue, oldest first.
Subscribes via Dexie.liveQuery so newly enqueued actions appear
without reopening the modal. Backdrop click and Escape key dismiss.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Wire `offlineMode` state + flow changes into `App.jsx`

This is the largest task — adds React state, mirrors it into `offlineService`, restructures `init()` to skip pulls when offline, and adds the `syncTrigger` mechanism for re-running sync on "Go online."

**Files:**
- Modify: `src/App.jsx`

[model: Sonnet]

- [ ] **Step 1: Add the imports**

At the top of `src/App.jsx`, alongside the other service/component imports, add:

```js
import { getOfflineMode, setOfflineMode as setOfflineServiceMode } from './services/offlineService';
import OfflineBanner from './components/OfflineBanner';
import PendingChangesModal from './components/PendingChangesModal';
```

- [ ] **Step 2: Add the React state**

Locate the existing state block near the top of the `App` function:

```js
  const [isSyncing, setIsSyncing] = useState(false);
```

Add immediately after:

```js
  const [offlineMode, _setOfflineMode] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  const setOfflineMode = useCallback((value) => {
    setOfflineServiceMode(value);
    _setOfflineMode(!!value);
  }, []);
```

(`useCallback` is already imported in App.jsx — confirm with `grep -n "useCallback" src/App.jsx` if unsure.)

- [ ] **Step 3: Locate the current `init` effect**

The effect lives around line 388–424. It starts with:

```js
  useEffect(() => {
    if (!user || !authReady) return;

    let unsubscribe = null;
    let cancelled = false;

    const init = async () => {
      setIsSyncing(true);
      try {
        await initTimezone(firebaseBackend, user.id);
        await firebaseBackend.pullAll(user.id);
        await firebaseBackend.pullAllNotes(user.id);
        await firebaseBackend.pullAllPractices(user.id);
        await loadData();
        if (!cancelled) setIsSyncing(false);
        await firebaseBackend.flushSyncQueue(user.id);
        await firebaseBackend.pushAllLocal(user.id);
      } catch (err) {
        console.error('Sync init failed:', err);
        if (!cancelled) setIsSyncing(false);
      }
      if (!cancelled) {
        unsubscribe = firebaseBackend.subscribeToChanges(loadData);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, authReady, loadData]);
```

- [ ] **Step 4: Restructure the effect to honor offline mode and `syncTrigger`**

Replace the entire effect with:

```js
  useEffect(() => {
    if (!user || !authReady) return;

    let unsubscribe = null;
    let cancelled = false;

    const init = async () => {
      setIsSyncing(true);
      try {
        await initTimezone(firebaseBackend, user.id);
        if (getOfflineMode()) {
          await loadData();
          if (!cancelled) setIsSyncing(false);
          return;
        }
        await firebaseBackend.pullAll(user.id);
        await firebaseBackend.pullAllNotes(user.id);
        await firebaseBackend.pullAllPractices(user.id);
        await loadData();
        if (!cancelled) setIsSyncing(false);
        await firebaseBackend.flushSyncQueue(user.id);
        await firebaseBackend.pushAllLocal(user.id);
      } catch (err) {
        console.error('Sync init failed:', err);
        if (!cancelled) setIsSyncing(false);
      }
      if (!cancelled && !getOfflineMode()) {
        unsubscribe = firebaseBackend.subscribeToChanges(loadData);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, authReady, loadData, syncTrigger]);
```

The diff: added an early-return path when `getOfflineMode()`, gated the `subscribeToChanges` call on `!getOfflineMode()`, and added `syncTrigger` to the dependency array so flipping it re-runs the whole effect.

- [ ] **Step 5: Add handler callbacks**

Below the existing handlers (search for `const handleAddItem` or `const handleTimeUnitToggle` to find the cluster), add:

```js
  const handleEnterOfflineMode = useCallback(() => {
    setOfflineMode(true);
    setIsSyncing(false);
  }, [setOfflineMode]);

  const handleGoOnline = useCallback(() => {
    setOfflineMode(false);
    setSettingsOpen(false);
    setSyncTrigger((n) => n + 1);
  }, [setOfflineMode]);
```

(`setSettingsOpen` is the existing settings-panel state setter — closing it when going online keeps focus on the sync overlay that appears.)

- [ ] **Step 6: Add the "Enter offline mode" button to the sync overlay**

Locate (around line 1433):

```jsx
      {isSyncing && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gray-100/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-700 font-medium">{t('auth.syncing')}</p>
        </div>
      )}
```

Change to:

```jsx
      {isSyncing && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gray-100/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-700 font-medium">{t('auth.syncing')}</p>
          <button
            onClick={handleEnterOfflineMode}
            className="mt-2 px-4 py-2 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50"
          >
            {t('auth.enterOfflineMode')}
          </button>
        </div>
      )}
```

- [ ] **Step 7: Add the banner to the layout**

Still in `App.jsx`, locate the outer wrapper:

```jsx
    <div className="h-[100dvh] flex flex-col bg-gray-100 overflow-hidden">
      {isSyncing && (
```

Insert the banner immediately after the `<div>` opening (so it sits above the sync overlay and above the tab nav):

```jsx
    <div className="h-[100dvh] flex flex-col bg-gray-100 overflow-hidden">
      {offlineMode && (
        <OfflineBanner
          onShowPending={() => setPendingModalOpen(true)}
          onGoOnline={handleGoOnline}
        />
      )}
      {isSyncing && (
```

- [ ] **Step 8: Add the modal**

Locate the `<SettingsPanel ... />` block at line ~1699. Add `<PendingChangesModal />` immediately after the closing `/>` of `<SettingsPanel>`:

```jsx
      <SettingsPanel
        ...all existing props...
      />

      <PendingChangesModal
        isOpen={pendingModalOpen}
        onClose={() => setPendingModalOpen(false)}
      />
```

- [ ] **Step 9: Pass offline-mode props to `SettingsPanel`**

In the `<SettingsPanel ... />` invocation, add three new props (placed before `userId` for grouping):

```jsx
        offlineMode={offlineMode}
        onEnterOfflineMode={() => setOfflineMode(true)}
        onGoOnline={handleGoOnline}
        onShowPending={() => setPendingModalOpen(true)}
```

(These will be consumed in Task 9.)

- [ ] **Step 10: Build to verify everything compiles**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat(offline): wire offlineMode state, init flow, banner, modal

App.jsx now owns offlineMode state mirrored into offlineService,
gates pulls and the real-time subscription on it, and re-runs init
via a syncTrigger counter when the user taps 'Go online'. The sync
overlay gains an 'Enter offline mode' button visible immediately;
the banner mounts above the tab nav while in offline mode;
PendingChangesModal opens from the banner or settings.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Add offline-mode rows to `SettingsPanel`

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

[model: Sonnet]

- [ ] **Step 1: Update the function signature**

Locate the existing destructured props in the function signature (top of `SettingsPanel.jsx`). Add the four new props at the end:

```jsx
function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  user,
  timeUnit,
  onToggleTimeUnit,
  kokoroEnabled,
  kokoroStatus,
  kokoroProgress,
  onToggleKokoro,
  aiCoachEnabled,
  onToggleAiCoach,
  handsFreeMode,
  onToggleHandsFree,
  wakeWordLoading,
  wakeWordDetected,
  wakeWordError,
  listeningState,
  voiceTranscript,
  userId,
  onTimezoneChange,
  offlineMode,
  onEnterOfflineMode,
  onGoOnline,
  onShowPending,
}) {
```

(Adjust the existing destructure to match — keep all current props, just append the four new ones.)

- [ ] **Step 2: Add pending-count subscription**

Below the imports at the top of the file, add:

```jsx
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/database';
```

(If `useEffect` and `useState` are already imported, don't duplicate them. If `useState` isn't imported yet, add it.)

Inside the `SettingsPanel` function body, near the top, add:

```jsx
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const sub = liveQuery(() => db.syncQueue.count()).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error('SettingsPanel pendingCount liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, [isOpen]);
```

- [ ] **Step 3: Add the offline-mode section**

Find the "Sign out at bottom" section (around line 330). Insert a new section directly above it. The exact placement is below the existing sections (Language, Timezone, Time Unit, AI features, Hands-Free) but above Sign Out:

```jsx
        {/* Offline mode */}
        <div className="px-5 py-4 border-t border-gray-200 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              {t('offline.settingsRow')}
            </span>
            <button
              onClick={() => {
                if (offlineMode) {
                  onGoOnline();
                } else {
                  onEnterOfflineMode();
                  onClose();
                }
              }}
              role="switch"
              aria-checked={offlineMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                offlineMode ? 'bg-amber-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  offlineMode ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">{t('offline.settingsHint')}</p>
          {offlineMode && (
            <button
              onClick={onShowPending}
              className="text-left text-sm text-blue-600 hover:underline"
            >
              {t('offline.settingsPendingRow', { count: pendingCount })}
            </button>
          )}
        </div>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat(offline): add offline-mode toggle to SettingsPanel

New row with a switch that mirrors offlineMode state. Toggling on
enters offline mode and closes the settings panel; toggling off
runs the same handleGoOnline flow that triggers the sync overlay.
While in offline mode, a sub-row exposes the pending-changes count
and opens PendingChangesModal.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Manual integration test pass

No code changes — verify the spec's testing checklist end-to-end. Each box should pass; if not, file the issue and return to the appropriate prior task.

**Files:** none (verification only).

[model: Sonnet]

- [ ] **Step 1: Build a fresh dev bundle**

Run: `npm run dev`
Open the URL it prints. Confirm the app loads, you're signed in, and at least 2–3 practice items exist (create some if not).

- [ ] **Step 2: Verify the data-loss fix**

1. DevTools → Network → Offline.
2. Reload the page.
3. Confirm: app shell loads, items still appear in the Practice tab, items still appear after switching to Report. (No banner — you didn't tap "Enter offline mode"; the sync overlay either passed through quickly or hung. If it hung, that's expected; the button to dismiss is in Step 3.)

PASS criteria: items are not wiped from Dexie even though pull failed.

- [ ] **Step 3: Verify "Enter offline mode" mid-sync**

1. Still offline. If the sync overlay is visible: tap "Enter offline mode."
2. Confirm: overlay disappears, amber banner appears at the top reading `⚡ Offline mode · No pending changes · Go online`.
3. Items are still present.

PASS criteria: button works, banner renders, no data loss.

- [ ] **Step 4: Verify writes queue offline**

1. Still offline + in offline mode.
2. Create a new practice item ("Test Item A").
3. Confirm: item appears in the list immediately; banner now reads `... · 1 pending changes · ...`.
4. Tap the pending-changes label. Confirm: modal opens listing "Created practice item: Test Item A."
5. Close the modal.
6. Rename "Test Item A" to "Test Item B." Banner → 2 pending. Modal lists both actions in order.
7. Add a log to "Test Item B" (via the practice timer). Banner → 3 pending. Modal includes "Logged N min on Test Item B (today's date)."

PASS criteria: each mutation appears in the queue with a human-readable description.

- [ ] **Step 5: Verify "Go online" round-trip**

1. Restore network in DevTools (Online).
2. Tap "Go online" in the banner.
3. Confirm: sync overlay reappears briefly; banner disappears.
4. Open the Firebase console (or `subscribeToChanges` arrival on another device) and verify the test item and rename and log are all present in Firestore.
5. Confirm syncQueue is empty (`indexedDB.databases()` then inspect `DrummateDB.syncQueue` — should have 0 rows).

PASS criteria: queue drains, all three replayed actions land in Firestore in order.

- [ ] **Step 6: Verify refresh clears offline mode**

1. Enter offline mode again (DevTools Offline + sync overlay + tap button).
2. Refresh the page (Cmd-R).
3. Confirm: banner does not appear after refresh (offline-mode state was in-memory only). The sync overlay reappears and may hang again (network still offline) — that's expected. The button is there to dismiss.

PASS criteria: refresh resets offlineMode to false.

- [ ] **Step 7: Verify settings-panel toggle**

1. With network online, open the settings panel.
2. Find the "Offline mode" row at the bottom.
3. Toggle it on. Confirm: settings closes, banner appears.
4. Open settings again. Toggle it off. Confirm: settings closes, sync overlay appears briefly, banner disappears.

PASS criteria: settings toggle has the same effect as the banner link.

- [ ] **Step 8: Verify bilingual rendering**

1. Switch language to Chinese (via existing toggle / `C` key).
2. Confirm: sync overlay button reads `进入离线模式`, banner reads `⚡ 离线模式 · 无待同步更改 · 上线`, modal title reads `待同步更改`.

PASS criteria: every offline-mode string renders in both languages.

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including `offlineService` (5 tests) and `pendingActionFormatter` (19 tests).

- [ ] **Step 10: Final build**

Run: `npm run build`
Expected: succeeds with no warnings related to the new code.

- [ ] **Step 11: Commit (only if any non-code adjustments were made during testing)**

If testing surfaced fixes, commit them. Otherwise, no commit for this task — this is a verification pass.

---

## Self-Review Notes

**Spec coverage:**
- Decision 1 (queue-based offline writes) → Task 3 (push short-circuit) + Task 5 (formatter renders queued actions).
- Decision 2 (button visible immediately) → Task 8 Step 6 (button always rendered inside `isSyncing` block).
- Decision 3 (persistent banner) → Task 6 + Task 8 Step 7.
- Decision 4 ("Go online" re-shows full sync overlay) → Task 8 Step 5 (`handleGoOnline` bumps `syncTrigger` and the effect re-runs from `isSyncing=true`).
- Decision 5 (in-memory only) → Task 2 (no persistence in `offlineService`); Task 8 Step 2 (React state initialized to `false`).
- Decision 6 (no auto-detection) → no `window.addEventListener('online'...)` anywhere in the plan.
- Decision 7 (read-only modal) → Task 7 (no delete buttons; just close).
- Decision 8 (enriched payloads) → Task 3 every step.
- Decision 9 (no subscription in offline mode) → Task 8 Step 4 (`!getOfflineMode()` gate before `subscribeToChanges`).
- Decision 10 (`fromCache` guard) → Task 1.
- Section "New: offlineService" → Task 2.
- Section "Updated: firebaseBackend.js" pulls → Task 1.
- Section "Updated: firebaseBackend.js" pushes → Task 3.
- Section "Updated: App.jsx" → Task 8.
- Section "New: OfflineBanner" → Task 6.
- Section "New: PendingChangesModal" → Task 7.
- Section "New: pendingActionFormatter" → Task 5.
- Section "Updated: SettingsPanel" → Task 9.
- Section "Updated: LanguageContext" → Task 4.
- Section "Testing checklist" → Task 10.

**Placeholders:** none — every step has either exact code or an exact command.

**Type consistency:** `setOfflineMode` is defined as a `useCallback` that mirrors to `offlineService` and to React state (Task 8 Step 2); used the same way everywhere it's called (Task 8 Steps 5, 9). `getOfflineMode` is called only from inside `firebaseBackend.js` (Task 3) and inside `App.jsx`'s `init` effect (Task 8 Step 4) — no internal use of the React-only `offlineMode` variable in those places. `handleGoOnline` and `handleEnterOfflineMode` are referenced consistently by name in Tasks 8 and 9.
