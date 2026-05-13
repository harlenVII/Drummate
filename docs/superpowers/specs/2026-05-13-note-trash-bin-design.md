# Note Trash Bin — Design Spec

**Date:** 2026-05-13

## Overview

Add a collapsible trash bin section to the Notes tab so users can review, restore, or permanently delete trashed notes. Matches the inline trash bin pattern already used for practice items in `PracticeItemList`.

## Placement

The trash bin lives at the bottom of `NotesPage`, after the `NotesByDate` / `NotesByItem` content. It is visible regardless of which subpage (By Date / By Item) is active. It is always rendered — not gated behind an edit mode.

## Database Layer (`database.js`)

Two new exported functions:

### `getTrashedNotes()`
```js
export const getTrashedNotes = async () => {
  const notes = await db.notes.toArray();
  return notes
    .filter(n => n.trashed)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};
```

### `purgeNote(id)`
```js
export const purgeNote = async (id) => {
  await db.notes.delete(id);
};
```

## NotesPage Changes

### New state
- `showTrash: boolean` — toggles the trash section open/closed
- `trashedNotes: Note[]` — loaded from `getTrashedNotes()` when the section is open

### Fetch logic
Load trashed notes when:
- `showTrash` is set to `true`
- `notesRefreshKey` changes while `showTrash` is already `true`

Use a `useEffect` keyed on `[showTrash, notesRefreshKey]`.

### New handlers

**`handleRestore(note)`**
1. `await restoreNote(note.id)`
2. If `user`: `firebaseBackend.pushNote(updatedNote, user.id)` (fetch note after restore to get `trashed: false`)
3. `onNotesRefresh()`

**`handlePermanentDelete(note)`**
1. `window.confirm(t('notes.confirmPermanentDelete'))`
2. `await purgeNote(note.id)`
3. If `user`: `firebaseBackend.deleteNoteRemote(note.uid, user.id)`
4. `onNotesRefresh()`

## UI

### Toggle button
```
[Show Trash (3)]   ← red-tinted border, small, same style as practice item trash toggle
```
Only rendered when `trashedNotes.length > 0` (checked on load / refresh).

### Expanded note row
Each row shows (opacity-50, same as practice item trash rows):
- **Left column:** Date string (`YYYY-MM-DD`) + item name (resolved from `items` prop by `itemUid`; trashed items show their name; unknown `itemUid` shows `t('notes.itemDeleted')`)
- **Body preview:** First ~80 chars of `body`, truncated with `…` if longer
- **Days left:** `t('daysLeft', { days: X })` in red, using `trashedAt` timestamp
- **Right column:** Restore button (↑ chevron icon, `hover:text-green-500`) + permanent delete button (✕ icon, `hover:text-red-600`)

Item name resolution includes trashed items because the `items` prop in `App.jsx` contains all items (active, archived, trashed). The lookup is `items.find(i => i.uid === note.itemUid)?.name`.

## i18n (`LanguageContext.jsx`)

New keys under `notes:` namespace:

| Key | EN | ZH |
|-----|----|----|
| `notes.showTrash` | `'Show Trash ({count})'` | `'显示回收站（{count}）'` |
| `notes.hideTrash` | `'Hide Trash'` | `'隐藏回收站'` |
| `notes.confirmPermanentDelete` | `'This will permanently delete this note. This cannot be undone. Continue?'` | `'这将永久删除此笔记。此操作无法撤销。是否继续？'` |

Reuse existing top-level `daysLeft`, `restore`, and `permanentDelete` keys for the row labels/titles.

## Sync Behaviour

| Action | Local | Remote |
|--------|-------|--------|
| Restore | `restoreNote(id)` sets `trashed: false, trashedAt: null` | `pushNote` upserts full note with `trashed: false` |
| Permanent delete | `purgeNote(id)` hard-deletes from IndexedDB | `deleteNoteRemote(uid, userId)` hard-deletes from Firestore |

Both paths are consistent with the patterns already used in `purgeExpiredTrash` and `handleDelete`.

## Files Changed

| File | Change |
|------|--------|
| `src/services/database.js` | Add `getTrashedNotes`, `purgeNote` |
| `src/components/NotesPage.jsx` | Add trash state, fetch effect, two handlers, trash UI section |
| `src/contexts/LanguageContext.jsx` | Add 3 new `notes.*` keys in EN and ZH |

No changes needed to `App.jsx`, `NotesByDate.jsx`, `NotesByItem.jsx`, or Firebase backend (existing methods are sufficient).
