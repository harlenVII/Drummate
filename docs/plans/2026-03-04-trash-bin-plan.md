# Trash Bin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a trash bin so deleted practice items are recoverable for 30 days before permanent deletion.

**Architecture:** Add `trashed` (boolean) and `trashedAt` (ISO date string) fields to practiceItems. The delete button soft-deletes to trash. Auto-purge on app load removes items trashed >30 days ago. Trashed items and their logs are excluded from reports and totals.

**Tech Stack:** Dexie.js (IndexedDB), React, PocketBase sync, Firebase sync, Tailwind CSS v4

---

### Task 1: Database Schema — Add trashed fields

**Files:**
- Modify: `src/services/database.js:46-66`

**Step 1: Add DB version 7 with trashed fields**

Add after the version 6 block (line 54):

```javascript
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
```

**Step 2: Add trashItem database function**

Add after the `archiveItem` function (line 87):

```javascript
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
    .where('trashed').equals(1)
    .filter(item => item.trashedAt && item.trashedAt < cutoffISO)
    .toArray();

  for (const item of expiredItems) {
    await db.practiceLogs.where('itemId').equals(item.id).delete();
    await db.practiceItems.delete(item.id);
  }

  return expiredItems;
};
```

**Step 3: Update addItem to include trashed defaults**

In the `addItem` function (line 65), update the add call:

```javascript
return await db.practiceItems.add({ name, sortOrder, archived: false, trashed: false, trashedAt: null });
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```
feat: add trashed/trashedAt fields to database schema (v7)
```

---

### Task 2: Sync Layer — PocketBase trash sync

**Files:**
- Modify: `src/services/sync.js:140-196` (after pushArchiveItem, before flushSyncQueue)

**Step 1: Add pushTrashItem function**

Add after `pushArchiveItem` (line 158):

```javascript
export async function pushTrashItem(name, trashed, trashedAt, userId) {
  try {
    const remoteItems = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name }),
      requestKey: null,
    });
    if (remoteItems.totalItems > 0) {
      await pb.collection('practice_items').update(remoteItems.items[0].id, {
        trashed: !!trashed,
        trashed_at: trashedAt || '',
      }, { requestKey: null });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('trash_item', { name, trashed: !!trashed, trashedAt: trashedAt || '' });
    } else {
      throw err;
    }
  }
}
```

**Step 2: Add trash_item to flushSyncQueue**

In `flushSyncQueue` (around line 188), add after the `archive_item` handler:

```javascript
} else if (entry.action === 'trash_item') {
  await pushTrashItem(entry.payload.name, entry.payload.trashed, entry.payload.trashedAt, userId);
}
```

**Step 3: Update pullAll to sync trashed fields**

In `pullAll` (lines 207-228), update the item creation and update logic:

When creating a new local item from remote (line 211-215), add:
```javascript
trashed: remote.trashed ?? false,
trashedAt: remote.trashed_at || null,
```

When checking for updates (lines 221-223), add:
```javascript
if (remote.trashed != null && existing.trashed !== remote.trashed) {
  updates.trashed = remote.trashed;
  updates.trashedAt = remote.trashed_at || null;
}
```

**Step 4: Update pushItem to include trashed fields**

In `pushItem` (line 19-24), add to the create payload:
```javascript
trashed: localItem.trashed ?? false,
trashed_at: localItem.trashedAt || '',
```

**Step 5: Update subscribeToChanges for trashed**

In the SSE `create` handler (lines 282-286), add:
```javascript
trashed: e.record.trashed ?? false,
trashedAt: e.record.trashed_at || null,
```

In the SSE `update` handler (lines 294-300), add trashed field checks:
```javascript
if (e.record.trashed != null && localByName.trashed !== e.record.trashed) {
  updates.trashed = e.record.trashed;
  updates.trashedAt = e.record.trashed_at || null;
}
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```
feat: add trash sync support to PocketBase backend
```

---

### Task 3: Sync Layer — Firebase trash sync

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

**Step 1: Add pushTrashItem method**

Add after `pushArchiveItem` (line 226):

```javascript
async pushTrashItem(name, trashed, trashedAt, userId) {
  try {
    const docId = encodeURIComponent(name);
    await updateDoc(doc(itemsRef(userId), docId), {
      trashed: !!trashed,
      trashed_at: trashedAt || '',
    });
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('trash_item', { name, trashed: !!trashed, trashedAt: trashedAt || '' });
    } else {
      throw err;
    }
  }
},
```

**Step 2: Add trash_item to flushSyncQueue**

In `flushSyncQueue` (around line 312-314), add after archive_item:

```javascript
} else if (entry.action === 'trash_item') {
  await firebaseBackend.pushTrashItem(entry.payload.name, entry.payload.trashed, entry.payload.trashedAt, userId);
}
```

