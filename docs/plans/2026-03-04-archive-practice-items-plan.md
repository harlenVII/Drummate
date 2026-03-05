# Archive Practice Items — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to archive practice items (soft-hide) without deleting them or their practice logs.

**Architecture:** Add `archived` boolean field to practiceItems in Dexie (v6 migration). Filter in UI (Practice tab). Both PocketBase and Firebase backends sync the field. Reports unaffected.

**Tech Stack:** Dexie.js, React, Tailwind CSS v4, PocketBase SDK, Firebase Firestore

---

### Task 1: Database — Add `archived` field and migration

**Files:**
- Modify: `src/services/database.js:35-44` (add v6 schema)
- Modify: `src/services/database.js:46-55` (add archiveItem function)

**Step 1: Add Dexie v6 schema with migration**

Add after the existing v5 block (line 44):

```javascript
db.version(6).stores({
  practiceItems: '++id, name, sortOrder, archived',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  await tx.table('practiceItems').toCollection().modify(item => {
    item.archived = false;
  });
});
```

**Step 2: Add `archiveItem` function**

Add after `updateItemOrder` (line 73):

```javascript
export const archiveItem = async (id, archived) => {
  return await db.practiceItems.update(id, { archived });
};
```

**Step 3: Update `addItem` to include `archived: false`**

Change line 55:
```javascript
// Before:
return await db.practiceItems.add({ name, sortOrder });
// After:
return await db.practiceItems.add({ name, sortOrder, archived: false });
```

**Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```
feat: add archived field to practiceItems database schema
```

---

### Task 2: i18n — Add translation keys

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

**Step 1: Add English translation keys**

Add to the `en` translations object (near the existing `edit`/`done` keys):

```javascript
archive: 'Archive',
unarchive: 'Unarchive',
showArchived: 'Show Archived',
hideArchived: 'Hide Archived',
```

**Step 2: Add Chinese translation keys**

Add to the `zh` translations object:

```javascript
archive: '归档',
unarchive: '取消归档',
showArchived: '显示已归档',
hideArchived: '隐藏已归档',
```

**Step 3: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 4: Commit**

```
feat: add i18n keys for archive feature
```

---

### Task 3: App.jsx — Add `handleArchiveItem` handler and filter items

**Files:**
- Modify: `src/App.jsx`

**Step 1: Import `archiveItem` from database.js**

Update the import block (line 23-34) to add `archiveItem`:

```javascript
import {
  db,
  getItems,
  addItem,
  renameItem,
  deleteItem,
  archiveItem,
  addLog,
  getTodaysLogs,
  getLogsByDate,
  getLogsByDateRange,
  updateItemOrder,
} from './services/database';
```

**Step 2: Add `handleArchiveItem` callback**

Add after `handleDeleteItem` (after line 493):

```javascript
const handleArchiveItem = useCallback(
  async (id, archived) => {
    if (activeItemId === id) {
      stopTimer();
      setActiveItemId(null);
      setElapsedTime(0);
    }
    const item = await db.practiceItems.get(id);
    await archiveItem(id, archived);
    await loadData();
    if (user && item) {
      backend.pushArchiveItem(item.name, archived, user.id).catch(console.error);
    }
  },
  [activeItemId, stopTimer, loadData, user, backend],
);
```

**Step 3: Pass `onArchiveItem` to PracticeItemList**

Update the `<PracticeItemList>` JSX (around line 1026-1039) to add the prop:

```jsx
<PracticeItemList
  items={items}
  totals={totals}
  activeItemId={activeItemId}
  elapsedTime={elapsedTime}
  editing={editing}
  onSetEditing={handleSetEditing}
  onStart={handleStart}
  onStop={handleStop}
  onAddItem={handleAddItem}
  onRenameItem={handleRenameItem}
  onDeleteItem={handleDeleteItem}
  onArchiveItem={handleArchiveItem}
  onReorder={handleReorder}
/>
```

**Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```
feat: add handleArchiveItem handler in App.jsx
```

