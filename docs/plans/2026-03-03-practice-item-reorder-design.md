# Practice Item Reorder — Design Doc

## Problem

Practice items have no persistent order. When synced to a new device, items appear in arbitrary order based on insertion time. Users want consistent ordering across devices and the ability to manually reorder items.

## Solution

Add a `sortOrder` integer field to practice items. Support drag-and-drop reordering in edit mode. Sync the order via both Firebase Firestore and PocketBase backends.

## Data Model Changes

### Local (Dexie.js)

- Bump database to **version 5**
- Add `sortOrder` (integer) to `practiceItems`
- Schema: `'++id, name, sortOrder'`
- Migration: assign `sortOrder` to existing items based on current `id` order (0, 1, 2...)

### Remote — Firebase Firestore

- Add `sort_order` number field to `users/{userId}/practice_items/{docId}` documents
- Existing remote items get `sort_order` backfilled on next push
- Doc IDs remain deterministic: `encodeURIComponent(name)`

### Remote — PocketBase

- Add `sort_order` number field to `practice_items` collection (default: 0)
- Existing remote items get `sort_order` backfilled on next push

### Display

- Items always sorted by `sortOrder` ascending: `db.practiceItems.orderBy('sortOrder').toArray()`

## Reorder Logic

### Drag-and-drop (edit mode only)

- Drag handles (grip icon) on left side of each item row, visible only in edit mode
- On drop: reassign `sortOrder` values 0, 1, 2... to all items in new order
- Batch-update all affected items in Dexie
- If logged in, push updated `sortOrder` via the active backend

### New item creation

- `sortOrder = max(existing sortOrders) + 1` (appends to bottom)

### Item deletion

- No re-indexing needed — gaps in `sortOrder` are fine

## Sync Changes

Changes apply to **both** `firebaseBackend.js` and `pocketbaseBackend.js` via the shared backend interface.

### Backend interface (backendInterface.js)

- Add `pushReorder(items, userId)` to the backend contract

### pushItem

- **Firebase:** Include `sort_order` in the `setDoc(..., { merge: true })` call
- **PocketBase:** Include `sort_order` when creating items via `pb.collection('practice_items').create()`

### pushReorder (new function)

- After drag-and-drop, push updated `sort_order` for each reordered item
- **Firebase:** Batch `updateDoc` calls; doc ref via `encodeURIComponent(name)`
- **PocketBase:** Lookup remote item by `name`, then update `sort_order`
- If offline, queue to `syncQueue` with a new `reorder` action

### pullAll

- Read `sort_order` from remote documents/records
- Set local `sortOrder` from remote `sort_order` value when adding items to Dexie
- **Firebase:** Read from Firestore doc fields
- **PocketBase:** Change sort from `'created'` to `'sort_order'`

### subscribeToChanges

- On update/modified events: also sync `sort_order` to local `sortOrder`
- **Firebase:** Handle in `modified` snapshot event
- **PocketBase:** Handle in `update` SSE event

### flushSyncQueue

- Handle new `reorder` action type in both backends

### Conflict resolution

- Last-write-wins per item. Devices converge on next pull.

## UI Details

### Drag handle

- 6-dot grip icon on left side of each item row
- Only visible in edit mode
- Minimum 44px touch target

### Library

- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- ~10KB gzipped, tree-shakeable
- Touch/pointer/keyboard sensor support
- Compatible with React 19

### No other UI changes

- Timer mode stays exactly as-is
