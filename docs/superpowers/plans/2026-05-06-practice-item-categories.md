# Practice Item Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group practice items into "Fundamentals" and "Songs" sections in the Practice tab, with a collapsed "Archived" section, and let users assign or change category in edit mode (segmented picker + cross-section drag).

**Architecture:** Add a `category` field to `practiceItems` (Dexie v9). The existing `archived` boolean is unchanged — `category` controls *which* active section, `archived` controls *visibility*. Both backends gain `category` support; PocketBase reads/writes via `pushItem`/`pullAll` and stubs `pushSetCategory` (matching the existing uid-migration TODO pattern). Firebase is fully wired. The UI uses two `SortableContext` instances inside a single `DndContext` for cross-section drag.

**Tech Stack:** React 19, Vite 7, Tailwind v4, Dexie 4 (IndexedDB), `@dnd-kit/core` + `@dnd-kit/sortable`, Firebase Firestore, PocketBase.

**Spec:** [docs/superpowers/specs/2026-05-06-practice-item-categories-design.md](../specs/2026-05-06-practice-item-categories-design.md)

**Testing convention:** This codebase has no automated test suite (per CLAUDE.md, verification is `npm run build` + manual testing in the dev server). Each task ends with a build check, a focused manual verification step, and a commit. Strict TDD doesn't fit here; matching the codebase's actual practice is the right call.

**Deployment prerequisite (manual, before client deploy):** In the PocketBase admin UI, add a `category` text field to the `practice_items` collection. Default value: `fundamentals`. Not required (so old clients still write successfully). Firestore needs no schema work.

---

## File Structure

| File | What changes |
|---|---|
| `src/services/database.js` | Add Dexie v9 migration; `addItem(name, category)` signature; new `setItemCategory(id, category)` |
| `src/services/backends/backendInterface.js` | Document `category` in `pushItem` and `pushReorder` payload contracts; document new `pushSetCategory` |
| `src/services/sync.js` (PocketBase) | `pushItem` writes `category`; `pullAll` and `subscribeToChanges` read `category` (tolerant); add stub `pushSetCategory`; add `set_category` queue handler |
| `src/services/backends/pocketbaseBackend.js` | Wire `pushSetCategory` export |
| `src/services/backends/firebaseBackend.js` | `pushItem` writes `category`; `pullAll` and snapshot listener read `category` (tolerant); add `pushSetCategory`; `pushReorder` writes `category` per item; `set_category` queue handler |
| `src/App.jsx` | `handleAddItem(name, category)`; new `handleSetItemCategory`; reorder payload includes `category`; pass props to `<PracticeItemList>` |
| `src/contexts/LanguageContext.jsx` | New translation keys (en + zh) |
| `src/components/PracticeItemList.jsx` | Normal mode: section grouping, headers, collapsed Archived; Edit mode: per-row F/S picker, add-row picker, two `SortableContext` with droppable empty zones |

No new files.

---

## Task 1: Database layer — schema v9 and category API

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1.1: Add Dexie version 9 migration**

In `src/services/database.js`, after the `db.version(8)` block (which ends at line 87), insert a new `db.version(9)` block:

```js
db.version(9).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs: '++id, itemId, itemUid, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    if (!item.category) item.category = 'fundamentals';
  });
});
```

- [ ] **Step 1.2: Update `addItem` to accept and require `category`**

Replace the existing `addItem` function (currently around lines 95-103):

```js
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
```

- [ ] **Step 1.3: Add `setItemCategory` function**

Insert immediately after `archiveItem` (around line 124):

```js
export const setItemCategory = async (id, category) => {
  if (category !== 'fundamentals' && category !== 'songs') {
    throw new Error(`setItemCategory: invalid category "${category}"`);
  }
  return await db.practiceItems.update(id, { category });
};
```

- [ ] **Step 1.4: Verify build**

