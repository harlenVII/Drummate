# Note Trash Bin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible trash bin section to the Notes tab so users can restore or permanently delete trashed notes, matching the inline pattern used for practice items.

**Architecture:** Three self-contained changes — new DB helpers, new i18n strings, then UI wired into `NotesPage`. No new files; all changes are additive to existing files. No changes needed in `App.jsx` or Firebase backend.

**Tech Stack:** React 19, Dexie.js (IndexedDB), Tailwind CSS v4, Firebase (existing `pushNote` / `deleteNoteRemote` methods)

---

### Task 1: Add `getTrashedNotes` and `purgeNote` to `database.js` [model: haiku]

**Files:**
- Modify: `src/services/database.js` (after the existing `restoreNote` export, around line 336)

- [ ] **Step 1: Add `getTrashedNotes` after `restoreNote`**

Open `src/services/database.js`. After the `restoreNote` function block (which ends around line 338), add:

```js
export const getTrashedNotes = async () => {
  const notes = await db.notes.toArray();
  return notes
    .filter(n => n.trashed)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};

export const purgeNote = async (id) => {
  await db.notes.delete(id);
};
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/database.js
git commit -m "feat(notes): add getTrashedNotes and purgeNote DB helpers"
```

---

### Task 2: Add i18n strings for the trash bin UI [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

The `notes` object in the `en` locale ends around line 254, and in the `zh` locale around line 506. Add three new keys to each.

- [ ] **Step 1: Add EN strings**

In the `en.notes` object (after the `noActiveItems` line, before the closing `},`), add:

```js
      showTrash: 'Show Trash ({count})',
      hideTrash: 'Hide Trash',
      confirmPermanentDelete: 'This will permanently delete this note. This cannot be undone. Continue?',
```

- [ ] **Step 2: Add ZH strings**

In the `zh.notes` object (after the `noActiveItems` line, before the closing `},`), add:

```js
      showTrash: '显示回收站（{count}）',
      hideTrash: '隐藏回收站',
      confirmPermanentDelete: '这将永久删除此笔记。此操作无法撤销。是否继续？',
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(notes): add trash bin i18n strings"
```

---

### Task 3: Add trash bin state, handlers, and UI to `NotesPage` [model: sonnet]

**Files:**
- Modify: `src/components/NotesPage.jsx`

- [ ] **Step 1: Update imports**

At the top of `NotesPage.jsx`, change the database import line from:

```js
import {
  addNote, updateNote, trashNote, db,
} from '../services/database';
```

to:

```js
import {
  addNote, updateNote, trashNote, restoreNote, getTrashedNotes, purgeNote, db,
} from '../services/database';
```

Also change the React import from:

```js
import { useState, useCallback } from 'react';
```

to:

```js
import { useState, useCallback, useEffect } from 'react';
```

- [ ] **Step 2: Add trash state and fetch effect**

After the existing `const [editingNote, setEditingNote] = useState(null);` line, add:

```js
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState([]);

  useEffect(() => {
    if (!showTrash) return;
    getTrashedNotes().then(setTrashedNotes);
  }, [showTrash, notesRefreshKey]);
```

- [ ] **Step 3: Add `handleRestore` handler**

After the existing `handleDelete` callback, add:

```js
  const handleRestore = useCallback(async (note) => {
    await restoreNote(note.id);
    onNotesRefresh();
    if (user) {
      const updated = await db.notes.get(note.id);
      firebaseBackend.pushNote(updated, user.id).catch(console.error);
    }
  }, [user, firebaseBackend, onNotesRefresh]);

  const handlePermanentDelete = useCallback(async (note) => {
    if (!window.confirm(t('notes.confirmPermanentDelete'))) return;
    await purgeNote(note.id);
    onNotesRefresh();
    if (user) {
      firebaseBackend.deleteNoteRemote(note.uid, user.id).catch(console.error);
    }
  }, [user, firebaseBackend, onNotesRefresh, t]);
```

- [ ] **Step 4: Add the trash bin UI section**

In the JSX return, after the closing `{modalOpen && (...)}` block and before the closing `</>`, add:

```jsx
      {(trashedNotes.length > 0 || showTrash) && (
        <div className="mt-2">
          <button
            onClick={() => setShowTrash(prev => !prev)}
            className="px-3 py-1 text-sm text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            {showTrash ? t('notes.hideTrash') : t('notes.showTrash', { count: trashedNotes.length })}
          </button>

          {showTrash && (
            <div className="flex flex-col gap-2 mt-3">
              {trashedNotes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">{t('notes.emptyByDate')}</p>
              )}
              {trashedNotes.map((note) => {
                const daysLeft = note.trashedAt
                  ? Math.max(0, 30 - Math.floor((Date.now() - new Date(note.trashedAt).getTime()) / (1000 * 60 * 60 * 24)))
                  : 0;
                const itemName = items.find(i => i.uid === note.itemUid)?.name ?? t('notes.itemDeleted');
                const preview = note.body.length > 80 ? note.body.slice(0, 80) + '…' : note.body;
                return (
                  <div key={note.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center opacity-50">
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-gray-500">{note.date} · {itemName}</span>
                        <span className="text-sm text-gray-700 truncate">{preview}</span>
                        <span className="text-xs text-red-400">{t('daysLeft', { days: daysLeft })}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRestore(note)}
                          className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                          title={t('restore')}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414zm0-6a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(note)}
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

Note: The "Show Trash" button is only rendered when `trashedNotes.length > 0 || showTrash` — if there are no trashed notes and the section is closed, it stays hidden. Once open, it stays visible even if the list empties (so the user can see the empty state after restoring the last note).

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 6: Manual smoke test**

Start the dev server: `npm run dev`

1. Go to the Notes tab. Confirm no "Show Trash" button if no trashed notes exist.
2. Create a note, open it, delete it. Confirm it disappears from By Date / By Item views.
3. Confirm "Show Trash (1)" button now appears at the bottom of the Notes tab.
4. Click it — confirm the trashed note row appears with date, item name, body preview, "Xd left", restore and delete icons.
5. Click Restore — confirm the note reappears in By Date / By Item, and the row disappears from the trash list.
6. Trash the note again. Click "Show Trash", then click permanent delete. Confirm the confirmation dialog appears. Confirm → note gone. Trash section disappears.
7. Toggle language to Chinese. Confirm trash button and row labels appear in Chinese.

- [ ] **Step 7: Commit**

```bash
git add src/components/NotesPage.jsx
git commit -m "feat(notes): add inline trash bin with restore and permanent delete"
```
