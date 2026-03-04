# Practice Item Reorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `sortOrder` field to practice items with drag-and-drop reordering in edit mode, synced across devices via both Firebase and PocketBase backends.

**Architecture:** Add `sortOrder` integer to Dexie schema (v5), include `sort_order` in both backend push/pull/subscribe flows, and use `@dnd-kit` for touch-friendly drag-and-drop in the existing edit mode UI.

**Tech Stack:** Dexie.js v5 migration, `@dnd-kit/core` + `@dnd-kit/sortable`, Firebase Firestore, PocketBase

---

### Task 1: Install @dnd-kit

**Step 1: Install dependencies**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**Step 2: Verify install**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @dnd-kit dependencies for drag-and-drop reorder"
```

---

### Task 2: Dexie schema migration (v5) — add sortOrder

**Files:**
- Modify: `src/services/database.js`

**Step 1: Add version 5 schema and migration**

After the existing `db.version(4)` block (line 33), add:

```javascript
db.version(5).stores({
  practiceItems: '++id, name, sortOrder',
  practiceLogs: '++id, itemId, date, duration, uid',
  syncQueue: '++id, action, collection, localId',
}).upgrade(async tx => {
  let order = 0;
  await tx.table('practiceItems').toCollection().modify(item => {
    item.sortOrder = order++;
  });
});
```

**Step 2: Update `getItems()` to sort by sortOrder**

Change `getItems` (line 37-39) from:

```javascript
export const getItems = async () => {
  return await db.practiceItems.toArray();
};
```

To:

```javascript
export const getItems = async () => {
  return await db.practiceItems.orderBy('sortOrder').toArray();
};
```

**Step 3: Update `addItem()` to assign sortOrder**

Change `addItem` (line 41-43) from:

```javascript
export const addItem = async (name) => {
  return await db.practiceItems.add({ name });
};
```

To:

```javascript
export const addItem = async (name) => {
  const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
  const sortOrder = maxOrder ? maxOrder.sortOrder + 1 : 0;
  return await db.practiceItems.add({ name, sortOrder });
};
```

**Step 4: Add `updateItemOrder()` helper**

After `deleteItem` (line 52), add:

```javascript
export const updateItemOrder = async (orderedIds) => {
  await db.transaction('rw', db.practiceItems, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.practiceItems.update(orderedIds[i], { sortOrder: i });
    }
  });
};
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/services/database.js
git commit -m "feat: add sortOrder field to practiceItems schema (Dexie v5)"
```

---

### Task 3: Backend interface — add pushReorder

**Files:**
- Modify: `src/services/backends/backendInterface.js:13`

**Step 1: Add pushReorder to the interface doc comment**

After `pushRenameItem(oldName, newName, userId) → void` (line 16), add:

```javascript
 *   pushReorder(items, userId) → void       // items: [{ name, sortOrder }]
```

**Step 2: Commit**

```bash
git add src/services/backends/backendInterface.js
git commit -m "docs: add pushReorder to backend interface contract"
```

---

### Task 4: Firebase backend — add sort_order sync

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

**Step 1: Update pushItem to include sort_order**

Change the `setDoc` call in `pushItem` (lines 105-108) from:

```javascript
      await setDoc(doc(itemsRef(userId), docId), {
        name: localItem.name,
        created: serverTimestamp(),
      }, { merge: true });
```

To:

```javascript
      const data = { name: localItem.name, created: serverTimestamp() };
      if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
      await setDoc(doc(itemsRef(userId), docId), data, { merge: true });
```

**Step 2: Add pushReorder method**

After `pushRenameItem` (line 198), add:

```javascript
  async pushReorder(items, userId) {
    try {
      for (const item of items) {
        const docId = encodeURIComponent(item.name);
        await updateDoc(doc(itemsRef(userId), docId), { sort_order: item.sortOrder });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder', { items: items.map(i => ({ name: i.name, sortOrder: i.sortOrder })) });
      } else {
        throw err;
      }
    }
  },