**Step 3: Update pullAll to sync trashed fields**

In `pullAll` (lines 230-252), update item creation to include:
```javascript
trashed: data.trashed ?? false,
trashedAt: data.trashed_at || null,
```

And add trashed field check to updates block:
```javascript
if (data.trashed != null && existing.trashed !== data.trashed) {
  updates.trashed = data.trashed;
  updates.trashedAt = data.trashed_at || null;
}
```

**Step 4: Update pushItem to include trashed**

In `pushItem` (around line 117), add to the setDoc data:
```javascript
trashed: localItem.trashed ?? false,
trashed_at: localItem.trashedAt || '',
```

**Step 5: Update real-time subscriptions**

In `subscribeToChanges` 'added' handler (lines 338-342), add:
```javascript
trashed: data.trashed ?? false,
trashedAt: data.trashed_at || null,
```

In 'modified' handler (lines 349-354), add trashed check:
```javascript
if (data.trashed != null && localItem.trashed !== data.trashed) {
  updates.trashed = data.trashed;
  updates.trashedAt = data.trashed_at || null;
}
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```
feat: add trash sync support to Firebase backend
```

---

### Task 4: Backend Interface — Add pushTrashItem

**Files:**
- Modify: `src/services/backends/backendInterface.js:14-22`
- Modify: `src/services/backends/pocketbaseBackend.js:1-6, 54-63`

**Step 1: Add pushTrashItem to interface docs**

In `backendInterface.js`, add after the `pushArchiveItem` line:
```javascript
 *   pushTrashItem(name, trashed, trashedAt, userId) → void
```

**Step 2: Export pushTrashItem from pocketbaseBackend**

In `pocketbaseBackend.js`, add `pushTrashItem` to the import from `'../sync'` and add it to the backend object.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```
docs: add pushTrashItem to backend interface spec
```

---

### Task 5: App Handlers — Trash, Restore, and Auto-Purge

**Files:**
- Modify: `src/App.jsx:27-34` (imports), `src/App.jsx:227-236` (loadData), `src/App.jsx:479-511` (handlers)

**Step 1: Update imports**

Add `trashItem`, `restoreItem`, `purgeExpiredTrash` to the database imports in App.jsx (line 27-34).

**Step 2: Update loadData to exclude trashed items from totals**

In `loadData` (lines 227-236), filter out logs belonging to trashed items:

```javascript
const loadData = useCallback(async () => {
  const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
  setItems(allItems);

  const trashedIds = new Set(allItems.filter(i => i.trashed).map(i => i.id));
  const totalsMap = {};
  for (const log of logs) {
    if (!trashedIds.has(log.itemId)) {
      totalsMap[log.itemId] = (totalsMap[log.itemId] || 0) + log.duration;
    }
  }
  setTotals(totalsMap);
}, []);
```

**Step 3: Change handleDeleteItem to soft-delete (trash)**

Replace the current `handleDeleteItem` (lines 479-494):

```javascript
const handleDeleteItem = useCallback(
  async (id) => {
    if (activeItemId === id) {
      stopTimer();
      setActiveItemId(null);
      setElapsedTime(0);
    }
    const item = await db.practiceItems.get(id);
    await trashItem(id);
    await loadData();
    if (user && item) {
      backend.pushTrashItem(item.name, true, new Date().toISOString(), user.id).catch(console.error);
    }
  },
  [activeItemId, stopTimer, loadData, user, backend],
);
```

**Step 4: Add handleRestoreItem handler**

Add after handleDeleteItem:

```javascript
const handleRestoreItem = useCallback(
  async (id) => {
    const item = await db.practiceItems.get(id);
    await restoreItem(id);
    await loadData();
    if (user && item) {
      backend.pushTrashItem(item.name, false, null, user.id).catch(console.error);
    }
  },
  [loadData, user, backend],
);
```

**Step 5: Add handlePermanentDelete handler**

Add after handleRestoreItem:

```javascript
const handlePermanentDelete = useCallback(
  async (id) => {
    if (activeItemId === id) {
      stopTimer();
      setActiveItemId(null);
      setElapsedTime(0);
    }
    const item = await db.practiceItems.get(id);
    await deleteItem(id);
    await loadData();
    if (user && item) {
      backend.pushDeleteItem(item.name, user.id).catch(console.error);
    }
  },
  [activeItemId, stopTimer, loadData, user, backend],
);
```

**Step 6: Add auto-purge on app load**

Add a useEffect after the existing loadData effect (around line 240):

```javascript
useEffect(() => {
  const purge = async () => {
    const expired = await purgeExpiredTrash();
    if (expired.length > 0) {
      await loadData();
      if (user) {
        for (const item of expired) {
          backend.pushDeleteItem(item.name, user.id).catch(console.error);
        }
      }
    }
  };
  purge();
}, [loadData, user, backend]);
```

**Step 7: Pass new handlers to PracticeItemList**

In the JSX where PracticeItemList is rendered (around line 1044), add:
```javascript
onRestoreItem={handleRestoreItem}
onPermanentDelete={handlePermanentDelete}
```

**Step 8: Filter trashed items from report data**

Where reports receive `items` prop (lines 1145, 1155, 1165), change `items={items}` to:
```javascript
items={items.filter(i => !i.trashed)}
```

**Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 10: Commit**

```
feat: add trash/restore/auto-purge handlers in App.jsx
```

---

### Task 6: UI — Trash Section in PracticeItemList

**Files:**
- Modify: `src/components/PracticeItemList.jsx:42-56` (props), `src/components/PracticeItemList.jsx:64-69` (filtering), `src/components/PracticeItemList.jsx:170-278` (edit mode)

**Step 1: Add new props**

Add `onRestoreItem` and `onPermanentDelete` to the component props (line 42-56).

**Step 2: Update filtering logic**

Update the filtering block (lines 64-69):

```javascript
const activeItems = items.filter(item => !item.archived && !item.trashed);
const archivedItems = items.filter(item => item.archived && !item.trashed);
const trashedItems = items.filter(item => item.trashed);
const hasArchivedItems = archivedItems.length > 0;
const hasTrashedItems = trashedItems.length > 0;
const displayItems = editing
  ? (showArchived ? items.filter(i => !i.trashed) : activeItems)
  : activeItems;