---

### Task 4: PracticeItemList — Archive UI in edit mode + filter toggle

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

**Step 1: Add `onArchiveItem` prop and `showArchived` state**

Update the component props to include `onArchiveItem` and add state:

```javascript
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
  onArchiveItem,
  onReorder,
}) {
  const { t } = useLanguage();
  const [newName, setNewName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
```

**Step 2: Compute filtered items**

Add after the state declarations, before the sensors:

```javascript
const activeItems = items.filter(item => !item.archived);
const archivedItems = items.filter(item => item.archived);
const hasArchivedItems = archivedItems.length > 0;
const displayItems = editing
  ? (showArchived ? items : activeItems)
  : activeItems;
```

**Step 3: Update edit mode rendering**

Replace the edit mode items list. In the `SortableContext`, use `displayItems` instead of `items`. Also add archive/unarchive button next to the delete button for each item, and add the "Show Archived" toggle before the add input.

In the edit mode section, replace the `SortableContext` block and add the toggle:

```jsx
if (editing) {
    return (
      <div className="flex flex-col gap-3">
        {hasArchivedItems && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="self-start px-3 py-1 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {showArchived ? t('hideArchived') : t('showArchived')}
            {!showArchived && ` (${archivedItems.length})`}
          </button>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={displayItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {displayItems.map((item) => (
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
                    <button
                      onClick={() => onArchiveItem(item.id, !item.archived)}
                      className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
                      title={item.archived ? t('unarchive') : t('archive')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        {item.archived ? (
                          <path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4zm0 4h12v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7zm4 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        ) : (
                          <path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4zm0 4h12v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7zm4 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete item"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>

        {displayItems.length === 0 && (
          <p className="text-center text-gray-400 py-4">
            {t('noPracticeItems')}
          </p>
        )}

        {/* ... rest of edit mode (add input, done button) stays the same */}
```

**Step 4: Update normal mode to use `activeItems`**

In the normal (timer) mode section, replace `items.map` with `activeItems.map` and update `items.length` check:

```jsx
// Normal (timer) mode
return (
  <div className="flex flex-col gap-3">
    {activeItems.map((item, index) => {
      // ... existing item rendering code unchanged
    })}

    {activeItems.length === 0 && (
      <p className="text-center text-gray-400 py-4">
        {t('noPracticeItems')}
      </p>
    )}
    // ... edit button stays the same
```

**Step 5: Update `handleDragEnd` to use `displayItems`**

```javascript
const handleDragEnd = (event) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = displayItems.findIndex(i => i.id === active.id);
  const newIndex = displayItems.findIndex(i => i.id === over.id);
  if (oldIndex === -1 || newIndex === -1) return;
  const newItems = [...displayItems];
  const [moved] = newItems.splice(oldIndex, 1);
  newItems.splice(newIndex, 0, moved);
  onReorder(newItems.map(i => i.id));
};
```

**Step 6: Update keyboard navigation to use `activeItems`**

In `handleKeyDown`, replace `items` references with `activeItems` (items.length, items[focusedIndex], items.findIndex):

```javascript
const handleKeyDown = useCallback((e) => {
  if (editing) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (activeItems.length === 0) return;

  if (e.code === 'ArrowUp') {
    e.preventDefault();
    setFocusedIndex((prev) => prev === null ? activeItems.length - 1 : Math.max(0, prev - 1));
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    setFocusedIndex((prev) => prev === null ? 0 : Math.min(activeItems.length - 1, prev + 1));
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (focusedIndex === null) {
      if (activeItemId != null) onStop();
      return;
    }
    const focusedItem = activeItems[focusedIndex];
    if (!focusedItem) return;
    if (activeItemId === focusedItem.id) {
      onStop();
    } else {
      onStart(focusedItem.id);
    }
  }
}, [editing, activeItems, focusedIndex, activeItemId, onStart, onStop]);
```

Update the bounds-checking effect to use `activeItems`:

```javascript
useEffect(() => {
  if (focusedIndex !== null && focusedIndex >= activeItems.length) {
    setFocusedIndex(activeItems.length > 0 ? activeItems.length - 1 : null);
  }
}, [activeItems.length, focusedIndex]);
```

Update the active item focus restore effect:

```javascript
useEffect(() => {
  if (focusedIndex === null && activeItemId != null) {
    const idx = activeItems.findIndex((item) => item.id === activeItemId);
    if (idx !== -1) setFocusedIndex(idx);
  }
}, [activeItemId, activeItems, focusedIndex]);
```

**Step 7: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 8: Commit**

```
feat: add archive UI to PracticeItemList with filter toggle
```

---

### Task 5: Backend interface — Add `pushArchiveItem` to spec

**Files:**
- Modify: `src/services/backends/backendInterface.js:13-17`

**Step 1: Add `pushArchiveItem` to interface docs**

Add after `pushRenameItem` line:

```javascript
 *   pushArchiveItem(name, archived, userId) → void
```

**Step 2: Commit**

```
docs: add pushArchiveItem to backend interface spec
```

---

### Task 6: PocketBase backend — Sync archived field

**Files:**
- Modify: `src/services/sync.js`

**Step 1: Add `pushArchiveItem` function**

Add after `pushReorder` (after line 137):

```javascript
export async function pushArchiveItem(name, archived, userId) {
  try {
    const remoteItems = await pb.collection('practice_items').getList(1, 1, {
      filter: pb.filter('user = {:userId} && name = {:name}', { userId, name }),
      requestKey: null,
    });
    if (remoteItems.totalItems > 0) {
      await pb.collection('practice_items').update(remoteItems.items[0].id, {
        archived: !!archived,
      }, { requestKey: null });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('archive_item', { name, archived: !!archived });
    } else {
      throw err;
    }
  }
}
```

**Step 2: Update `pushItem` to include `archived` field**

In `pushItem` (line 19-23), add `archived` to the create payload:

```javascript
await pb.collection('practice_items').create({
  name: localItem.name,
  user: userId,
  sort_order: localItem.sortOrder ?? 0,
  archived: localItem.archived ?? false,
}, { requestKey: null });
```

**Step 3: Update `pullAll` to map `archived` field**

In the items loop of `pullAll` (around line 184-192):

```javascript
for (const remote of remoteItems) {
  const existing = await db.practiceItems
    .where('name').equals(remote.name).first();
  if (!existing) {
    await db.practiceItems.add({
      name: remote.name,
      sortOrder: remote.sort_order ?? 0,
      archived: remote.archived ?? false,
    });
  } else {
    const updates = {};
    if (remote.sort_order != null && existing.sortOrder !== remote.sort_order) {
      updates.sortOrder = remote.sort_order;
    }
    if (remote.archived != null && existing.archived !== remote.archived) {
      updates.archived = remote.archived;
    }
    if (Object.keys(updates).length > 0) {
      await db.practiceItems.update(existing.id, updates);
    }
  }
}
```

**Step 4: Update `subscribeToChanges` to handle `archived` in update events**

In the `e.action === 'update'` block (around line 249-254), add archived handling:

```javascript
} else if (e.action === 'update') {
  const localByName = await db.practiceItems
    .where('name').equals(e.record.name).first();
  if (localByName) {
    const updates = {};
    if (e.record.sort_order != null && localByName.sortOrder !== e.record.sort_order) {
      updates.sortOrder = e.record.sort_order;
    }
    if (e.record.archived != null && localByName.archived !== e.record.archived) {
      updates.archived = e.record.archived;
    }
    if (Object.keys(updates).length > 0) {
      await db.practiceItems.update(localByName.id, updates);
    }
  }
  // ... rest of rename handling stays the same
```

**Step 5: Update `flushSyncQueue` to handle `archive_item` action**

Add after the `reorder` case (around line 164-166):

```javascript
} else if (entry.action === 'archive_item') {
  await pushArchiveItem(entry.payload.name, entry.payload.archived, userId);
}
```