Run: `npm run build`
Expected: Build succeeds. (Callsites of `addItem` will still pass only `name` — they break in App.jsx; we'll fix in Task 6. The build itself doesn't enforce JS arity, so it should still compile. If you see a build failure, it's unrelated to this change — investigate before continuing.)

- [ ] **Step 1.5: Manual verification — migration runs**

Run `npm run dev`, open the app in a browser. Open DevTools → Application → IndexedDB → `DrummateDB` → `practiceItems`. Confirm:
- Database version is 9
- Every existing record has `category: 'fundamentals'`

(If you have no existing items, add one via the existing UI — note: `handleAddItem` will throw because of the new arity. That's expected and is fixed in Task 6. Skip this manual step until Task 6 if needed; the migration itself runs on app load regardless.)

- [ ] **Step 1.6: Commit**

```bash
git add src/services/database.js
git commit -m "$(cat <<'EOF'
feat(db): add v9 migration and category field to practice items

Adds an indexed `category` field ('fundamentals' | 'songs') to the
practiceItems schema. Existing items default to 'fundamentals' during
the upgrade. Adds `setItemCategory` and updates `addItem` to require a
category argument.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend interface contract

**Files:**
- Modify: `src/services/backends/backendInterface.js`

- [ ] **Step 2.1: Update the JSDoc contract**

Replace lines 19-32 (the `Sync methods:` block) with:

```js
 * Sync methods:
 *   pushItem(localItem, userId) → void
 *     localItem must include: { uid, name, category, sortOrder?, archived?, trashed?, trashedAt? }
 *   pushLog(localLog, userId) → void
 *     localLog must include: { uid, itemUid, date, duration }
 *   pushDeleteItem(uid, userId) → void
 *   pushRenameItem(uid, newName, userId) → void
 *   pushReorder(items, userId) → void       // items: [{ uid, sortOrder, category? }]
 *   pushArchiveItem(uid, archived, userId) → void
 *   pushTrashItem(uid, trashed, trashedAt, userId) → void
 *   pushSetCategory(uid, category, userId) → void
 *   pullAll(userId) → void
 *   pushAllLocal(userId) → void
 *   flushSyncQueue(userId) → void
 *   subscribeToChanges(onDataChanged: () => void) → unsubscribe: () => void
```

- [ ] **Step 2.2: Verify build and commit**

```bash
npm run build
git add src/services/backends/backendInterface.js
git commit -m "$(cat <<'EOF'
docs(backend): document category field and pushSetCategory

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: PocketBase sync layer — read/write category, stub pushSetCategory

**Files:**
- Modify: `src/services/sync.js`

PocketBase's mutating push methods (rename, reorder, archive, trash) are currently stubs pending the uid-migration. `pushSetCategory` follows the same pattern. `pushItem`, `pullAll`, and `subscribeToChanges` are real and write/read `category` going forward. The category column was added to the PocketBase schema as a deployment prerequisite (see plan header).

- [ ] **Step 3.1: Add `category` to `pushItem`**

In `src/services/sync.js`, replace the `create` call inside `pushItem` (lines 19-26):

```js
    await pb.collection('practice_items').create({
      name: localItem.name,
      user: userId,
      category: localItem.category ?? 'fundamentals',
      sort_order: localItem.sortOrder ?? 0,
      archived: localItem.archived ?? false,
      trashed: localItem.trashed ?? false,
      trashed_at: localItem.trashedAt || '',
    }, { requestKey: null });
```

- [ ] **Step 3.2: Add stub `pushSetCategory`**

Insert immediately after `pushTrashItem` (around line 110), before the `// --- Sync queue` divider:

```js
export async function pushSetCategory(uid, category, userId) {
  console.warn('pushSetCategory: PocketBase uid-migration not yet implemented',
    { uid, category, userId });
}
```

- [ ] **Step 3.3: Handle `set_category` in flush queue**

Inside `flushSyncQueue` (around lines 118-150), add a new branch alongside the existing `archive_item` branch (around line 139). Add this block immediately after the `trash_item` branch:

```js
      } else if (entry.action === 'set_category') {
        await pushSetCategory(entry.payload.uid, entry.payload.category, userId);
```

(That keeps the `else if` chain consistent with the existing code style.)

- [ ] **Step 3.4: Tolerant pull — `pullAll` reads `category`**

In `pullAll` (around lines 154-188), update the "new item" branch to include `category`, and add a `category` rule to the "existing item" updates block.

Replace lines 164-188 with:

```js
    if (!existing) {
      await db.practiceItems.add({
        name: remote.name,
        category: remote.category ?? 'fundamentals',
        sortOrder: remote.sort_order ?? 0,
        archived: remote.archived ?? false,
        trashed: remote.trashed ?? false,
        trashedAt: remote.trashed_at || null,
      });
    } else {
      const updates = {};
      if (remote.sort_order != null && existing.sortOrder !== remote.sort_order) {
        updates.sortOrder = remote.sort_order;
      }
      if (remote.archived != null && existing.archived !== remote.archived) {
        updates.archived = remote.archived;
      }
      if (remote.trashed != null && existing.trashed !== remote.trashed) {
        updates.trashed = remote.trashed;
        updates.trashedAt = remote.trashed_at || null;
      }
      if (remote.category !== undefined && existing.category !== remote.category) {
        updates.category = remote.category;
      }
      if (Object.keys(updates).length > 0) {
        await db.practiceItems.update(existing.id, updates);
      }
    }
```

- [ ] **Step 3.5: `subscribeToChanges` reads `category`**

In `subscribeToChanges` (around lines 233-300), update the create-event "new item" branch and the update-event diff block to read `category`.

For the create branch, replace the `db.practiceItems.add({...})` call (around lines 242-248):

```js
        await db.practiceItems.add({
          name: e.record.name,
          category: e.record.category ?? 'fundamentals',
          sortOrder: e.record.sort_order ?? 0,
          archived: e.record.archived ?? false,
          trashed: e.record.trashed ?? false,
          trashedAt: e.record.trashed_at || null,
        });
```

For the update branch, add a category check inside the existing `if (localByName)` updates block (around lines 256-269). Insert immediately after the `trashed` block:

```js
        if (e.record.category !== undefined && localByName.category !== e.record.category) {
          updates.category = e.record.category;
        }
```

- [ ] **Step 3.6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3.7: Commit**

```bash
git add src/services/sync.js
git commit -m "$(cat <<'EOF'
feat(sync/pocketbase): read/write category on items

pushItem and pullAll now persist `category`; subscribeToChanges
applies category updates from SSE. pushSetCategory is added as a
stub matching the existing uid-migration TODO pattern (will be
wired up alongside the rest of the PocketBase uid migration).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: PocketBase backend — wire pushSetCategory

**Files:**
- Modify: `src/services/backends/pocketbaseBackend.js`

- [ ] **Step 4.1: Import `pushSetCategory`**

Replace lines 2-6 (the import block):

```js
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem, pushReorder,
  pushArchiveItem, pushTrashItem, pushSetCategory,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';
```

- [ ] **Step 4.2: Add `pushSetCategory` to the backend object**

In the `pocketbaseBackend` object, insert `pushSetCategory,` after `pushTrashItem,` (around line 65):

```js
  // Sync
  pushItem,
  pushLog,
  pushDeleteItem,
  pushRenameItem,
  pushReorder,
  pushArchiveItem,
  pushTrashItem,
  pushSetCategory,
  pullAll,
  pushAllLocal,
  flushSyncQueue,
  subscribeToChanges,
```

- [ ] **Step 4.3: Verify build and commit**

```bash
npm run build
git add src/services/backends/pocketbaseBackend.js
git commit -m "$(cat <<'EOF'
feat(backend/pocketbase): wire pushSetCategory export

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Firebase backend — full category support

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 5.1: `pushItem` writes `category`**

Replace the `data` object construction inside `pushItem` (around lines 99-108):

```js
      const data = {
        uid: localItem.uid,
        name: localItem.name,
        category: localItem.category ?? 'fundamentals',
        created: serverTimestamp(),
      };
      if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
      data.archived = localItem.archived ?? false;
      data.trashed = localItem.trashed ?? false;
      data.trashed_at = localItem.trashedAt || '';
      await setDoc(doc(itemsRef(userId), localItem.uid), data, { merge: true });
```

- [ ] **Step 5.2: `pushReorder` writes `category` per item (atomic cross-section drag)**

Replace the entire `pushReorder` method (around lines 191-205):

```js
  async pushReorder(items, userId) {
    try {
      for (const item of items) {
        const updates = { sort_order: item.sortOrder };
        if (item.category != null) updates.category = item.category;
        await updateDoc(doc(itemsRef(userId), item.uid), updates);
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder', {
          items: items.map(i => ({
            uid: i.uid, sortOrder: i.sortOrder, category: i.category,
          })),
        });
      } else {
        throw err;
      }
    }
  },
```

- [ ] **Step 5.3: Add `pushSetCategory` method**

Insert a new method immediately after `pushTrashItem` (around line 232):

```js
  async pushSetCategory(uid, category, userId) {
    try {
      await updateDoc(doc(itemsRef(userId), uid), { category });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('set_category', { uid, category });
      } else {
        throw err;
      }
    }
  },
```

- [ ] **Step 5.4: Tolerant pull — `pullAll` reads `category`**

Two edits in `pullAll`:

**Edit A — Legacy doc migration (around lines 247-256).** Replace the `setDoc(...)` call inside the legacy-doc branch:

```js
        await setDoc(doc(itemsRef(userId), uid), {
          uid,
          name: data.name,
          category: data.category ?? 'fundamentals',
          sort_order: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashed_at: data.trashed_at || '',
          created: serverTimestamp(),
        }, { merge: true });
```

**Edit B — Insert/update reconciliation (around lines 287-310).** Replace the `if (!local) { ... } else { ... }` block:

```js
      if (!local) {
        await db.practiceItems.add({
          uid: data.uid,
          name: data.name,
          category: data.category ?? 'fundamentals',
          sortOrder: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashedAt: data.trashed_at || null,
          syncedOnce: true,
        });
      } else {
        const updates = {};
        if (data.name != null && local.name !== data.name) updates.name = data.name;
        if (data.sort_order != null && local.sortOrder !== data.sort_order) updates.sortOrder = data.sort_order;
        if (data.archived != null && local.archived !== data.archived) updates.archived = data.archived;
        if (data.trashed != null && local.trashed !== data.trashed) {
          updates.trashed = data.trashed;
          updates.trashedAt = data.trashed_at || null;
        }
        if (data.category !== undefined && local.category !== data.category) {
          updates.category = data.category;
        }
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.practiceItems.update(local.id, updates);
        }
      }
```

- [ ] **Step 5.5: Snapshot listener — read `category`**

Two edits in `subscribeToChanges` → `unsubItems`:

**Edit A — `added` branch (around lines 412-426).** Replace the `db.practiceItems.add(...)` call:

```js
            await db.practiceItems.add({
              uid: data.uid,
              name: data.name,
              category: data.category ?? 'fundamentals',
              sortOrder,
              archived: data.archived ?? false,
              trashed: data.trashed ?? false,
              trashedAt: data.trashed_at || null,
              syncedOnce: true,
            });
```

**Edit B — `modified` branch (around lines 428-443).** Add a category check inside the updates block. Insert immediately after the `trashed` block, before the `syncedOnce` check:

```js
          if (data.category !== undefined && local.category !== data.category) {
            updates.category = data.category;
          }
```

- [ ] **Step 5.6: `flushSyncQueue` handles `set_category`**

In `flushSyncQueue` (around lines 368-396), add a new branch alongside the existing actions. Insert this immediately after the `trash_item` branch:

```js
        } else if (entry.action === 'set_category') {
          await firebaseBackend.pushSetCategory(entry.payload.uid, entry.payload.category, userId);
```

Also update the existing `reorder` branch (around lines 382-385) so queued reorders preserve category:

Replace the body of the `reorder` branch:

```js
        } else if (entry.action === 'reorder') {
          for (const item of entry.payload.items) {
            const updates = { sort_order: item.sortOrder };
            if (item.category != null) updates.category = item.category;
            await updateDoc(doc(itemsRef(userId), item.uid), updates);
          }
```

- [ ] **Step 5.7: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5.8: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "$(cat <<'EOF'
feat(backend/firebase): full category support

pushItem persists category; pushReorder writes category per item so
cross-section drag is atomic on the remote; pushSetCategory updates
the field on its own; pullAll and the snapshot listener apply
category changes using a tolerant rule (missing == no change).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: App.jsx wiring

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 6.1: Import `setItemCategory` from database**

In `src/App.jsx`, update the import block (lines 26-41). Add `setItemCategory` after `archiveItem`:

```js
import {
  db,
  getItems,
  addItem,
  renameItem,
  deleteItem,
  archiveItem,
  setItemCategory,
  trashItem,
  restoreItem,
  purgeExpiredTrash,
  addLog,
  getTodaysLogs,
  getLogsByDate,
  getLogsByDateRange,
  updateItemOrder,
} from './services/database';
```

- [ ] **Step 6.2: Update `handleAddItem` signature**

In `src/App.jsx`, find the existing `handleAddItem` (lines 477-494). Replace the entire `useCallback` block with:

```js
  const handleAddItem = useCallback(
    async (name, category) => {
      const duplicate = items.some(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        alert(t('duplicateItem'));
        return;
      }
      const localId = await addItem(name, category);
      await loadData();
      if (user) {
        const item = await db.practiceItems.get(localId);
        backend.pushItem(item, user.id).catch(console.error);
      }
    },
    [items, loadData, user, t, backend],
  );
```

The freshly-fetched `item` already includes `category` from the DB (Task 1's migration), so `backend.pushItem` receives it automatically.

- [ ] **Step 6.3: Add `handleSetItemCategory` handler**

In `src/App.jsx`, immediately after the `handleArchiveItem` `useCallback` block (after line 569), add:

```js
  const handleSetItemCategory = useCallback(
    async (id, category) => {
      const item = await db.practiceItems.get(id);
      await setItemCategory(id, category);
      await loadData();
      if (user && item) {
        backend.pushSetCategory(item.uid, category, user.id).catch(console.error);
      }
    },
    [loadData, user, backend],
  );
```

This mirrors `handleArchiveItem` exactly. The push function itself queues offline writes (see Task 5.3 / Task 3.2), so we don't need extra fallback logic here.

- [ ] **Step 6.4: Pass `onSetItemCategory` prop to `<PracticeItemList>`**

Find the `<PracticeItemList ... />` JSX in `src/App.jsx` (around line 1162). Add `onSetItemCategory={handleSetItemCategory}` alongside the other handler props:

```jsx
              onAddItem={handleAddItem}
              ...
              onArchiveItem={handleArchiveItem}
              onSetItemCategory={handleSetItemCategory}
              onReorder={handleReorder}
```

(Place it next to `onArchiveItem` to keep related props grouped. Match the surrounding code's prop ordering.)

Note: the existing `handleReorder` (lines 571-583) already passes full items (via `db.practiceItems.get(id)`) to `backend.pushReorder`, so it picks up `category` from the DB automatically once the migration runs. No change needed in this task. Task 10 will update `handleReorder` to handle the cross-section drag's richer payload shape.

- [ ] **Step 6.5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6.6: Manual verification — DB write path works**

Run `npm run dev`. Open the app. The Practice tab will currently show items in a flat list (Task 8 changes the UI). Don't try to add items yet — `PracticeItemList` is still calling `onAddItem(name)` without a category, and the new `addItem(name, category)` will throw. We'll wire the UI in Tasks 8-10. Just confirm the app still loads existing items.

- [ ] **Step 6.7: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat(app): wire category handlers

handleAddItem accepts category; new handleSetItemCategory mirrors
handleArchiveItem (DB write + push, push handles offline queue).
handleReorder will be updated in Task 10 once the cross-section drag
sends the richer payload shape.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Translations

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 7.1: Add English keys**

In the `en` object inside `translations` (around line 4), insert these keys. Place them alphabetically next to existing top-level keys (e.g. after `archived: 'Archived'` on line 52, add the `categories` block; place `noFundamentalsYet` and `noSongsYet` near `noPracticeItems` line 37):

Add as siblings of `archived`:

```js
    categories: {
      fundamentals: 'Fundamentals',
      songs: 'Songs',
      archived: 'Archived',
      fundamentalsShort: 'F',
      songsShort: 'S',
    },
    selectCategory: 'Select category',
    noFundamentalsYet: 'No fundamentals yet',
    noSongsYet: 'No songs yet',
    addFirstItem: 'Add your first practice item',
```

- [ ] **Step 7.2: Add Chinese keys**

In the `zh` object (around line 193), add the parallel keys:

```js
    categories: {
      fundamentals: '基本功',
      songs: '歌曲',
      archived: '已归档',
      fundamentalsShort: '基',
      songsShort: '歌',
    },
    selectCategory: '选择分类',
    noFundamentalsYet: '还没有基本功项目',
    noSongsYet: '还没有歌曲',
    addFirstItem: '添加你的第一个练习项目',
```

- [ ] **Step 7.3: Verify build and commit**

```bash
npm run build
git add src/contexts/LanguageContext.jsx
git commit -m "$(cat <<'EOF'
i18n: add category translation keys (en/zh)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: PracticeItemList — Normal Mode (sections + collapsed Archived)

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

This task only changes the normal-mode return path (the bottom of the component, around lines 344-398). Edit mode stays untouched until Tasks 9-10.

- [ ] **Step 8.1: Add `showArchivedNormal` state**

Inside the component body, near the other `useState` hooks (around line 64-66), add:

```js
const [showArchivedNormal, setShowArchivedNormal] = useState(false);
```

- [ ] **Step 8.2: Replace the normal-mode return block**

Replace the entire normal-mode return (the `// --- Normal (timer) mode ---` block, currently lines 344-398) with:

```jsx
  // --- Normal (timer) mode ---
  const fundamentalsItems = activeItems.filter(i => i.category === 'fundamentals');
  const songsItems = activeItems.filter(i => i.category === 'songs');

  const renderRow = (item, indexInActive) => {
    const isActive = activeItemId === item.id;
    const isFocused = focusedIndex !== null && indexInActive === focusedIndex;
    const savedTotal = totals[item.id] || 0;
    const displayTime = isActive ? savedTotal + elapsedTime : savedTotal;
    return (
      <div
        key={item.id}
        className={`bg-white rounded-lg shadow-sm p-4 flex items-center justify-between transition-colors ${
          isActive ? 'ring-2 ring-blue-500' : isFocused ? 'ring-2 ring-gray-300' : ''
        }`}
      >
        <div className="flex flex-col">
          <span className="font-medium text-gray-800">{item.name}</span>
          <span className="font-mono text-lg text-gray-600">
            {formatTime(displayTime)}
          </span>
        </div>
        {isActive ? (
          <button
            onClick={onStop}
            className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
          >
            {t('stop')}
          </button>
        ) : (
          <button
            onClick={() => onStart(item.id)}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            {t('start')}
          </button>
        )}
      </div>
    );
  };

  // Compute display index for keyboard focus (matches activeItems order: fundamentals first, then songs)
  const orderedActive = [...fundamentalsItems, ...songsItems];
  const indexOf = (id) => orderedActive.findIndex(i => i.id === id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
          {t('categories.fundamentals')}
        </h3>
        {fundamentalsItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">{t('noFundamentalsYet')}</p>
        ) : (
          fundamentalsItems.map(item => renderRow(item, indexOf(item.id)))
        )}
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
          {t('categories.songs')}
        </h3>
        {songsItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">{t('noSongsYet')}</p>
        ) : (
          songsItems.map(item => renderRow(item, indexOf(item.id)))
        )}
      </div>

      {hasArchivedItems && (
        <div className="mt-2">
          <button
            onClick={() => setShowArchivedNormal(!showArchivedNormal)}
            className="w-full text-left px-1 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"
            aria-expanded={showArchivedNormal}
          >
            <span className="text-xs">{showArchivedNormal ? '▾' : '▸'}</span>
            {t('categories.archived')} ({archivedItems.length})
          </button>
          {showArchivedNormal && (
            <div className="flex flex-col gap-2 mt-1">
              {archivedItems.map(item => {
                const savedTotal = totals[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between opacity-50"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{item.name}</span>
                      <span className="font-mono text-lg text-gray-600">
                        {formatTime(savedTotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeItems.length === 0 && (
        <p className="text-center text-gray-400 py-4">
          {t('addFirstItem')}
        </p>
      )}

      <button
        onClick={() => onSetEditing(true)}
        className="mt-1 px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
      >
        {t('edit')}
      </button>
    </div>
  );
```

- [ ] **Step 8.3: Update keyboard navigation to use orderedActive**

The existing `handleKeyDown` callback (lines 95-121) uses `activeItems` directly. Replace `activeItems` with the explicitly-ordered list (fundamentals first, then songs). Find the callback and change:

Before:
```js
if (activeItems.length === 0) return;

if (e.code === 'ArrowUp') {
  e.preventDefault();
  setFocusedIndex((prev) => prev === null ? activeItems.length - 1 : Math.max(0, prev - 1));
} else if (e.code === 'ArrowDown') {
  e.preventDefault();
  setFocusedIndex((prev) => prev === null ? 0 : Math.min(activeItems.length - 1, prev + 1));
}
```

After (replace `activeItems` references with a freshly-computed `orderedActive` inside the callback):
```js
const orderedActive = [
  ...activeItems.filter(i => i.category === 'fundamentals'),
  ...activeItems.filter(i => i.category === 'songs'),
];
if (orderedActive.length === 0) return;

if (e.code === 'ArrowUp') {
  e.preventDefault();
  setFocusedIndex((prev) => prev === null ? orderedActive.length - 1 : Math.max(0, prev - 1));
} else if (e.code === 'ArrowDown') {
  e.preventDefault();
  setFocusedIndex((prev) => prev === null ? 0 : Math.min(orderedActive.length - 1, prev + 1));
} else if (e.code === 'Space') {
  e.preventDefault();
  if (focusedIndex === null) {
    if (activeItemId != null) onStop();
    return;
  }
  const focusedItem = orderedActive[focusedIndex];
  if (!focusedItem) return;
  if (activeItemId === focusedItem.id) {
    onStop();
  } else {
    onStart(focusedItem.id);
  }
}
```

Also update the dependency array of `useCallback` to remove the stale `activeItems` reference (it's still there because we filter from it) — keep `activeItems` in the deps. The bounds-clamp `useEffect` (around lines 137-141) also uses `activeItems.length`; replace its body with:

```js
useEffect(() => {
  const orderedActive = [
    ...activeItems.filter(i => i.category === 'fundamentals'),
    ...activeItems.filter(i => i.category === 'songs'),
  ];
  if (focusedIndex !== null && focusedIndex >= orderedActive.length) {
    setFocusedIndex(orderedActive.length > 0 ? orderedActive.length - 1 : null);
  }
}, [activeItems, focusedIndex]);
```

And the focus-restore effect (around lines 129-134) — update to use orderedActive:

```js
useEffect(() => {
  if (focusedIndex === null && activeItemId != null) {
    const orderedActive = [
      ...activeItems.filter(i => i.category === 'fundamentals'),
      ...activeItems.filter(i => i.category === 'songs'),
    ];
    const idx = orderedActive.findIndex((item) => item.id === activeItemId);
    if (idx !== -1) setFocusedIndex(idx);
  }
}, [activeItemId, activeItems, focusedIndex]);
```

- [ ] **Step 8.4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 8.5: Manual verification**

Run `npm run dev`. In the Practice tab:
- Existing items appear under a **Fundamentals** header (because the migration set every existing item's category to `'fundamentals'`).
- A **Songs** header appears below with `No songs yet` placeholder text.
- If you have any archived items, an **▸ Archived (N)** row sits below — click it to expand; archived items show as faded read-only rows.
- Press ↓ / ↑ to focus a row, Space to start/stop. Verify focus moves through Fundamentals items.

Don't try to add items yet — Add still uses the old non-category form and will throw.

- [ ] **Step 8.6: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "$(cat <<'EOF'
feat(ui): group practice items by category in normal mode

Practice tab now shows Fundamentals and Songs sections with placeholders
when empty, plus a collapsed Archived section. Keyboard nav traverses
fundamentals-then-songs in display order.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: PracticeItemList — Edit Mode (segmented picker + add row)

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

This task adds the per-row F/S picker and the add-row category picker. It does NOT change drag-and-drop yet — that's Task 10.

- [ ] **Step 9.1: Accept `onSetItemCategory` prop**

Update the component's prop list (around lines 42-58) to include the new prop:

```js
function PracticeItemList({
  items,
  totals,
  activeItemId,
  elapsedTime,
  editing,
  onSetEditing,
  onStart,
  onStop,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  onReorder,
  onArchiveItem,
  onRestoreItem,
  onPermanentDelete,
  onSetItemCategory,
}) {
```

- [ ] **Step 9.2: Add `addCategory` state**

Near the other `useState` hooks, add:

```js
const [addCategory, setAddCategory] = useState('fundamentals');
```

Reset it whenever edit mode is entered. Add a new effect:

```js
useEffect(() => {
  if (editing) setAddCategory('fundamentals');
}, [editing]);
```

- [ ] **Step 9.3: Add a `<CategoryToggle>` helper inside the component**

Just before the `// --- Edit mode ---` section, add a small helper component (defined inline so it can read `t`):

```js
const CategoryToggle = ({ value, onChange, ariaLabel }) => (
  <div role="group" aria-label={ariaLabel || t('selectCategory')} className="inline-flex rounded-md overflow-hidden border border-gray-300">
    <button
      type="button"
      onClick={() => onChange('fundamentals')}
      title={t('categories.fundamentals')}
      aria-pressed={value === 'fundamentals'}
      className={`px-2 py-1 text-xs font-semibold ${
        value === 'fundamentals' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
      }`}
    >
      {t('categories.fundamentalsShort')}
    </button>
    <button
      type="button"
      onClick={() => onChange('songs')}
      title={t('categories.songs')}
      aria-pressed={value === 'songs'}
      className={`px-2 py-1 text-xs font-semibold border-l border-gray-300 ${
        value === 'songs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
      }`}
    >
      {t('categories.songsShort')}
    </button>
  </div>
);
```

- [ ] **Step 9.4: Add per-row category toggle in edit mode**

In the existing edit-mode `displayItems.map((item) => ...)` block (around lines 196-249), find the row's action button group (the `<div className="flex items-center gap-1">` containing the archive and delete buttons, around lines 218-246). Insert the `CategoryToggle` immediately before the archive button:

```jsx
                  <div className="flex items-center gap-1">
                    <CategoryToggle
                      value={item.category}
                      onChange={(c) => onSetItemCategory(item.id, c)}
                      ariaLabel={`${t('selectCategory')}: ${item.name}`}
                    />
                    <button
                      onClick={() => onArchiveItem(item.id, !item.archived)}
                      ...
```

(Leave the rest of the buttons unchanged.)

- [ ] **Step 9.5: Add category toggle to the Add row**

Find the existing add-row block (around lines 259-275):

```jsx
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            ...
```

Replace it with:

```jsx
        <div className="flex gap-2 items-center">
          <CategoryToggle value={addCategory} onChange={setAddCategory} />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder={t('newItemPlaceholder')}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + {t('add')}
          </button>
        </div>
```

- [ ] **Step 9.6: Update `handleAdd` to pass category**

Replace the existing `handleAdd` (around lines 143-148):

```js
const handleAdd = () => {
  const name = newName.trim();
  if (!name) return;
  onAddItem(name, addCategory);
  setNewName('');
};
```

- [ ] **Step 9.7: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 9.8: Manual verification**

Run `npm run dev`. Click **Edit**:
- Each row shows an **F**/**S** segmented control. The active category is highlighted blue.
- Tap **S** on a Fundamentals item — the row stays in place but if you exit edit mode, the item now appears under Songs.
- The Add row has its own F/S picker. Tap **S**, type "Tom Sawyer", click **+ Add**. Exit edit mode: "Tom Sawyer" appears under Songs.
- Add another song without re-tapping S — the picker remembers your choice within the same edit session. Re-enter edit mode → picker resets to F.
- Verify offline: in DevTools → Network, switch to **Offline**, change a category in edit mode. Reconnect → check the IndexedDB `syncQueue` clears once the queue flushes.

- [ ] **Step 9.9: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add category picker in edit mode

Each item row in edit mode shows an F/S segmented control to reassign
category. The add row has its own picker that defaults to Fundamentals
each time edit mode opens, then persists across consecutive adds.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: PracticeItemList — Edit Mode drag across sections

**Files:**
- Modify: `src/components/PracticeItemList.jsx`
- Modify: `src/App.jsx` (one tweak to `handleReorder` if needed)

This task replaces the single `SortableContext` in edit mode with two — one per category — wrapped in one `DndContext`. Cross-section drops change the item's category and reorder atomically.

- [ ] **Step 10.1: Import `useDroppable`**

At the top of `src/components/PracticeItemList.jsx`, update the `@dnd-kit/core` import (line 2) to include `useDroppable`:

```js
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
```

- [ ] **Step 10.2: Add an `EmptyDropZone` helper**

Inside the component body, before the `// --- Edit mode ---` section (alongside `CategoryToggle`), add:

```jsx
const EmptyDropZone = ({ id, label }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`text-sm italic px-3 py-4 rounded-lg border border-dashed transition-colors ${
        isOver ? 'bg-blue-50 border-blue-400 text-blue-600' : 'bg-white border-gray-300 text-gray-400'
      }`}
    >
      {label}
    </div>
  );
};
```

- [ ] **Step 10.3: Compute per-category lists for edit mode**

Inside the edit-mode block (just before the JSX `return`), compute the two category-scoped lists from `displayItems`:

```js
const editFundamentals = displayItems.filter(i => i.category === 'fundamentals');
const editSongs = displayItems.filter(i => i.category === 'songs');
```

(Add this immediately before `return ( <div className="flex flex-col gap-3"> ...` inside the `if (editing)` branch.)

- [ ] **Step 10.4: Replace the existing single `SortableContext` with two**

In the edit-mode return block (currently around lines 189-251), find the `<DndContext>` wrapper. Replace its inner `<SortableContext> ... </SortableContext>` with two SortableContexts plus drop zones, organized by category. The new structure:

```jsx
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
              {t('categories.fundamentals')}
            </h3>
            <SortableContext items={editFundamentals.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {editFundamentals.length === 0 ? (
                <EmptyDropZone id="category-fundamentals" label={t('noFundamentalsYet')} />
              ) : (
                editFundamentals.map(item => renderEditRow(item))
              )}
            </SortableContext>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
              {t('categories.songs')}
            </h3>
            <SortableContext items={editSongs.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {editSongs.length === 0 ? (
                <EmptyDropZone id="category-songs" label={t('noSongsYet')} />
              ) : (
                editSongs.map(item => renderEditRow(item))
              )}
            </SortableContext>
          </div>
        </DndContext>
```

The `renderEditRow(item)` is just the existing `<SortableItem>` JSX wrapped in a function for reuse. Define it just inside the `if (editing)` block, before the per-category list computation:

```jsx
const renderEditRow = (item) => (
  <SortableItem key={item.id} item={item}>
    <div className={`flex-1 flex items-center justify-between ml-2 ${item.archived ? 'opacity-50' : ''}`}>
      {editingItemId === item.id ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={commitRename}
          autoFocus
          className="flex-1 mr-3 px-3 py-1 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <span
          onClick={() => startRename(item)}
          className="font-medium text-gray-800 cursor-pointer hover:text-blue-600 transition-colors"
          title="Click to rename"
        >
          {item.name}
        </span>
      )}
      <div className="flex items-center gap-1">
        <CategoryToggle
          value={item.category}
          onChange={(c) => onSetItemCategory(item.id, c)}
          ariaLabel={`${t('selectCategory')}: ${item.name}`}
        />
        <button
          onClick={() => onArchiveItem(item.id, !item.archived)}
          className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
          title={item.archived ? t('unarchive') : t('archive')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4zM2 9a1 1 0 000 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a1 1 0 100-2H2zm5 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" />
          </svg>
        </button>
        <button
          onClick={() => onDeleteItem(item.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          title="Delete item"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  </SortableItem>
);
```

(This is the same JSX that was inline in Task 9 step 9.4 — just extracted into a helper.)

Remove the now-redundant `displayItems.length === 0` placeholder block below the DndContext (the empty-list message is replaced by per-section EmptyDropZones).

- [ ] **Step 10.5: Replace `handleDragEnd` to handle cross-section drops**

Replace the existing `handleDragEnd` (around lines 82-92) with:

```js
const handleDragEnd = (event) => {
  const { active, over } = event;
  if (!over) return;

  const activeItem = displayItems.find(i => i.id === active.id);
  if (!activeItem) return;

  // Drop target is either another item id, or an empty-zone id
  // (e.g. 'category-fundamentals' / 'category-songs').
  const isEmptyZone = typeof over.id === 'string' && over.id.startsWith('category-');
  const targetCategory = isEmptyZone
    ? (over.id === 'category-fundamentals' ? 'fundamentals' : 'songs')
    : displayItems.find(i => i.id === over.id)?.category;
  if (!targetCategory) return;

  // No-op: dropped on itself within the same category.
  if (!isEmptyZone && active.id === over.id) return;

  // Rebuild per-category lists with the dragged item removed from its old slot,
  // then re-insert at the drop position with the (possibly new) category.
  const fundamentals = displayItems
    .filter(i => i.category === 'fundamentals' && i.id !== active.id);
  const songs = displayItems
    .filter(i => i.category === 'songs' && i.id !== active.id);

  const movedItem = { ...activeItem, category: targetCategory };
  const targetList = targetCategory === 'fundamentals' ? fundamentals : songs;

  if (isEmptyZone) {
    targetList.push(movedItem);
  } else {
    const dropIndex = targetList.findIndex(i => i.id === over.id);
    if (dropIndex === -1) {
      targetList.push(movedItem);
    } else {
      targetList.splice(dropIndex, 0, movedItem);
    }
  }

  // Concatenate fundamentals + songs to produce the new global ordering.
  const ordered = [...fundamentals, ...songs];
  onReorder(ordered.map(i => ({ id: i.id, category: i.category })));
};
```

Note: the argument shape passed to `onReorder` changes from `[id, ...]` to `[{ id, category }, ...]`. We update `handleReorder` in `App.jsx` to accept the richer shape in step 10.6.

- [ ] **Step 10.6: Update App.jsx `handleReorder` to accept the new shape**

In `src/App.jsx`, replace the existing `handleReorder` (lines 571-583) with:

```js
  const handleReorder = useCallback(
    async (orderedEntries) => {
      // Tolerate both shapes: [id, ...] (legacy) and [{ id, category }, ...] (cross-section drag).
      const normalized = orderedEntries.map(e =>
        typeof e === 'object' ? e : { id: e, category: null }
      );

      await db.transaction('rw', db.practiceItems, async () => {
        for (let i = 0; i < normalized.length; i++) {
          const update = { sortOrder: i };
          if (normalized[i].category) update.category = normalized[i].category;
          await db.practiceItems.update(normalized[i].id, update);
        }
      });
      await loadData();

      if (user) {
        const reorderedItems = await Promise.all(
          normalized.map(({ id }) => db.practiceItems.get(id))
        );
        backend.pushReorder(reorderedItems, user.id).catch(console.error);
      }
    },
    [loadData, user, backend],
  );
```

Then remove `updateItemOrder` from the import block at the top of `src/App.jsx` (around line 41) — it's no longer used:

```js
import {
  db,
  getItems,
  addItem,
  renameItem,
  deleteItem,
  archiveItem,
  setItemCategory,
  trashItem,
  restoreItem,
  purgeExpiredTrash,
  addLog,
  getTodaysLogs,
  getLogsByDate,
  getLogsByDateRange,
} from './services/database';
```

(The `updateItemOrder` export remains in `database.js` for any future caller — we just no longer use it from `App.jsx`.)

- [ ] **Step 10.7: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10.8: Manual verification — drag across sections**

Run `npm run dev`. In edit mode:
- Drag a Fundamentals item by its ⋮⋮ handle and drop it onto a Songs item. Verify:
  - The item visually moves to the Songs section.
  - The dropped position is preserved (drops above/below the target).
  - Exit edit mode and re-enter — the item is still in Songs.
  - Refresh the page — order and category persist.
- Move all items out of one category. The empty section shows the dashed `EmptyDropZone` placeholder. Drag an item onto that empty zone — it lands at the end of that section.
- With Firebase backend signed in: open Firestore console → confirm the `category` field on the affected docs updated.

- [ ] **Step 10.9: Commit**

```bash
git add src/components/PracticeItemList.jsx src/App.jsx
git commit -m "$(cat <<'EOF'
feat(ui): drag across categories in edit mode

Edit mode now uses two SortableContexts (one per category) inside one
DndContext, with droppable empty zones for each section. Cross-section
drops change the item's category atomically via pushReorder, which
carries category per item.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification — full spec testing checklist

No code changes in this task. Walk through the spec's manual checklist end-to-end.

- [ ] **Step 11.1: Build clean**

Run: `npm run build`
Expected: Build succeeds, no warnings beyond the existing ones.

- [ ] **Step 11.2: Run the spec checklist**

Run `npm run dev`. Step through every item in the spec's "Testing Checklist" section ([../specs/2026-05-06-practice-item-categories-design.md](../specs/2026-05-06-practice-item-categories-design.md#testing-checklist-manual)):

- [ ] Fresh DB: add a Fundamentals item → appears under Fundamentals header. Add a Songs item → appears under Songs header.
- [ ] Existing user upgrade path: verify migration set every existing item to Fundamentals.
- [ ] Edit mode: tap **S** on a Fundamentals item → moves to Songs without page reload.
- [ ] Drag a Fundamentals item into the Songs section → category changes; sort order persists after reload.
- [ ] Drag onto an empty section's drop zone → drops at end of that category.
- [ ] Archive an item → disappears from its category, appears under "Archived (N)" collapsed section. Restore → returns to original category.
- [ ] Sign in on a second device with the *old* build (or a tab without the migration) → items still load.
- [ ] After upgrading the second device → categories sync via tolerant pull.
- [ ] Offline category change → DevTools shows `set_category` queued. Reconnect → flushes successfully.
- [ ] Active timer + category change → timer keeps running, total accrues correctly.
- [ ] Language toggle: section headers and placeholders translate to zh.

- [ ] **Step 11.3: Mobile responsive check**

Open the dev server URL on a phone (or use Chrome DevTools device emulation). Verify:
- Section headers don't wrap awkwardly.
- Each row's F/S picker fits without overflowing the row.
- Drag handle still grabs cleanly via long-press.

- [ ] **Step 11.4: PocketBase admin schema check (deployment readiness)**

If you intend to deploy to a PocketBase backend, confirm the `category` text field has been added to the `practice_items` collection in the PocketBase admin UI with default `fundamentals` and not required. If this hasn't been done, queue it as a deployment task — the client tolerates missing `category` on read, but the field must exist in the schema before items can be created/updated successfully.

- [ ] **Step 11.5: Done**

No final commit needed (Task 11 is verification only). If any step uncovered a bug, fix it in a small follow-up commit referencing the specific checklist item.

---

## Self-Review Notes

- **Spec coverage.** Every section of the spec maps to at least one task: data model → Task 1; migration → Task 1 + Tasks 3.4, 5.4 (tolerant pull); sync → Tasks 2, 3, 4, 5; UI normal mode → Task 8; UI edit mode → Tasks 9, 10; App.jsx wiring → Task 6; translations → Task 7; testing → Task 11.
- **Lazy backfill helper.** The spec mentions `backfillCategoryOnRemote(userId)` as a one-time post-migration helper. It's not strictly needed (tolerant pull + lazy backfill on push covers the same cases for v1), and the spec calls it "complementary." I've left it out of the plan; if multi-device testing in Task 11 surfaces a real convergence issue, add it as a small follow-up. This is documented here so a future reader knows the omission was deliberate.
- **PocketBase write methods are stubs.** That matches the existing `pushReorder`/`pushArchiveItem`/etc. pattern in the codebase. Once the broader uid-migration work lands for PocketBase, `pushSetCategory` and the rest are implemented together.
- **Pushing reorder + category atomically.** Done in Task 5.2 (Firebase) and Task 10.6 (App.jsx wiring) — `pushReorder` carries category per item.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-06-practice-item-categories.md`.