```

**Step 3: Update pullAll to read sort_order**

Change the item-adding block in `pullAll` (lines 203-209) from:

```javascript
      const existing = await db.practiceItems
        .where('name').equals(data.name).first();
      if (!existing) {
        await db.practiceItems.add({ name: data.name });
      }
```

To:

```javascript
      const existing = await db.practiceItems
        .where('name').equals(data.name).first();
      if (!existing) {
        await db.practiceItems.add({ name: data.name, sortOrder: data.sort_order ?? 0 });
      } else if (data.sort_order != null && existing.sortOrder !== data.sort_order) {
        await db.practiceItems.update(existing.id, { sortOrder: data.sort_order });
      }
```

**Step 4: Update subscribeToChanges — handle sort_order on modified events**

In the `modified` handler (lines 289-299), after the rename logic and before `onDataChanged()`, add sort_order sync:

```javascript
        } else if (change.type === 'modified') {
          const data = change.doc.data();
          // Handle sort_order updates
          const localItem = await db.practiceItems
            .where('name').equals(data.name).first();
          if (localItem && data.sort_order != null && localItem.sortOrder !== data.sort_order) {
            await db.practiceItems.update(localItem.id, { sortOrder: data.sort_order });
          }
          // Handle renames: find local item with old name
          // (existing rename logic stays here)
```

**Step 5: Update flushSyncQueue — handle reorder action**

In `flushSyncQueue` (after the `rename_item` handler, before the catch), add:

```javascript
        } else if (entry.action === 'reorder') {
          for (const item of entry.payload.items) {
            const docId = encodeURIComponent(item.name);
            await updateDoc(doc(itemsRef(userId), docId), { sort_order: item.sortOrder });
          }
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat: add sort_order sync to Firebase backend"
```

---

### Task 5: PocketBase backend — add sort_order sync

**Files:**
- Modify: `src/services/sync.js`
- Modify: `src/services/backends/pocketbaseBackend.js`

**Step 1: Update pushItem in sync.js to include sort_order**

Change the `create` call in `pushItem` (lines 19-22) from:

```javascript
    await pb.collection('practice_items').create({
      name: localItem.name,
      user: userId,
    }, { requestKey: null });
```

To:

```javascript
    await pb.collection('practice_items').create({
      name: localItem.name,
      user: userId,
      sort_order: localItem.sortOrder ?? 0,
    }, { requestKey: null });
```

**Step 2: Add pushReorder function in sync.js**

After `pushRenameItem` (line 114), add:

```javascript
export async function pushReorder(items, userId) {
  try {
    for (const item of items) {
      const remoteItems = await pb.collection('practice_items').getList(1, 1, {
        filter: pb.filter('user = {:userId} && name = {:name}', { userId, name: item.name }),
        requestKey: null,
      });
      if (remoteItems.totalItems > 0) {
        await pb.collection('practice_items').update(remoteItems.items[0].id, {
          sort_order: item.sortOrder,
        }, { requestKey: null });
      }
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('reorder', { items: items.map(i => ({ name: i.name, sortOrder: i.sortOrder })) });
    } else {
      throw err;
    }
  }
}
```

**Step 3: Update flushSyncQueue in sync.js**

After the `rename_item` handler (line 141), add:

```javascript
      } else if (entry.action === 'reorder') {
        await pushReorder(entry.payload.items, userId);
```

**Step 4: Update pullAll in sync.js to read sort_order**

Change the item-adding block in `pullAll` (lines 159-165) from:

```javascript
    const existing = await db.practiceItems
      .where('name').equals(remote.name).first();
    if (!existing) {
      await db.practiceItems.add({ name: remote.name });
    }
```

To:

```javascript
    const existing = await db.practiceItems
      .where('name').equals(remote.name).first();
    if (!existing) {
      await db.practiceItems.add({ name: remote.name, sortOrder: remote.sort_order ?? 0 });
    } else if (remote.sort_order != null && existing.sortOrder !== remote.sort_order) {
      await db.practiceItems.update(existing.id, { sortOrder: remote.sort_order });
    }
```

Also change the sort in `pullAll` (line 155) from `sort: 'created'` to `sort: 'sort_order'`.

**Step 5: Update subscribeToChanges in sync.js**

In the `update` handler (line 222-242), add sort_order sync. After the rename logic and before `onDataChanged()`:

```javascript
      // Handle sort_order updates
      const localByName = await db.practiceItems
        .where('name').equals(e.record.name).first();
      if (localByName && e.record.sort_order != null && localByName.sortOrder !== e.record.sort_order) {
        await db.practiceItems.update(localByName.id, { sortOrder: e.record.sort_order });
      }
```

**Step 6: Wire pushReorder into pocketbaseBackend.js**

In `pocketbaseBackend.js`, add the import and export:

Change line 4 from:

```javascript
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';
```

To:

```javascript
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem, pushReorder,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';
```

And add `pushReorder,` after `pushRenameItem,` (line 56) in the `pocketbaseBackend` object.

**Step 7: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add src/services/sync.js src/services/backends/pocketbaseBackend.js
git commit -m "feat: add sort_order sync to PocketBase backend"
```

---

### Task 6: App.jsx — add handleReorder and wire it up

**Files:**
- Modify: `src/App.jsx`

**Step 1: Import updateItemOrder**

Add `updateItemOrder` to the database import (find the existing import from `../services/database`):

```javascript
import { db, getItems, addItem, renameItem, deleteItem, updateItemOrder, ... } from './services/database';
```

**Step 2: Add handleReorder callback**

After `handleDeleteItem` (line 492), add:

```javascript
  const handleReorder = useCallback(
    async (orderedIds) => {
      await updateItemOrder(orderedIds);
      await loadData();
      if (user) {
        const reorderedItems = await Promise.all(
          orderedIds.map(id => db.practiceItems.get(id))
        );
        backend.pushReorder(reorderedItems, user.id).catch(console.error);
      }
    },
    [loadData, user, backend],
  );
```

**Step 3: Pass handleReorder to PracticeItemList**

Find the `<PracticeItemList` JSX and add the `onReorder` prop:

```jsx
<PracticeItemList
  ...existing props...
  onReorder={handleReorder}
/>
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add handleReorder callback and wire to PracticeItemList"
```

---

### Task 7: PracticeItemList — drag-and-drop UI in edit mode

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

**Step 1: Add imports**

At the top of the file, add:

```javascript
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
```

Also install the modifiers package: `npm install @dnd-kit/modifiers`

**Step 2: Create SortableItem component**

Before the `PracticeItemList` function, add:

```javascript
function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="p-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    </button>
  );
}

function SortableItem({ item, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
        <DragHandle listeners={listeners} attributes={attributes} />
        {children}
      </div>
    </div>
  );
}
```

**Step 3: Add onReorder prop to PracticeItemList**

Add `onReorder` to the destructured props:

```javascript
function PracticeItemList({
  items, totals, activeItemId, elapsedTime, editing,
  onSetEditing, onStart, onStop, onAddItem, onRenameItem, onDeleteItem, onReorder,
}) {
```

**Step 4: Add sensors and drag handler**

Inside the component, after the existing state declarations, add:

```javascript
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newItems = [...items];
    const [moved] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, moved);
    onReorder(newItems.map(i => i.id));
  };
```

**Step 5: Wrap edit mode list with DndContext**

Replace the edit mode return block (lines 108-186) with:

```jsx
  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableItem key={item.id} item={item}>
                <div className="flex-1 flex items-center justify-between ml-2">
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
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>

        {items.length === 0 && (
          <p className="text-center text-gray-400 py-4">
            {t('noPracticeItems')}
          </p>
        )}

        <div className="flex gap-2">
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

        <button
          onClick={() => onSetEditing(false)}
          className="mt-1 px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          {t('done')}
        </button>
      </div>
    );
  }
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "feat: add drag-and-drop reorder UI in edit mode"
```

---

### Task 8: Final verification

**Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Lint check**

Run: `npm run lint`
Expected: No new lint errors

**Step 3: Commit any fixes if needed**
