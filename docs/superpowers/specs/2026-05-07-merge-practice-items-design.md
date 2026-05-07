# Merge practice items — design

**Date:** 2026-05-07
**Status:** Approved (ready for implementation plan)

## Goal

Let the user merge one practice item (the "source") into another (the "target"). The source's practice history is reassigned to the target. The source item itself is deleted; it loses its place in the list. The target keeps its identity, category, archived state, and sort order.

## UX

### Entry point

In edit mode, each item row currently shows archive and delete buttons. Add a third **merge** button between archive and delete.

Edit mode entry already auto-stops any running timer via `handleSetEditing` in [src/App.jsx:607-615](../../../src/App.jsx#L607-L615), so the merge action never collides with an in-progress practice session — no extra guard needed.

### Picker modal

Tapping merge opens `MergeTargetPicker`, a modal with:

- A search input at the top (filters by case-insensitive substring on `name`).
- A list of all other non-trashed items, grouped under "Fundamentals" and "Songs" headings.
- Archived items appear in their group with a small "(archived)" tag, dimmed.
- The source item itself is excluded from the list.
- If no eligible targets exist, show empty state: "No other items to merge into."

Selecting a row opens an inline confirmation step (or a second modal): *"Merge **A** into **B**? All practice history from A will be attributed to B. A will be deleted."* Confirm → execute merge, close modal, return to edit mode (which now lists only the surviving items).

### Translations

New keys for `en` and `zh` in [src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx):

- `merge` — button label
- `mergePickerTitle` — modal title, e.g. "Merge into…"
- `mergeSearchPlaceholder` — e.g. "Search items"
- `mergeArchivedTag` — e.g. "(archived)"
- `mergeEmptyState` — when no other items exist
- `mergeConfirmTitle` — confirmation modal title
- `mergeConfirmBody` — supports interpolation with source name and target name
- `mergeConfirmAction` — confirm button label, e.g. "Merge"

## Data model & semantics

### Eligibility

- Source: any non-trashed item (the user can only invoke from edit mode anyway).
- Target: any non-trashed item that is **not** the source. Active or archived. Either category.
- Reject (throw) if `sourceId === targetId`, or if either is missing/trashed.

### Local mutation

A new DB function in [src/services/database.js](../../../src/services/database.js):

```js
export const mergeItem = async (sourceId, targetId) => {
  if (sourceId === targetId) throw new Error('mergeItem: source and target are the same');
  return await db.transaction('rw', db.practiceItems, db.practiceLogs, async () => {
    const source = await db.practiceItems.get(sourceId);
    const target = await db.practiceItems.get(targetId);
    if (!source || !target) throw new Error('mergeItem: missing item');
    if (source.trashed || target.trashed) throw new Error('mergeItem: item is trashed');

    await db.practiceLogs.where('itemId').equals(sourceId).modify({
      itemId: targetId,
      itemUid: target.uid,
    });
    await db.practiceItems.delete(sourceId);
    return { sourceUid: source.uid, targetUid: target.uid, targetName: target.name };
  });
};
```

Returns the uids and target name needed by the sync layer.

### Same-date logs

If both source and target have a log on the same date, both rows survive and remain attributed to the target after merge. Daily/weekly/monthly reports already sum `duration` per item, so the totals come out correctly. Session-level granularity is preserved (e.g. two practice sessions on the same day stay as two rows).

### Source disposal

Hard delete. The source item row is removed permanently, **without** the cascade log-delete that `deleteItem` performs — `mergeItem` is a different code path and does not call `deleteItem`. The history lives on under the target.

## Sync

### New backend method

In [src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js):

```js
async mergeItems(sourceUid, targetUid, targetName, userId) {
  try {
    const q = query(logsRef(userId), where('item_uid', '==', sourceUid));
    const snap = await getDocs(q);
    // Update logs in batches of up to 500 ops; final batch also deletes source item.
    const docs = snap.docs;
    let i = 0;
    while (i < docs.length) {
      const batch = writeBatch(db);
      const slice = docs.slice(i, i + 499); // reserve 1 op for the item delete in the final batch
      for (const d of slice) {
        batch.update(d.ref, { item_uid: targetUid, item_name: targetName });
      }
      const isLast = i + slice.length >= docs.length;
      if (isLast) batch.delete(doc(itemsRef(userId), sourceUid));
      await batch.commit();
      i += slice.length;
    }
    if (docs.length === 0) {
      await deleteDoc(doc(itemsRef(userId), sourceUid));
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('merge_items', { sourceUid, targetUid, targetName });
    } else {
      throw err;
    }
  }
}
```

### syncQueue extension

`flushSyncQueue` learns a new action type `merge_items`. Payload: `{ sourceUid, targetUid, targetName }`. Replays by calling `firebaseBackend.mergeItems(...)`.

### Order of operations in `App.jsx`

`handleMergeItem(sourceId, targetId)`:

1. `const { sourceUid, targetUid, targetName } = await mergeItem(sourceId, targetId);` — local first.
2. `await loadData();` — refresh items list and totals.
3. If `user`: `await firebaseBackend.mergeItems(sourceUid, targetUid, targetName, user.uid);`
4. If the backend call throws while online, surface a toast/error but **do not** roll back local. The next sync cycle (`pullAll` reconciles the source's absence; `pushAllLocal` re-pushes reassigned logs because each log carries the new `itemUid`) will converge state. As an extra safety net, retry `pushDeleteItem(sourceUid, user.uid)` on failure branch.

### Cross-device convergence

If device 2 holds a stale view of the source item and pulls after device 1 merged:

- `pullAll` finds the source uid missing on the server. The local source item has `syncedOnce: true`, so `pullAll` deletes it locally — **including** its local logs (cascade), per existing behavior. **Risk:** if device 2 hasn't yet pulled the reassignment, those local logs are not yet pointing at the target uid; deleting them would lose history on device 2 even though the server has them under the target uid.
- Mitigation: ensure `pullAll` pulls **logs first** (or at least pulls logs in the same pass before deleting orphaned items), so device 2 picks up `item_uid: targetUid` on those log docs before reconciling item deletes. Verify the current `pullAll` ordering and adjust if needed.
- Alternative mitigation if `pullAll` already deletes logs by local `itemId` cascade: change merge's local mutation order so logs are reassigned **and** their dexie `itemId` updated before the item is deleted, which is already what `mergeItem` does. The remaining risk is purely a remote-pull race; resolved by ensuring `pullAll` updates log records before purging missing items.

This is a real implementation concern and the plan must verify the current `pullAll` ordering early.

## Components touched

| File | Change |
|------|--------|
| [src/services/database.js](../../../src/services/database.js) | Add `mergeItem(sourceId, targetId)`. |
| [src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js) | Add `mergeItems()` method; extend `flushSyncQueue` for `merge_items`. Verify and, if needed, adjust `pullAll` ordering for the cross-device race. |
| [src/App.jsx](../../../src/App.jsx) | Add `handleMergeItem` callback; pass to `PracticeItemList`. |
| [src/components/PracticeItemList.jsx](../../../src/components/PracticeItemList.jsx) | Add merge icon in edit-mode rows; manage picker modal state. |
| `src/components/MergeTargetPicker.jsx` (new) | Modal with search and grouped list of eligible targets; emits `(targetId)` on confirm. |
| [src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx) | Add translation keys (en + zh). |

## Testing checklist

Manual (no automated test infra in this repo):

- [ ] Merge A→B with disjoint dates → totals on B equal A's + B's; A gone.
- [ ] Merge A→B with overlapping dates → both source-side and target-side logs survive on B; daily report sums correctly.
- [ ] Merge into an archived target → succeeds; target remains archived; logs accessible in reports.
- [ ] Merge across categories (fundamentals → songs) → succeeds; target keeps its category.
- [ ] Picker hides the source item; shows category groupings; archived tag visible; search filters.
- [ ] No-eligible-targets state → empty modal copy displayed; cannot confirm.
- [ ] Reject `sourceId === targetId` (defense in depth, picker should already prevent).
- [ ] Offline merge → local state correct; replays via `flushSyncQueue` on reconnect.
- [ ] Two-device sync: merge on device 1 → device 2 pulls, source disappears, logs visible under target with no history loss.
- [ ] `npm run build` succeeds.
