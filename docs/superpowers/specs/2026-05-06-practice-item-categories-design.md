# Practice Item Categories — Design Spec

**Date:** 2026-05-06
**Status:** Approved, ready for implementation planning

## Goal

Classify practice items into two user-facing categories — **Fundamentals** and **Songs** — and group them under labelled sections in the Practice tab. Add a collapsed **Archived** section below the active categories that re-uses the existing archive concept.

## Motivation

Today the Practice tab shows a single flat list of all active items. As users accumulate more items (rudiments, exercises, songs), the list becomes hard to scan. Grouping by purpose lets users find what they want to practice quickly and keeps song-style items separate from technique drills.

## Non-Goals

- Custom user-defined categories beyond Fundamentals/Songs.
- Per-category statistics in the Reports tab.
- Bulk category assignment UI.
- Replacing the existing `archived` boolean with a category value.

These are reasonable follow-ups but explicitly out of scope for v1.

## Data Model

### Schema (Dexie version 9)

Current head is version 8 (adds `uid` / `itemUid`). Version 9 adds an indexed `category` field on `practiceItems`.

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

- `category` is a string with two valid values: `'fundamentals'` or `'songs'`.
- Indexed for future filtered queries; not required for the v1 UI which filters in memory.
- Existing items default to `'fundamentals'` during the upgrade.
- Archived items keep their `category` so restore returns them to the right section.

### Relationship to existing `archived` field

The `archived` boolean is **unchanged**. It controls visibility (whether an item appears in active sections vs. the collapsed Archived section). `category` controls *which* active section the item belongs to. The two fields are orthogonal:

| `archived` | `category`     | Where it appears                                    |
| ---------- | -------------- | --------------------------------------------------- |
| `false`    | `fundamentals` | Fundamentals section in Practice tab                |
| `false`    | `songs`        | Songs section in Practice tab                       |
| `true`     | (any)          | Collapsed "Archived (N)" section in Practice tab    |

### Local API ([src/services/database.js](src/services/database.js))

- `addItem(name, category)` — `category` is required; throws if missing or invalid.
- New: `setItemCategory(id, category)` — updates the field.
- Existing `getItems()`, `archiveItem()`, `restoreItem()`, `trashItem()`, `updateItemOrder()` are unchanged.

## Migration

### 1. Local IndexedDB

The `db.version(9).upgrade()` block runs automatically on first app load after deploy. It runs in a single Dexie transaction before any new code reads the table, so no race with the UI.

### 2. Remote backend records

Existing PocketBase records and Firestore docs have no `category` field. Two complementary strategies:

**a. Tolerant pull (defensive read).** When pulling from either backend, treat absent `category` as `'fundamentals'`:

```js
category: remote.category ?? 'fundamentals'
```

This applies in both `pullAll` and the realtime subscription handlers.

**b. Lazy backfill on push.** Existing remote items receive a `category` value the first time their owner edits them (the next `pushItem` writes the full current field set including `category`). Plus, a one-time helper `backfillCategoryOnRemote(userId)` runs after migration: iterates local items and pushes `category` for any item whose remote record lacks it. This converges multi-device users without manual intervention.

### 3. Cross-device convergence

Old-build clients keep working because they ignore the unknown field on read and omit it on write. New-build clients must distinguish *missing* (no change) from a *real value* in pull diffs:

```js
if (remote.category !== undefined && local.category !== remote.category) {
  updates.category = remote.category;
}
```

This rule is added explicitly to both `pullAll` implementations.

### 4. PocketBase server schema (manual deployment step)

Before deploying the client update, the user must add a `category` text field to the `items` collection in the PocketBase admin UI:

- Type: text
- Default value: `fundamentals`
- Optional / not required (so old clients still write successfully)

Firestore needs no schema action.

## Sync Layer

### Backend interface ([src/services/backends/backendInterface.js](src/services/backends/backendInterface.js))

- `pushItem` payload contract: `{ uid, name, sortOrder?, archived?, trashed?, trashedAt?, category? }`
- New method: `pushSetCategory(uid, category, userId) → void`
- `pushReorder` payload now includes `category` per item: `[{ uid, sortOrder, category }]`. This avoids a race where a cross-section drag pushes a reorder before the category change lands, and another device briefly sees the item in the wrong section.

