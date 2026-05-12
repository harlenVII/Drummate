# Notes Feature — Design

**Status:** Draft
**Date:** 2026-05-12
**Author:** harlen (with Claude)

## Summary

Add a Notes feature: dated, free-text journal entries each attached to a single practice item. A new top-level "Notes" tab follows the Report tab and exposes two subpages — **By Date** (chronological feed) and **By Item** (grouped by practice item). Notes sync to Firebase with full parity to practice items/logs (push/pull/subscribe, offline queue, soft-delete with 30-day purge) and survive practice-item merges.

## Goals

- Let the user capture arbitrary text observations tied to a practice item and a date.
- Browse notes chronologically (journal mode) or sliced by item.
- Match the existing app's offline-first, cross-device sync, and soft-delete behavior so notes feel like a native part of Drummate.

## Non-goals (YAGNI)

- Titles, tags, pin/favorite flags, or rich text.
- Search, filters, or date-range queries beyond the two subpages.
- Voice command to add notes (parser additions can come later).
- Inclusion in `ReportGeneratorModal` exports.
- AI summarization of notes.
- Attaching a note to a specific `practiceLog` row (notes attach to the item, not a session).

## Data Model

### New Dexie table

```
notes: '++id, &uid, itemUid, date, body, trashed'
```

Stored-but-not-indexed fields: `trashedAt` (ISO string), `syncedOnce` (boolean).

| Field | Type | Notes |
|---|---|---|
| `id` | int | Local Dexie pk (this device only). |
| `uid` | string | UUID for this note; cross-device dedup key. Unique index. |
| `itemUid` | string | Parent practice item's `uid`. Indexed for `getNotesByItem`. |
| `date` | string | `YYYY-MM-DD`, defaults to today on creation. Indexed for chronological queries. |
| `body` | string | Arbitrary text. The only user-editable field after creation. |
| `trashed` | boolean | Soft-delete flag. Indexed. |
| `trashedAt` | string | ISO timestamp when trashed; used by `purgeExpiredTrash`. |
| `syncedOnce` | boolean | `true` once the note has reached the cloud or arrived from it. Drives the offline-delete reconciliation in `pullAllNotes`. |

### Dexie migration

Bump database version from **9 → 10**. Add the `notes` table; no `.upgrade()` callback needed (new table only, no existing-record back-fill).

### Why not embed in `practiceLogs`?

Logs are session-shaped (one row per timed practice on a date). A user may want to note something not tied to a session ("decided to drop this song"), and may want multiple notes per item per day. Standalone notes keep the log table clean and let the data model match the UX.

## Database Operations (`src/database.js`)

New async functions:

- `addNote(itemUid, body, date?)` — `date` defaults to `getTodayString()`. Generates `uid`, sets `trashed: false`, `syncedOnce: false`.
- `getAllNotes()` — returns active (non-trashed) notes sorted by `date` desc, then `id` desc.
- `getNotesByItem(itemUid)` — active notes for one item, sorted by `date` desc.
- `updateNote(id, body)` — edits body only. `date` and `itemUid` are immutable post-creation.
- `trashNote(id)` — sets `trashed: true`, `trashedAt: new Date().toISOString()`.
- `restoreNote(id)` — sets `trashed: false`, clears `trashedAt`.

Modifications to existing functions:

- `purgeExpiredTrash(daysOld = 30)` — extend to also hard-delete notes with `trashed: true` and `trashedAt` older than the cutoff.
- `mergeItem(sourceId, targetId)` — extend the transaction to reassign every note where `itemUid === source.uid` to `target.uid` (analogous to the existing log reassignment). Source-item notes follow the source's logs into the target.
- `deleteItem(id)` — extend cascade to hard-delete the item's notes (matches the log cascade).

## Sync (`src/services/firebaseBackend.js`)

Full parity with logs. Firestore path: `users/{userId}/notes/{noteUid}`.

Wire schema (camelCase locally → snake_case in Firestore, matching existing convention):

```
{
  uid: string,         // == document id
  item_uid: string,
  date: string,        // YYYY-MM-DD
  body: string,
  trashed: boolean,
  trashed_at: string | null,
  updated_at: serverTimestamp,
}
```

New / extended backend methods:

- `pushNote(note, userId)` — upsert. Used for both creates and edits, and for soft-delete/restore (the `trashed` / `trashed_at` fields ride along on the upsert so state propagates cross-device).
- `deleteNoteRemote(noteUid, userId)` — hard-delete the remote doc. Called only by `purgeExpiredTrash` after the 30-day window, and by the item-delete cascade. A user-initiated trash is **not** a hard-delete — it goes through `pushNote` with `trashed: true` so another device can still see / restore it within the window.
- `pullAllNotes(userId)` — fetch all docs, upsert into local table, reconcile deletions: any local note with `syncedOnce: true` whose `uid` is missing from the remote set is locally hard-deleted. Mirrors `pullAll` for items.
- `pushAllLocalNotes(userId)` — push every local note with `syncedOnce: false`.
- `subscribeToChanges(userId, callbacks)` — extend the existing subscription to also watch `notes`. On `modified`: if remote `item_uid` differs from local `itemUid`, remap the local row (parallels gotcha #15 for logs — protects against cross-device merges).

Sync queue: add `notes` as a recognized `collection` in `syncQueue` retries.

### Init order

Extend the existing init sequence:

```
pullAll(items) → pullAll(logs) → pullAll(notes)
  → flushSyncQueue
  → pushAllLocal(items, logs, notes)
```

Notes pull last among the pulls so item/log truth is in place before notes (notes reference `itemUid`, but with the tolerant-pull rule we don't fail if the parent item is briefly missing — we just keep the row).

## UI

### Tab bar (`src/components/TabBar.jsx`)

Add a fourth tab "Notes" after "Report". Order: Practice / Metronome / Report / Notes.

### Keyboard shortcuts (`src/App.jsx`)

- `4` → switch to Notes tab. Existing `1` / `2` / `3` mappings unchanged.
- `Tab` / `Shift+Tab` while on Notes tab cycles `byDate` ↔ `byItem` (extends existing subpage cycling logic).
- `←` / `→` are **not** bound on the Notes tab — the By Date view is a feed, not a date-stepped report.

### State in `App.jsx`

- `notesSubpage` — `'byDate' | 'byItem'`, defaults to `'byDate'`. Persisted in component state only (not localStorage); resets to default on reload.

No global `notes` list cache in `App.jsx` — each subpage component loads its own data via `useEffect` and re-fetches after mutations (matches how `StatsReport` and `ReportGeneratorModal` work today). A shared `notesRefreshKey` counter is passed in so the parent's "+ Add note" can trigger re-fetch in the active subpage.

### New components

All under `src/components/`:

- **`NotesPage.jsx`** — top-level container for the Notes tab. Renders subpage toggle (chips: "By Date" / "By Item"), a floating "+ Add note" button, and the active subpage. Owns the `NoteEditModal` open state and the `notesRefreshKey` counter.

- **`NotesByDate.jsx`** — chronological feed. Loads via `getAllNotes()`. Groups by `date` with sticky headers labeled "Today" / "Yesterday" / `formatDateLabel(date, t)`. Each row: body text (preserves line breaks), an item-name chip (resolved from `items` prop, falls back to "(deleted)" if the parent item is trashed or missing), and an overflow menu with Edit / Delete.

- **`NotesByItem.jsx`** — accordion list. Loads active items (already passed in as a prop from `App.jsx`) grouped by category (`fundamentals` / `songs`), then for each item, lazy-loads its notes via `getNotesByItem(item.uid)` when expanded. Each item row shows the item name and a count badge of its notes. Notes inside an expanded item are ordered newest first.

- **`NoteEditModal.jsx`** — create / edit modal. Mirrors `EditTimeModal` styling.
  - **Create mode** (no `note` prop): item dropdown (active, non-trashed items grouped by category, with the user's currently-active practice item pre-selected if any), date input defaulting to today, body textarea (autofocus). Confirm calls `addNote(itemUid, body, date)` then `backend.pushNote`.
  - **Edit mode** (with `note` prop): textarea only (date/item locked). Confirm calls `updateNote(id, body)` then `backend.pushNote`.
  - Delete button in edit mode → `trashNote` + `backend.pushNote` (soft-delete mirror).

### Behavior details

- Empty states: By Date with zero notes shows "No notes yet. Tap + to add one." By Item shows the item list with "(no notes)" beneath items that have none.
- Note bodies preserve user line breaks (`white-space: pre-wrap` via Tailwind `whitespace-pre-wrap`).
- A note whose parent item is `trashed` is still shown in By Date (item chip reads "(deleted)") but hidden from By Item (since the parent item itself is hidden).
- When the user merges item A into item B, all of A's notes immediately appear under B in By Item; By Date item chips re-resolve on next re-render.

## i18n (`src/contexts/LanguageContext.jsx`)

New keys under a `notes` namespace, in `en` and `zh`:

- `notes.tabLabel` — "Notes" / "笔记"
- `notes.subpage.byDate` — "By Date" / "按日期"
- `notes.subpage.byItem` — "By Item" / "按项目"
- `notes.addButton` — "+ Add note" / "+ 添加笔记"
- `notes.empty.byDate` — "No notes yet. Tap + to add one." / "暂无笔记。点击 + 添加。"
- `notes.empty.byItem` — "No notes" / "暂无笔记"
- `notes.modal.createTitle` — "New note" / "新建笔记"
- `notes.modal.editTitle` — "Edit note" / "编辑笔记"
- `notes.modal.itemLabel` — "Practice item" / "练习项目"
- `notes.modal.dateLabel` — "Date" / "日期"
- `notes.modal.bodyLabel` — "Note" / "笔记内容"
- `notes.modal.bodyPlaceholder` — "Write something..." / "写点什么……"
- `notes.modal.save` — "Save" / "保存"
- `notes.modal.cancel` — "Cancel" / "取消"
- `notes.modal.delete` — "Delete" / "删除"
- `notes.itemDeleted` — "(deleted)" / "(已删除)"
- `notes.todayLabel` — "Today" / "今天"
- `notes.yesterdayLabel` — "Yesterday" / "昨天"

## Edge cases & decisions

1. **Note attached to a trashed item.** Trashing an item is soft-delete: notes are preserved (no cascade), and the note still shows in By Date with a "(deleted)" chip. If the user restores the item, the note reappears under it in By Item naturally. **When the trashed item is hard-deleted** — either by the user via `deleteItem` or by `purgeExpiredTrash` after 30 days — the item-delete cascade hard-deletes its notes too (matches the established log-cascade behavior). So orphaned notes do not persist long-term.

2. **Cross-device merge.** Same protection as logs. `pullAllNotes` and `subscribeToChanges`-`modified` both check whether a remote note's `item_uid` differs from local `itemUid` and remap. Without this rule, a merge performed on Device A would silently orphan notes on Device B.

3. **Offline create → online sync.** Standard pattern: insert with `syncedOnce: false`, attempt `pushNote`, on failure enqueue to `syncQueue` with `{ action: 'push', collection: 'notes', localId }`. `flushSyncQueue` already iterates the queue and dispatches by collection; extend the dispatch table to include `notes`.

4. **Concurrent edit on two devices.** Last-writer-wins via the existing `updated_at` server timestamp (same as logs/items). Acceptable for a personal app; not worth CRDT.

5. **Item rename / category change.** Notes hold `itemUid`, not the name. Both views resolve the display name from the current items list at render time, so renames are reflected automatically with no note-side migration.

## Architecture diagram

```
App.jsx
  state: notesSubpage, notesRefreshKey
  └── TabBar (adds "Notes")
  └── NotesPage
        ├── subpage chips
        ├── + Add note  ─────→  NoteEditModal (create)
        └── NotesByDate │ NotesByItem
              │              │
              ▼              ▼
         getAllNotes()   getNotesByItem(uid)
              │              │
              ▼              ▼
         database.js (Dexie 'notes' table)
              │
              ▼
         firebaseBackend.js  ──▶ Firestore users/{uid}/notes
              ▲
              │ subscribeToChanges (added / modified / removed)
              │ pullAllNotes / pushAllLocalNotes
```

## Test plan

- [ ] `npm run build` succeeds
- [ ] Create a note → appears in By Date today header and By Item under correct item
- [ ] Edit a note's body → both views reflect change
- [ ] Soft-delete a note → disappears from both views; reappears in IndexedDB as `trashed: true`
- [ ] `purgeExpiredTrash` removes a note backdated to 31 days ago
- [ ] Merge item A (with notes) into item B → A's notes show under B; A's local row gone; remote `users/{uid}/notes/{a-note}` document has its `item_uid` updated
- [ ] Hard-delete item B (`deleteItem`) → cascades to all B's notes locally and remotely
- [ ] Two-device sync: create note offline on Device A, go online → appears on Device B via subscribe
- [ ] Two-device merge: merge on Device A → Device B's subscribe-modified handler remaps `itemUid`
- [ ] Language toggle: all new strings render correctly in zh and en
- [ ] Keyboard: `4` switches to Notes; `Tab` cycles subpages; shortcuts blocked while modal textarea is focused
- [ ] Mobile responsive layout of feed and modal

## Out-of-scope follow-ups (future)

- Voice command: "add note to <item>: <body>" via `intentParser.js`.
- Include notes in `ReportGeneratorModal` export.
- Search across note bodies.
- Tags / pin.
- AI summarization of a date range's notes.
