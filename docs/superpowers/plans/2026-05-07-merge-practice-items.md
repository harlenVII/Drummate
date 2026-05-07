# Merge Practice Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user merge one practice item into another in edit mode. The source's logs are reattributed to the target; the source item is hard-deleted. Cross-device sync via a dedicated Firebase merge primitive.

**Architecture:** Local Dexie `mergeItem` runs in a single transaction (reassign logs, delete source). Firebase backend gets a new `mergeItems(sourceUid, targetUid, targetName, userId)` method that updates remote log docs' `item_uid` + `item_name` and deletes the source item doc. A `MergeTargetPicker` modal (search + grouped list) drives the UI from a new merge button in `PracticeItemList`'s edit-mode rows. **Critically**, this plan also fixes a pre-existing cross-device race in `pullAll` where item-deletion reconciliation runs before logs are pulled — which would cause data loss when device 2 pulls after a merge on device 1.

**Tech Stack:** React 19, Dexie.js (IndexedDB), Firebase Firestore. No automated test framework — this codebase verifies via `npm run build` plus manual testing per [CLAUDE.md](../../../CLAUDE.md).

**Verification model:** Every code task ends with `npm run build` (which runs Vite build; ESLint via `npm run lint` is also run where types matter). The final task is a manual end-to-end check covering all spec test cases. There is no Jest/Vitest setup and adding one is out of scope.

**Spec:** [docs/superpowers/specs/2026-05-07-merge-practice-items-design.md](../specs/2026-05-07-merge-practice-items-design.md)

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/services/database.js` | Modify (add export) | Local DB merge primitive |
| `src/services/backends/firebaseBackend.js` | Modify (add method, extend flushSyncQueue, fix pullAll ordering) | Cross-device sync; race fix |
| `src/components/MergeTargetPicker.jsx` | Create | Modal: search + grouped target list + confirmation |
| `src/components/PracticeItemList.jsx` | Modify (edit-mode row + state) | Merge button trigger; modal mounting |
| `src/App.jsx` | Modify (new handler + prop) | Coordinate local + remote merge call |
| `src/contexts/LanguageContext.jsx` | Modify (add keys, en + zh) | Translations |

---

## Task 1: Add `mergeItem` DB function

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Add the `mergeItem` export at the bottom of the Practice Items section, just after `purgeExpiredTrash`**

Open `src/services/database.js` and insert the following function after the closing `};` of `purgeExpiredTrash` (around line 178), before the `// --- Practice Logs ---` comment:

```js
export const mergeItem = async (sourceId, targetId) => {
  if (sourceId === targetId) {
    throw new Error('mergeItem: source and target are the same');
  }
  return await db.transaction('rw', db.practiceItems, db.practiceLogs, async () => {
    const source = await db.practiceItems.get(sourceId);
    const target = await db.practiceItems.get(targetId);
    if (!source) throw new Error('mergeItem: source item not found');
    if (!target) throw new Error('mergeItem: target item not found');
    if (source.trashed) throw new Error('mergeItem: source item is trashed');
    if (target.trashed) throw new Error('mergeItem: target item is trashed');

    await db.practiceLogs.where('itemId').equals(sourceId).modify({
      itemId: targetId,
      itemUid: target.uid,
    });
    await db.practiceItems.delete(sourceId);

    return { sourceUid: source.uid, targetUid: target.uid, targetName: target.name };
  });
};
```

- [ ] **Step 2: Run build to verify no syntax errors**

Run: `npm run build`
Expected: build completes successfully with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/database.js
git commit -m "feat: add local mergeItem DB function

