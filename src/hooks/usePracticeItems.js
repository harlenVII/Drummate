import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
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

export function usePracticeItems({ items, activeItemId, clearActiveTimer }) {
  const { user } = useAuth();
  const backend = useBackend();
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
      if (user) {
        backend.pushItem(newItem, user.id).catch(console.error);
      }
    },
    [items, user, t, backend],
  );

  const handleRenameItem = useCallback(
    async (id, newName) => {
      const item = await db.practiceItems.get(id);
      await renameItem(id, newName);
      if (user && item) {
        backend.pushRenameItem(item.uid, newName, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  const handleDeleteItem = useCallback(
    async (id) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await trashItem(id);
      if (user && item) {
        backend.pushTrashItem(item.uid, true, new Date().toISOString(), user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, user, backend],
  );

  const handleRestoreItem = useCallback(
    async (id) => {
      const item = await db.practiceItems.get(id);
      await restoreItem(id);
      if (user && item) {
        backend.pushTrashItem(item.uid, false, null, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  const handlePermanentDelete = useCallback(
    async (id) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await deleteItem(id);
      if (user && item) {
        backend.pushDeleteItem(item.uid, user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, user, backend],
  );

  const handleArchiveItem = useCallback(
    async (id, archived) => {
      clearActiveTimer(id);
      const item = await db.practiceItems.get(id);
      await archiveItem(id, archived);
      if (user && item) {
        backend.pushArchiveItem(item.uid, archived, user.id).catch(console.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, clearActiveTimer, user, backend],
  );

  const handleSetItemCategory = useCallback(
    async (id, category) => {
      const item = await db.practiceItems.get(id);
      await setItemCategory(id, category);
      if (user && item) {
        backend.pushSetCategory(item.uid, category, user.id).catch(console.error);
      }
    },
    [user, backend],
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
      if (user && result) {
        backend
          .mergeItems(result.sourceUid, result.targetUid, result.targetName, user.id)
          .catch(console.error);
      }
    },
    [user, backend],
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

      if (user) {
        const reorderedItems = await Promise.all(
          normalized.map(({ id }) => db.practiceItems.get(id))
        );
        backend.pushReorder(reorderedItems, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  return {
    handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
    handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
    handleMergeItem, handleReorder,
  };
}