**Step 6: Update `subscribeToChanges` create event to include `archived`**

In the `e.action === 'create'` block (line 243-248), add `archived`:

```javascript
if (!existing) {
  await db.practiceItems.add({
    name: e.record.name,
    sortOrder: e.record.sort_order ?? 0,
    archived: e.record.archived ?? false,
  });
  onDataChanged();
}
```

**Step 7: Export `pushArchiveItem` from pocketbaseBackend.js**

In `src/services/backends/pocketbaseBackend.js`, add to imports and backend object:

```javascript
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem, pushReorder,
  pushArchiveItem,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';

// In the backend object:
const pocketbaseBackend = {
  // ... existing props ...
  pushArchiveItem,
  // ... rest
};
```

**Step 8: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 9: Commit**

```
feat: add archive sync support to PocketBase backend
```

---

### Task 7: Firebase backend — Sync archived field

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

**Step 1: Add `pushArchiveItem` function**

Add after `pushReorder` (after line 212):

```javascript
async pushArchiveItem(name, archived, userId) {
  try {
    const docId = encodeURIComponent(name);
    await updateDoc(doc(itemsRef(userId), docId), { archived: !!archived });
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('archive_item', { name, archived: !!archived });
    } else {
      throw err;
    }
  }
},
```

**Step 2: Update `pushItem` to include `archived` field**

In `pushItem` (line 104-107), add `archived` to data:

```javascript
const data = { name: localItem.name, created: serverTimestamp() };
if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
data.archived = localItem.archived ?? false;
```

**Step 3: Update `pullAll` to map `archived` field**

In the items loop (around line 217-225):

```javascript
if (!existing) {
  await db.practiceItems.add({
    name: data.name,
    sortOrder: data.sort_order ?? 0,
    archived: data.archived ?? false,
  });
} else {
  const updates = {};
  if (data.sort_order != null && existing.sortOrder !== data.sort_order) {
    updates.sortOrder = data.sort_order;
  }
  if (data.archived != null && existing.archived !== data.archived) {
    updates.archived = data.archived;
  }
  if (Object.keys(updates).length > 0) {
    await db.practiceItems.update(existing.id, updates);
  }
}
```

**Step 4: Update `subscribeToChanges` to handle `archived` in `modified` events**

In the `change.type === 'modified'` block (around line 312-327), add archived:

```javascript
} else if (change.type === 'modified') {
  const localItem = await db.practiceItems
    .where('name').equals(data.name).first();
  if (localItem) {
    const updates = {};
    if (data.sort_order != null && localItem.sortOrder !== data.sort_order) {
      updates.sortOrder = data.sort_order;
    }
    if (data.archived != null && localItem.archived !== data.archived) {
      updates.archived = data.archived;
    }
    if (Object.keys(updates).length > 0) {
      await db.practiceItems.update(localItem.id, updates);
    }
  }
  // ... rest of rename handling stays the same
```

**Step 5: Update `subscribeToChanges` create event to include `archived`**

In the `change.type === 'added'` block (around line 303-310):

```javascript
if (!existing) {
  const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
  const sortOrder = data.sort_order ?? (maxOrder ? maxOrder.sortOrder + 1 : 0);
  await db.practiceItems.add({
    name: data.name,
    sortOrder,
    archived: data.archived ?? false,
  });
  onDataChanged();
}
```

**Step 6: Update `flushSyncQueue` to handle `archive_item` action**

Add after the `reorder` case (around line 285):

```javascript
} else if (entry.action === 'archive_item') {
  await firebaseBackend.pushArchiveItem(entry.payload.name, entry.payload.archived, userId);
}
```

**Step 7: Verify build**

Run: `npm run build`
Expected: SUCCESS

**Step 8: Commit**

```
feat: add archive sync support to Firebase backend
```

---

### Task 8: Final verification

**Step 1: Run full build**

Run: `npm run build`
Expected: SUCCESS

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors
