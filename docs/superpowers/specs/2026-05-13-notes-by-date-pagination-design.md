# NotesByDate Pagination — Design Spec

**Date:** 2026-05-13

## Problem

`NotesByDate` fetches all notes from IndexedDB and renders every date group as DOM nodes in a single pass. With 1000+ notes over time, this produces hundreds of DOM nodes and causes sluggish scrolling.

## Approach

Paginate by **date group** (one page = 30 date groups). All notes are still fetched from IndexedDB upfront (the query is fast, ~1ms for 1000 rows). A `visibleCount` state controls how many groups from the already-computed `groups` array are rendered. "Load more" increments `visibleCount` by 30 with no re-fetch.

This was chosen over note-count pagination because it always renders complete days — no awkward mid-group splits in a date-grouped UI.

## Data Flow

1. `getAllNotes()` fetch: unchanged — all notes loaded into `notes` state on `refreshKey` change.
2. `groups` memo: unchanged — all date groups computed, sorted date-descending.
3. **New:** `visibleCount` state starts at `30`.
4. Render: `groups.slice(0, visibleCount)` instead of `groups`.
5. **New:** "Load more" button below the last visible group, shown only when `visibleCount < groups.length`, calls `setVisibleCount(n => n + 30)`.
6. **New:** `useEffect([refreshKey])` resets `visibleCount` to `30` so remote/local additions don't accumulate a stale large window.

## Files Changed

| File | Change |
|------|--------|
| `src/components/NotesByDate.jsx` | Add `visibleCount` state, reset effect, slice on render, "Load more" button |
| `src/contexts/LanguageContext.jsx` | Add `notes.loadMore` in EN (`"Load more"`) and ZH (`"加载更多"`) |

No changes to `NotesPage`, `NotesByItem`, `database.js`, or Firebase backend.

## UI Details

- **"Load more" button:** Rendered after the last visible date group, styled consistently with other secondary actions in the app (small, gray, rounded). Hidden when all groups are already visible (`visibleCount >= groups.length`).
- **Reset on refresh:** `visibleCount` resets to `30` on every `refreshKey` change so the user starts from the top after a sync.
- **Page size:** 30 date groups initial, +30 per click. This covers ~1 month of daily practice per page.

## Non-Goals

- No virtual scrolling / IntersectionObserver
- No changes to NotesByItem (accordion already scopes visible DOM to item count, not note count)
- No "showing X of Y days" indicator
