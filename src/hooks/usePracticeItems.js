import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  db,
  addItem,
  renameItem,
  trashItem,
  restoreItem,
  deleteItem,
  archiveItem,
  setItemCategory,
  mergeItem,
} from '../services/database';
import firebaseBackend from '../services/backends/firebaseBackend';

export function usePracticeItems({ items, loadData, activeItemId, clearActiveTimer }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const handleAddItem = useCallback(
    async (name, category) => {
      const duplicate = items.some(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        alert(t('duplicateItem'));
        return;
      }
      const newItem = await addItem(name, category);
      await loadData();
      if (user) {
        firebaseBackend.pushItem(newItem, user.id).catch(console.error);
      }
    },
    [items, loadData, user, t],
  );

  const handleRenameItem = useCallback(
    async (id, newName) => {
      const item = await db.practiceItems.get(id);
      await renameItem(id, newName);
      await loadData();
      if (user && item) {
        firebaseBackend.pushRenameItem(item.uid, newName, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handleDeleteItem = useCallback(
    async (id) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await trashItem(id);
      await loadData();
      if (user && item) {
        firebaseBackend.pushTrashItem(item.uid, true, new Date().toISOString(), user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, loadData, user],
  );

  const handleRestoreItem = useCallback(
    async (id) => {
      const item = await db.practiceItems.get(id);
      await restoreItem(id);
      await loadData();
      if (user && item) {
        firebaseBackend.pushTrashItem(item.uid, false, null, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handlePermanentDelete = useCallback(
    async (id) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await deleteItem(id);
      await loadData();
      if (user && item) {
        firebaseBackend.pushDeleteItem(item.uid, user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, loadData, user],
  );

  const handleArchiveItem = useCallback(
    async (id, archived) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await archiveItem(id, archived);
      await loadData();
      if (user && item) {
        firebaseBackend.pushArchiveItem(item.uid, archived, user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, loadData, user],
  );

  const handleSetItemCategory = useCallback(
    async (id, category) => {
      const item = await db.practiceItems.get(id);
      await setItemCategory(id, category);
      await loadData();
      if (user && item) {
        firebaseBackend.pushSetCategory(item.uid, category, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

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

  const handleReorder = useCallback(
    async (orderedEntries) => {
      // Accepts both [id, ...] (legacy) and [{ id, category }, ...] (cross-section drag)
      const normalized = orderedEntries.map(e =>
        typeof e === 'object' ? e : { id: e, category: null }
      );

      await db.transaction('rw', db.practiceItems, async () => {
        for (let i = 0; i < normalized.length; i++) {
          const update = { sortOrder: i };
          if (normalized[i].category) update.category = normalized[i].category;
          await db.practiceItems.update(normalized[i].id, update);
        }
      });
      await loadData();

      if (user) {
        const reorderedItems = await Promise.all(
          normalized.map(({ id }) => db.practiceItems.get(id))
        );
        firebaseBackend.pushReorder(reorderedItems, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  return {
    handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
    handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
    handleMergeItem, handleReorder,
  };
}
