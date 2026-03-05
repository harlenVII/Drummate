# Archive Practice Items — Design

## Problem

Users want to stop practicing certain items without deleting them and losing historical data. An "archive" feature lets users hide items from their active list while preserving all practice logs.

## Approach

Add an `archived` boolean field to `practiceItems`. Archived items are hidden from the active Practice tab list but remain in the database with all logs intact. Reports always include archived items.

## Database Changes

- Bump Dexie DB to **v6**
- Add `archived` to practiceItems index: `'++id, name, sortOrder, archived'`
- Migration: set `archived: false` on all existing items
- New function: `archiveItem(id, archived)` — updates the `archived` boolean
- `getItems()` continues to return all items (filtering happens in UI)

## UI Changes — Practice Tab

### Edit Mode
- Archive button (box/archive icon) next to delete button for each active item
- Unarchive button for archived items (when viewing archived)
- If item has a running timer, stop it before archiving

### Filter Toggle
- "Show Archived" toggle button at top of item list
- Only visible when archived items exist
- Default: show only active items
- When toggled: show archived items with dimmed/muted styling alongside active items

### Reports
- No changes — archived items always included in charts and statistics

## Sync Changes

### Backend Interface
- Add `pushArchiveItem(name, archived, userId)` to interface spec

### PocketBase (sync.js)
- New `pushArchiveItem(name, archived, userId)` — updates `archived` field on remote record
- `pushItem()` — include `archived` field
- `pullAll()` — map `archived` from remote records
- `subscribeToChanges()` — handle `archived` in `update` events
- `flushSyncQueue()` — handle `archive_item` action
- Server: add `archived` (boolean) field to `practice_items` collection

### Firebase (firebaseBackend.js)
- New `pushArchiveItem(name, archived, userId)` — `updateDoc` with `{ archived }`
- `pushItem()` — include `archived` field in data
- `pullAll()` — map `archived` from Firestore docs
- `subscribeToChanges()` — handle `archived` in `modified` events
- Firestore: `archived` field added automatically (schemaless)

### Offline Queue
- Both backends queue `archive_item` action with `{ name, archived }` payload when offline

## Constraints

- Name uniqueness enforced across all items (active + archived)
- Archived items keep their `sortOrder`, restored to position on unarchive
- Practice logs are never affected by archive/unarchive
