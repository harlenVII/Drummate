export function formatPendingAction(entry, t) {
  const { action, payload = {} } = entry;
  switch (action) {
    case 'create_item':
      return payload.name
        ? t('offline.action.createItem', { name: payload.name })
        : t('offline.action.createItem', { name: payload.displayName ?? '' });

    case 'create_log': {
      const minutes = Math.round((payload.duration ?? 0) / 60);
      return t('offline.action.createLog', {
        duration: minutes,
        name: payload.itemName ?? '',
        date: payload.date ?? '',
      });
    }

    case 'rename_item': {
      const { previousName, newName } = payload;
      if (!newName) return t('offline.action.renameItemGeneric');
      if (previousName && previousName !== newName) {
        return t('offline.action.renameItem', { from: previousName, to: newName });
      }
      return t('offline.action.renameItemTo', { to: newName });
    }

    case 'delete_item':
      return payload.displayName
        ? t('offline.action.deleteItem', { name: payload.displayName })
        : t('offline.action.deleteItemGeneric');

    case 'reorder':
      return t('offline.action.reorder', { count: (payload.items ?? []).length });

    case 'archive_item':
      if (!payload.displayName) return t('offline.action.archiveGeneric');
      return payload.archived
        ? t('offline.action.archive', { name: payload.displayName })
        : t('offline.action.unarchive', { name: payload.displayName });

    case 'trash_item':
      if (!payload.displayName) return t('offline.action.trashGeneric');
      return payload.trashed
        ? t('offline.action.trash', { name: payload.displayName })
        : t('offline.action.restore', { name: payload.displayName });

    case 'set_category': {
      if (!payload.displayName) return t('offline.action.setCategoryGeneric');
      const categoryKey =
        payload.category === 'songs'
          ? 'offline.action.categorySongs'
          : 'offline.action.categoryFundamentals';
      return t('offline.action.setCategory', {
        name: payload.displayName,
        category: t(categoryKey),
      });
    }

    case 'merge_items': {
      const from = payload.previousName;
      const to = payload.targetName;
      if (from && to) {
        return t('offline.action.merge', { from, to });
      }
      return t('offline.action.mergeGeneric');
    }

    case 'push_note':
      if (payload.itemName) {
        return t('offline.action.pushNote', {
          name: payload.itemName,
          date: payload.date ?? '',
        });
      }
      return t('offline.action.pushNoteGeneric');

    case 'delete_note':
      return t('offline.action.deleteNote');

    case 'push_practice':
      return payload.name
        ? t('offline.action.pushPractice', { name: payload.name })
        : t('offline.action.pushPracticeGeneric');

    case 'delete_practice':
      return t('offline.action.deletePractice');

    case 'reorder_practices':
      return t('offline.action.reorderPractices', {
        count: (payload.practices ?? []).length,
      });

    default:
      return action;
  }
}