### PocketBase ([src/services/sync.js](src/services/sync.js))

- `pushItem` writes `category` to the record.
- `pullAll` and `subscribeToChanges` map `remote.category → local.category` using the tolerant-read rule above.
- New action `set_category` added to the offline queue handler.

### Firebase ([src/services/backends/firebaseBackend.js](src/services/backends/firebaseBackend.js))

- `pushItem` writes `category` to the Firestore doc.
- `pullAll` and the snapshot listener read it with the tolerant-read rule.
- New `set_category` queued action.

## UI — Practice Tab (Normal Mode)

### Layout

```
┌──────────────────────────────────────────┐
│ Fundamentals                             │
├──────────────────────────────────────────┤
│  Rudiments              0:23:45  [Start] │
│  Stick Control          0:11:02  [Start] │
│  Independence           0:00:00  [Start] │
├──────────────────────────────────────────┤
│ Songs                                    │
├──────────────────────────────────────────┤
│  Tom Sawyer             0:42:18  [Start] │
│  Black Dog              0:08:00  [Start] │
├──────────────────────────────────────────┤
│ ▸ Archived (3)                           │
└──────────────────────────────────────────┘
                                  [ Edit ]
```

### Behavior

- Section headers are always visible, even when the section is empty (shows `t('noFundamentalsYet')` / `t('noSongsYet')` placeholder).
- Filtering: `activeItems.filter(i => i.category === 'fundamentals')` and `... === 'songs'`. Both lists keep `sortOrder` ascending.
- The Archived section is collapsed by default. Header shows the count `Archived (N)`. Expanding shows archived items as read-only rows (name + total time, no Start button). To unarchive, the user enters Edit mode.
- If both Fundamentals and Songs are empty (fresh user), display a single CTA: "Add your first practice item" pointing to Edit mode.

### Keyboard navigation

ArrowUp / ArrowDown / Space traverse the union of Fundamentals + Songs in display order, skipping Archived. Behavior is otherwise identical to the current implementation.

### Component structure

`PracticeItemList.jsx` gains a small internal helper `<CategorySection title={...} items={...} ... />` to render a header and rows. Keeps the JSX flat. No new file is needed.

## UI — Edit Mode

### Layout

```
[ Show Archived (2) ]                      ← only if archived items exist

┌─────────────────────────────────────────────┐
│ Fundamentals                                │
├─────────────────────────────────────────────┤
│ ⋮⋮  Rudiments              [F][S] 📦 🗑  │
│ ⋮⋮  Stick Control          [F][S] 📦 🗑  │
├─────────────────────────────────────────────┤
│ Songs                                       │
├─────────────────────────────────────────────┤
│ ⋮⋮  Tom Sawyer             [F][S] 📦 🗑  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ [F][S]  [ New practice item... ]   [+ Add]  │
└─────────────────────────────────────────────┘

                                       [ Done ]

[ Show Trash (1) ]
```

### Per-row category picker

A 2-button segmented control: **F** (Fundamentals) / **S** (Songs). The selected option is highlighted. Tapping the unselected option calls `setItemCategory(id, newCategory)` and the item visibly moves to the other section. Two-letter abbreviations keep mobile rows compact; tooltips and aria-labels carry the full names.

### Add row

