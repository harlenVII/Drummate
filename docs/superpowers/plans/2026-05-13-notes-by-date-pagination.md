# NotesByDate Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit NotesByDate to 30 date groups on first render, with a "Load more" button that reveals the next 30.

**Architecture:** All notes are still fetched from IndexedDB upfront (fast). A `visibleCount` state slices the already-computed `groups` array before rendering. No DB or sync changes needed.

**Tech Stack:** React 19, Tailwind CSS v4, existing `useLanguage` / `t()` i18n system

---

### Task 1: Add `notes.loadMore` i18n key [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add EN string**

In the `en.notes` object (after the `emptyTrash` line), add:

```js
      loadMore: 'Load more',
```

- [ ] **Step 2: Add ZH string**

In the `zh.notes` object (after the `emptyTrash` line), add:

```js
      loadMore: '加载更多',
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(notes): add loadMore i18n key"
```

---

### Task 2: Add `visibleCount` pagination to `NotesByDate` [model: haiku]

**Files:**
- Modify: `src/components/NotesByDate.jsx`

The current file is 84 lines. Here is the complete replacement — read it carefully before applying:

- [ ] **Step 1: Replace the full content of `NotesByDate.jsx`**

```jsx
import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getAllNotes } from '../services/database';
import { getTodayString, shiftDate, formatDateLabel } from '../utils/dateHelpers';

const PAGE_SIZE = 30;

function NotesByDate({ items, refreshKey, onEdit }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getAllNotes();
      if (!cancelled) setNotes(all);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [refreshKey]);

  const itemNameByUid = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.trashed) map.set(it.uid, it.name);
    }
    return map;
  }, [items]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const n of notes) {
      if (!itemNameByUid.has(n.itemUid)) continue;
      if (!byDate.has(n.date)) byDate.set(n.date, []);
      byDate.get(n.date).push(n);
    }
    return Array.from(byDate.entries()); // already in date-desc order from getAllNotes
  }, [notes, itemNameByUid]);

  const dateHeader = (dateStr) => {
    const today = getTodayString();
    if (dateStr === today) return t('notes.todayLabel');
    if (dateStr === shiftDate(today, -1)) return t('notes.yesterdayLabel');
    return formatDateLabel(dateStr, t);
  };

  if (groups.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12">{t('notes.emptyByDate')}</p>
    );
  }

  const visibleGroups = groups.slice(0, visibleCount);
  const hasMore = visibleCount < groups.length;

  return (
    <div className="flex flex-col gap-6">
      {visibleGroups.map(([date, notesForDate]) => (
        <section key={date}>
          <h3 className="text-sm font-semibold text-gray-500 mb-2 sticky top-0 bg-gray-100 py-1">
            {dateHeader(date)}
          </h3>
          <div className="flex flex-col gap-2">
            {notesForDate.map(note => {
              const itemName = itemNameByUid.get(note.itemUid);
              return (
                <button
                  key={note.id}
                  onClick={() => onEdit(note)}
                  className="text-left bg-white rounded-lg shadow-sm p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      {itemName}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                    {note.body}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(n => n + PAGE_SIZE)}
          className="self-center px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('notes.loadMore')}
        </button>
      )}
    </div>
  );
}

export default NotesByDate;
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`

1. Open the Notes tab → By Date. Confirm notes load as before.
2. If you have fewer than 30 date groups: confirm no "Load more" button appears.
3. To test the button: in browser DevTools console, temporarily lower the threshold — or just verify the button appears by checking that `visibleGroups` is sliced when more than 30 groups exist.
4. If you do have 30+ date groups: confirm "Load more" appears, click it, confirm more groups appear.
5. Add a new note → confirm the list resets to showing the most recent 30 groups (not an ever-growing window).
6. Toggle language to Chinese → confirm button reads "加载更多".

- [ ] **Step 4: Commit**

```bash
git add src/components/NotesByDate.jsx
git commit -m "feat(notes): paginate By Date view to 30 groups with load-more"
```