Reassigns all logs from source item to target, then hard-deletes the
source. Validates source != target and that neither is trashed. Returns
{sourceUid, targetUid, targetName} for the sync layer."
```

---

## Task 2: Fix `pullAll` cross-device race

**Context:** [src/services/backends/firebaseBackend.js:252-376](../../../src/services/backends/firebaseBackend.js#L252) currently does this order:

1. Pull items (lines 253-335)
2. Reconcile item-deletions: for any local item with `syncedOnce: true` missing from remote, delete the item AND cascade-delete its logs by local `itemId` (lines 341-347)
3. Pull logs (lines 349-375)

When device 1 merges A→B, device 2's pull will: (1) see A missing from remote, (2) delete A locally AND cascade-delete its logs (which are still pointing at A.id locally), (3) only then pull logs — but the existing log dedupe by `uid` skips them. Result: device 2 loses the merged history.

**Fix:** Pull logs *before* reconciling item deletions. When a local log already exists, update its `itemUid` and `itemId` if remote moved it under a different parent. Then reconcile item-deletions normally — the cascade still works because logs that were merged elsewhere now point at the target item's `id`.

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Re-read the current `pullAll` to confirm the layout**

Run: `grep -n "async pullAll\|remoteUids.add\|Reconciliation step\|logsSnap" /Users/harlen/Desktop/myCODE/Drummate/src/services/backends/firebaseBackend.js`

Expected output approximately:
```
252:  async pullAll(userId) {
334:      remoteUids.add(data.uid);
337:    // Reconciliation step: any local item that has been synced before but is
349:    const logsSnap = await getDocs(logsRef(userId));
```

This confirms the order: items pulled → reconciliation at 337-347 → logs pulled at 349.

- [ ] **Step 2: Move the log-pull before the deletion reconciliation, and handle log remap on existing logs**

In `src/services/backends/firebaseBackend.js`, replace the block from `// Reconciliation step:` (line ~337) through the end of `async pullAll` (the closing `},` at ~376) with:

```js
    // Pull logs BEFORE reconciling item deletions, so logs whose `item_uid`
    // moved to a different parent (via merge on another device) get remapped
    // locally before their old parent gets deleted.
    const logsSnap = await getDocs(logsRef(userId));
    for (const docSnap of logsSnap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;

      // Resolve the parent item locally — prefer item_uid, fall back to item_name
      // for any legacy log whose item_uid hasn't been backfilled yet.
      let localItem = null;
      if (data.item_uid) {
        localItem = await db.practiceItems.where('uid').equals(data.item_uid).first();
      }
      if (!localItem && data.item_name) {
        localItem = await db.practiceItems.where('name').equals(data.item_name).first();
      }
      if (!localItem) continue;

      const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
      if (existing) {
        // Remap if remote moved this log under a different parent (cross-device merge).
        if (existing.itemUid !== localItem.uid || existing.itemId !== localItem.id) {
          await db.practiceLogs.update(existing.id, {
            itemUid: localItem.uid,
            itemId: localItem.id,
          });
        }
        continue;
      }

      await db.practiceLogs.add({
        itemId: localItem.id,
        itemUid: localItem.uid,
        date: data.date,
        duration: data.duration,
        uid: data.uid,
      });
    }

    // Reconciliation step: any local item that has been synced before but is
    // now missing from the cloud was deleted on another device. Apply the
    // delete locally + cascade logs. Local-only items (syncedOnce=false) are
    // preserved so pushAllLocal can push them up.
    //
    // NOTE: This MUST run AFTER pulling logs, otherwise a cross-device merge
    // would delete logs locally that have been remapped to a different parent
    // on the server.
    const allLocal = await db.practiceItems.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.practiceLogs.where('itemId').equals(local.id).delete();
        await db.practiceItems.delete(local.id);
      }
    }
  },
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build completes successfully.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no new errors. (Pre-existing warnings in other files may exist; no new ones introduced.)

- [ ] **Step 5: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "fix: pull logs before reconciling item deletions in pullAll

When a remote merge moves logs from item A to item B on another device,
device 2's pullAll previously deleted A locally (cascading log deletes by
itemId) before pulling logs that had been remapped to B. This caused
silent data loss across devices. Now logs are pulled first, with
existing logs remapped to their new parent, before item-delete
reconciliation runs."
```

---

## Task 3: Add `mergeItems` Firebase method + extend `flushSyncQueue`

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Add the `mergeItems` method after `pushSetCategory` (around line 249, before `// Sync — pull`)**

Open `src/services/backends/firebaseBackend.js`. Find the closing `},` of `pushSetCategory` (the `async pushSetCategory(...)` block). Immediately after it, before the `// Sync — pull` comment, insert:

```js
  async mergeItems(sourceUid, targetUid, targetName, userId) {
    if (sourceUid === targetUid) return;
    try {
      const q = query(logsRef(userId), where('item_uid', '==', sourceUid));
      const snap = await getDocs(q);
      for (const logDoc of snap.docs) {
        await updateDoc(logDoc.ref, {
          item_uid: targetUid,
          item_name: targetName,
        });
      }
      await deleteDoc(doc(itemsRef(userId), sourceUid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('merge_items', { sourceUid, targetUid, targetName });
      } else {
        throw err;
      }
    }
  },
```

(Note: this matches the existing sequential-update style in `pushDeleteItem` and `pushRenameItem`. No `writeBatch` import is needed.)

- [ ] **Step 2: Extend `flushSyncQueue` to handle the `merge_items` action**

Find the `flushSyncQueue` function (around line 390). Inside the `for (const entry of pending)` loop, find the chain of `else if` clauses. Add a new branch for `merge_items` — place it after the `set_category` clause and before the closing `}` of the if-chain:

```js
        } else if (entry.action === 'merge_items') {
          await firebaseBackend.mergeItems(
            entry.payload.sourceUid,
            entry.payload.targetUid,
            entry.payload.targetName,
            userId,
          );
```

- [ ] **Step 3: Verify there are no leftover references to undeclared symbols**

Run: `grep -n "merge_items\|mergeItems" /Users/harlen/Desktop/myCODE/Drummate/src/services/backends/firebaseBackend.js`

Expected: at least 3 matches — the method definition, the `queueSync('merge_items', ...)` call inside the catch, and the `flushSyncQueue` branch.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat: add mergeItems backend method + sync queue handler

Server-side merge: updates all logs with item_uid==sourceUid to target
uid+name (denormalized field), then deletes the source item doc.
Falls back to syncQueue when offline; flushSyncQueue replays it."
```

---

## Task 4: Add translation keys

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Read the file to locate the `en` and `zh` translation objects**

Run: `grep -n "^  en:\|^  zh:\|categories:\|archive:\|delete:" /Users/harlen/Desktop/myCODE/Drummate/src/contexts/LanguageContext.jsx | head -20`

Use the line numbers to identify where to add keys in both `en` and `zh` blocks. Match the existing flat-key style (e.g., `archive: 'Archive',`).

- [ ] **Step 2: Add the following keys to the `en` block**

Add these keys at a sensible spot near other item-action keys (e.g., after `unarchive`):

```js
    merge: 'Merge',
    mergePickerTitle: 'Merge into…',
    mergeSearchPlaceholder: 'Search items',
    mergeArchivedTag: '(archived)',
    mergeEmptyState: 'No other items to merge into.',
    mergeConfirmTitle: 'Confirm merge',
    mergeConfirmBody: 'Merge "{source}" into "{target}"? All practice history from "{source}" will be attributed to "{target}". "{source}" will be deleted.',
    mergeConfirmAction: 'Merge',
    mergeNoOtherItems: 'No other items',
```

- [ ] **Step 3: Add the same keys to the `zh` block**

```js
    merge: '合并',
    mergePickerTitle: '合并到…',
    mergeSearchPlaceholder: '搜索项目',
    mergeArchivedTag: '（已归档）',
    mergeEmptyState: '没有其他项目可以合并。',
    mergeConfirmTitle: '确认合并',
    mergeConfirmBody: '将"{source}"合并到"{target}"？"{source}"的所有练习记录将归属到"{target}"。"{source}"将被删除。',
    mergeConfirmAction: '合并',
    mergeNoOtherItems: '没有其他项目',
```

- [ ] **Step 4: Verify interpolation is supported**

Run: `grep -n "\\{[a-zA-Z]" /Users/harlen/Desktop/myCODE/Drummate/src/contexts/LanguageContext.jsx | head -5`

Expected: existing keys use `{varName}` interpolation (e.g., `daysLeft`). If they don't, the merge confirm body will need to use the same interpolation pattern as the existing `t()` call sites support — check `LanguageContext.jsx` for how `t(key, vars)` substitutes.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add merge UI translation keys (en + zh)"
```

---

## Task 5: Build `MergeTargetPicker` component

**Files:**
- Create: `src/components/MergeTargetPicker.jsx`

- [ ] **Step 1: Create the new component**

Create `src/components/MergeTargetPicker.jsx` with this content:

```jsx
import { useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

function MergeTargetPicker({ sourceItem, items, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [pendingTarget, setPendingTarget] = useState(null);

  const eligible = useMemo(() => {
    return items.filter(
      (i) => !i.trashed && i.id !== sourceItem.id
    );
  }, [items, sourceItem.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((i) => i.name.toLowerCase().includes(q));
  }, [eligible, search]);

  const fundamentals = filtered.filter((i) => i.category === 'fundamentals');
  const songs = filtered.filter((i) => i.category === 'songs');

  if (pendingTarget) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            {t('mergeConfirmTitle')}
          </h2>
          <p className="text-sm text-gray-700 mb-5">
            {t('mergeConfirmBody', {
              source: sourceItem.name,
              target: pendingTarget.name,
            })}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingTarget(null)}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => onConfirm(pendingTarget.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
            >
              {t('mergeConfirmAction')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderRow = (item) => (
    <button
      key={item.id}
      onClick={() => setPendingTarget(item)}
      className={`text-left w-full px-3 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors ${
        item.archived ? 'opacity-60' : ''
      }`}
    >
      <span className="font-medium text-gray-800">{item.name}</span>
      {item.archived && (
        <span className="ml-2 text-xs text-gray-500">{t('mergeArchivedTag')}</span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              {t('mergePickerTitle')}
            </h2>
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label={t('cancel')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('mergeSearchPlaceholder')}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {eligible.length === 0 && (
            <p className="text-center text-gray-400 italic">{t('mergeEmptyState')}</p>
          )}
          {eligible.length > 0 && filtered.length === 0 && (
            <p className="text-center text-gray-400 italic">{t('mergeNoOtherItems')}</p>
          )}
          {fundamentals.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t('categories.fundamentals')}
              </h3>
              {fundamentals.map(renderRow)}
            </div>
          )}
          {songs.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t('categories.songs')}
              </h3>
              {songs.map(renderRow)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MergeTargetPicker;
```

- [ ] **Step 2: Verify the `cancel` translation key exists**

Run: `grep -n "cancel:" /Users/harlen/Desktop/myCODE/Drummate/src/contexts/LanguageContext.jsx`

Expected: at least one match in `en` and one in `zh`. If the key doesn't exist, add `cancel: 'Cancel',` (en) and `cancel: '取消',` (zh) to LanguageContext in this same task and amend the commit.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/MergeTargetPicker.jsx
git commit -m "feat: add MergeTargetPicker modal component

Two-stage modal: search + grouped list of eligible targets, then
confirmation with source/target names interpolated."
```

---

## Task 6: Wire merge button into `PracticeItemList`

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

- [ ] **Step 1: Import the new component and add the prop**

In `src/components/PracticeItemList.jsx`, top of file, add the import next to the existing imports:

```jsx
import MergeTargetPicker from './MergeTargetPicker';
```

In the `PracticeItemList` props destructure (around line 86-103), add `onMergeItem` to the prop list. The block currently ends with `onSetItemCategory,` — insert `onMergeItem,` before the closing `}`:

```jsx
function PracticeItemList({
  items,
  totals,
  activeItemId,
  elapsedTime,
  editing,
  onSetEditing,
  onStart,
  onStop,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  onReorder,
  onArchiveItem,
  onRestoreItem,
  onPermanentDelete,
  onSetItemCategory,
  onMergeItem,
}) {
```

- [ ] **Step 2: Add merge picker state inside the component**

Right after the existing `useState` declarations (after `const [addCategory, setAddCategory] = useState('fundamentals');` on line 113), add:

```jsx
  const [mergeSourceItem, setMergeSourceItem] = useState(null);
```

- [ ] **Step 3: Add the merge button to the edit-mode row**

In the `renderEditRow` function (currently lines ~282-340), the row's button group lives in `<div className="flex items-center gap-1">`. Add a new merge button between the archive button (which ends at line ~318) and the delete button (line ~319). Insert this `<button>` between them:

```jsx
            <button
              onClick={() => setMergeSourceItem(item)}
              className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
              title={t('merge')}
              aria-label={`${t('merge')}: ${item.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h4a1 1 0 010 2H6.414l3.293 3.293a1 1 0 01.293.707V17a1 1 0 11-2 0v-6.586L4.414 7H4a1 1 0 01-1-1V5zm14 0a1 1 0 00-1-1h-4a1 1 0 100 2h1.586l-3.293 3.293a1 1 0 00-.293.707V17a1 1 0 102 0v-6.586L15.586 7H16a1 1 0 001-1V5z" clipRule="evenodd" />
              </svg>
            </button>
```

The full button group should now be: CategoryToggle → archive button → **merge button (new)** → delete button.

- [ ] **Step 4: Mount the picker modal at the end of the edit-mode return**

In the edit-mode `return` (currently `return ( <div className="flex flex-col gap-3"> ... </div> );` ending around line 470), just before the final `</div>` of the outer wrapping div, add a conditional render of the picker:

```jsx
        {mergeSourceItem && (
          <MergeTargetPicker
            sourceItem={mergeSourceItem}
            items={items}
            onCancel={() => setMergeSourceItem(null)}
            onConfirm={(targetId) => {
              const sourceId = mergeSourceItem.id;
              setMergeSourceItem(null);
              onMergeItem(sourceId, targetId);
            }}
          />
        )}
```

Place this directly before the line `</div>` that closes the outer flex container (just after the trash bin block ends at the existing `)}` of `{hasTrashedItems && (...)`).

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: no new errors. (`onMergeItem` should be declared since you added it to the props.)

- [ ] **Step 7: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "feat: add merge button + picker integration in edit mode

Adds a merge icon between archive and delete on each edit-mode row.
Opens MergeTargetPicker; on confirm calls onMergeItem(sourceId, targetId)."
```

---

## Task 7: Add `handleMergeItem` in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import `mergeItem` from the database service**

Find the existing import line for database functions in `src/App.jsx`. Look for:

Run: `grep -n "from './services/database'" /Users/harlen/Desktop/myCODE/Drummate/src/App.jsx`

Expected: a line like `import { addItem, ..., setItemCategory } from './services/database';`. Add `mergeItem` to that import list. Example: change `import { addItem, renameItem, ..., setItemCategory } from './services/database';` to include `mergeItem`:

```jsx
import { addItem, renameItem, deleteItem, archiveItem, restoreItem, trashItem, setItemCategory, mergeItem /* add this */, /* ...other existing imports */ } from './services/database';
```

(Preserve the order and all existing imports — only insert `mergeItem` into the list.)

- [ ] **Step 2: Add the `handleMergeItem` callback**

In `src/App.jsx`, find `handleSetItemCategory` (around line 569). Immediately after its closing `);` on line ~579, add:

```jsx
  const handleMergeItem = useCallback(
    async (sourceId, targetId) => {
      if (sourceId === targetId) return;
      let result;
      try {
        result = await mergeItem(sourceId, targetId);
      } catch (err) {
        console.error('mergeItem failed:', err);
        return;
      }
      await loadData();
      if (user && result) {
        firebaseBackend
          .mergeItems(result.sourceUid, result.targetUid, result.targetName, user.id)
          .catch(console.error);
      }
    },
    [loadData, user],
  );
```

- [ ] **Step 3: Pass `onMergeItem` prop to `PracticeItemList`**

Find the `<PracticeItemList ... />` JSX (around line 1167). In the prop list (which currently includes `onDeleteItem={handleDeleteItem}`, `onArchiveItem={handleArchiveItem}`, etc.), add:

```jsx
              onMergeItem={handleMergeItem}
```

Place it next to the other item handlers (e.g., after `onSetItemCategory={handleSetItemCategory}`).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no new warnings or errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire handleMergeItem into App and pass to PracticeItemList

Calls local mergeItem() then pushes the merge to Firebase if signed in.
Mirrors the local-first / sync-second pattern of other item handlers."
```

---

## Task 8: End-to-end manual verification

**Files:** none

This task is a manual checklist matching the spec's testing section. Run the dev server, work through each case, and confirm visually + via reports.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: `VITE v7 ... ready in N ms ➜ Local: http://localhost:5173/`

- [ ] **Step 2: Verify the build still works**

In another terminal: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual test — basic merge with disjoint dates**

1. Sign in (or use a fresh local DB).
2. Create item A in Fundamentals; log practice on dates X, Y.
3. Create item B in Fundamentals; log practice on date Z.
4. Enter edit mode → tap merge icon on A → pick B → confirm.
5. Verify: A is gone from the list. B remains. Reports → daily for X, Y, Z all show time on B. Total on B equals A's + B's combined.

- [ ] **Step 4: Manual test — merge with overlapping dates**

1. Create C; log 5 min today.
2. Create D; log 7 min today.
3. Merge C → D.
4. Verify: D appears twice in today's report (or shows summed total of 12 min, depending on UI granularity). Both log records survive in `db.practiceLogs` (open Application > IndexedDB in DevTools to confirm).

- [ ] **Step 5: Manual test — merge into archived target**

1. Create E. Archive it.
2. Create F. Don't archive.
3. In edit mode, click "Show archived" → merge F → E.
4. Verify: F is gone. E remains archived. F's logs visible in reports under E.

- [ ] **Step 6: Manual test — merge across categories**

1. Create G in Fundamentals. Log some time.
2. Create H in Songs. Log some time.
3. Merge G → H.
4. Verify: G gone. H still in Songs category with combined logs.

- [ ] **Step 7: Manual test — picker behavior**

1. With only one item I, enter edit mode → tap merge on I.
2. Verify: picker shows the empty state ("No other items to merge into.")
3. With multiple items, verify: source item I is NOT in the list. Search filters by substring (case-insensitive). Archived items show with "(archived)" tag and dimmed.

- [ ] **Step 8: Manual test — offline merge**

1. In DevTools, set network to "Offline".
2. Perform a merge.
3. Verify: local list updates (source removed, target keeps logs). Reports correct.
4. Check IndexedDB → `syncQueue` has a `merge_items` entry.
5. Set network back to "Online". Reload the app.
6. Verify: cloud now reflects the merge. Check Firestore console: source item doc is gone, all logs have updated `item_uid`.

- [ ] **Step 9: Manual test — cross-device sync (the race fix)**

This is the critical test for Task 2.

1. Sign in on **device A** (or browser profile A). Create items J and K. Add logs to J on multiple dates. Wait for cloud sync (refresh or watch network tab).
2. Sign in on **device B** (different browser/incognito) with the same account. Wait for pull. Verify J and K appear with logs.
3. On device A: merge J → K.
4. On device B: reload the app (forces `pullAll`).
5. Verify: J is gone on B. K shows all of J's prior logs in reports. **No data loss.**

If this step fails (J's logs disappear on B), Task 2 is broken — revisit `pullAll` in firebaseBackend.

- [ ] **Step 10: Manual test — language toggle**

1. Switch to Chinese. Verify all merge UI text is translated (button title, modal title, search placeholder, archived tag, confirm body, confirm button).
2. Switch back to English. Verify same.

- [ ] **Step 11: Final lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed cleanly.

- [ ] **Step 12: No commit needed**

This task is verification only.

---

## Self-Review Notes

- Spec coverage: every spec section maps to a task — UX in Tasks 5+6, data model in Task 1, sync in Task 3, the `pullAll` race in Task 2 (called out as a real concern in the spec), translations in Task 4, App-level coordination in Task 7, testing in Task 8.
- The cross-device race fix (Task 2) is grouped before the merge backend method (Task 3) so the fix lands first; if Task 3 ships before Task 2 anyone running on two devices loses data on a merge.
- No automated tests added — the codebase has none, and adding a test framework is scope creep. Verification is via `npm run build` + manual checklist.
- Type/symbol consistency: `mergeItem` (singular, local DB) returns `{sourceUid, targetUid, targetName}`, consumed by `firebaseBackend.mergeItems` (plural, sync method) with signature `(sourceUid, targetUid, targetName, userId)`. `App.jsx` calls `user.id` (matches existing handlers — `normalizeUser` maps Firebase `uid` → `id`).