The same F/S segmented control appears to the left of the name input. The selection initialises to `'fundamentals'` each time edit mode is entered, then persists across consecutive Add actions within the same edit-mode session (so adding several songs in a row doesn't require re-tapping **S**). On Add, calls `addItem(name, selectedCategory)`.

### Drag-and-drop across sections

Implementation uses `@dnd-kit` with **two `SortableContext` instances** (one per category) inside a single `DndContext`:

```
onDragEnd(event):
  active = event.active.id
  over = event.over.id  // either an item id, or a category zone id

  if over is in same category:
    reorder within category, then backend.pushReorder(items, userId)
  else:
    1. setItemCategory(active, newCategory)            // local DB write
    2. insert at drop position in target section
    3. recompute global sortOrder for the affected items
    4. updateItemOrder(orderedIds)                     // local DB write
    5. backend.pushReorder(items, userId)              // single push: includes category per item, atomic on the remote
```

The single `pushReorder` is sufficient for the cross-section drag because the payload now carries `category`. `pushSetCategory` is reserved for non-drag category changes (tapping the F/S picker on a single row).

To make empty sections accept drops, each section header has a droppable zone underneath using `useDroppable({ id: 'category-fundamentals' })` / `'category-songs'`. Dropping on the zone moves the item to the end of that section.

### Archive/Trash buttons

The archive and trash icons retain their existing behavior. Archiving toggles `archived` — the item disappears from its category and appears under "Show Archived (N)".

## App.jsx Wiring

- `handleAddItem(name)` → `handleAddItem(name, category)` — passes category through to `addItem` and `backend.pushItem`. The existing case-insensitive duplicate-name check is unchanged.
- New handler `handleSetItemCategory(id, category)` mirrors `handleArchiveItem`: updates DB, refreshes `items` state, calls `backend.pushSetCategory(uid, category, userId)` with offline-queue fallback.
- Pass `onSetItemCategory` to `<PracticeItemList>`.
- `pushReorder` callsites send `category` per item.

### No changes needed

- Timer logic, `totals` computation, voice intent parser, all Reports components — all key off `itemId` and are category-agnostic.
- Trash/restore — already correct because they only touch `trashed`/`trashedAt`/`archived`. `category` is preserved.

## Translations

New keys (added to both `en` and `zh` in [src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx)):

| Key | English | Chinese |
| --- | --- | --- |
| `categories.fundamentals` | Fundamentals | 基本功 |
| `categories.songs` | Songs | 歌曲 |
| `categories.archived` | Archived | 已归档 |
| `categories.fundamentalsShort` | F | 基 |
| `categories.songsShort` | S | 歌 |
| `noFundamentalsYet` | No fundamentals yet | 还没有基本功项目 |
| `noSongsYet` | No songs yet | 还没有歌曲 |
| `addFirstItem` | Add your first practice item | 添加你的第一个练习项目 |
| `selectCategory` | Select category | 选择分类 |

The existing `archived` and `showArchived` / `hideArchived` keys are reused.

## Edge Cases

- **Empty section after move:** When a user drags the only item out of a section, the empty section keeps its header with the placeholder text (consistent with normal mode).
- **Active timer during category change:** Reordering or category change does not touch `practiceLogs` or `activeItemId`. The timer keeps running and the total accrues correctly.
- **Old client writes to a migrated record:** Tolerant pull treats missing `category` as "no change" rather than "set to default", preventing accidental category clobbering.
- **Concurrent cross-section drags on two devices:** Last-writer-wins per field, same as existing `archived` / `sortOrder` behavior. Acceptable for v1.

## Testing Checklist (manual)

- [ ] `npm run build` succeeds.
- [ ] Fresh DB: add a Fundamentals item → appears under Fundamentals header. Add a Songs item → appears under Songs header.
- [ ] Existing user upgrade path: pre-seed a v8 DB with items, load app, confirm all items default to Fundamentals.
- [ ] Edit mode: tap **S** on a Fundamentals item → item moves to Songs without page reload.
- [ ] Drag a Fundamentals item into the Songs section → category changes; sort order persists after reload.
- [ ] Drag onto an empty section header → drops at end of that category.
- [ ] Archive an item → disappears from its category, appears under "Archived (N)" collapsed section. Restore → returns to original category.
- [ ] Sign in on a second device with the *old* build → items still load (tolerant pull preserves them).
- [ ] After upgrading the second device → categories sync via lazy backfill.
- [ ] Offline category change → queued. Reconnect → flushes successfully.
- [ ] Active timer + category change → timer keeps running, total accrues correctly.
- [ ] Language toggle: section headers and placeholders translate to zh.

## Deployment Notes

1. **PocketBase admin (one-time):** Add `category` text field to the `items` collection, default value `fundamentals`, not required.
2. **Firestore:** No schema work required.
3. **Client deploy:** Roll out the new build. Lazy backfill converges existing records over time; tolerant pull keeps old clients functional during the rollover.