```

**Step 3: Add showTrashed state**

Add alongside the existing `showArchived` state:

```javascript
const [showTrashed, setShowTrashed] = useState(false);
```

**Step 4: Add Trash section UI in edit mode**

After the Done button (line 276), add the trash section:

```jsx
{hasTrashedItems && (
  <div className="mt-4">
    <button
      onClick={() => setShowTrashed(!showTrashed)}
      className="self-start px-3 py-1 text-sm text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
    >
      {showTrashed ? t('hideTrash') : `${t('showTrash')} (${trashedItems.length})`}
    </button>

    {showTrashed && (
      <div className="flex flex-col gap-2 mt-3">
        {trashedItems.map((item) => {
          const daysLeft = item.trashedAt
            ? Math.max(0, 30 - Math.floor((Date.now() - new Date(item.trashedAt).getTime()) / (1000 * 60 * 60 * 24)))
            : 0;
          return (
            <div key={item.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center opacity-50">
              <div className="flex-1 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-medium text-gray-800">{item.name}</span>
                  <span className="text-xs text-red-400">
                    {t('daysLeft', { days: daysLeft })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRestoreItem(item.id)}
                    className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                    title={t('restore')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0zm0-6a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t('confirmPermanentDelete'))) {
                        onPermanentDelete(item.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    title={t('permanentDelete')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```
feat: add trash UI section to PracticeItemList
```

---

### Task 7: Translations — Add trash-related strings

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

**Step 1: Add English translations**

Add after the `hideArchived` entry:
```javascript
showTrash: 'Show Trash',
hideTrash: 'Hide Trash',
restore: 'Restore',
permanentDelete: 'Delete Permanently',
confirmPermanentDelete: 'This will permanently delete this item and all its practice logs. This cannot be undone. Continue?',
daysLeft: '{days}d left',
```

**Step 2: Add Chinese translations**

Add after the Chinese `hideArchived` entry:
```javascript
showTrash: '显示回收站',
hideTrash: '隐藏回收站',
restore: '恢复',
permanentDelete: '永久删除',
confirmPermanentDelete: '这将永久删除此项目及其所有练习记录。此操作无法撤销。是否继续？',
daysLeft: '剩余{days}天',
```

**Step 3: Update the `t()` function to support interpolation**

The `daysLeft` string uses `{days}` placeholder. Check if the `t()` function already supports interpolation. If not, update it to handle `t('daysLeft', { days: 23 })` by replacing `{key}` placeholders in the string.

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```
feat: add trash bin translations (en/zh)
```

---

### Task 8: Final Verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Manual testing checklist**

- [ ] Delete an item → goes to trash (not permanently deleted)
- [ ] Trash section appears in edit mode
- [ ] Restore from trash → item returns to active list
- [ ] Permanent delete from trash → item and logs removed
- [ ] Trashed items excluded from daily/weekly/monthly reports
- [ ] Trashed items excluded from today's totals on practice tab
- [ ] Language toggle shows correct trash translations (en/zh)
- [ ] Auto-purge works for items trashed >30 days (can test by manually setting old trashedAt)

**Step 3: Final commit if any fixes needed**
