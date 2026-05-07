import { useState, useEffect, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { formatTime } from '../utils/formatTime';
import { useLanguage } from '../contexts/LanguageContext';

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="p-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    </button>
  );
}

function SortableItem({ item, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="bg-white rounded-lg shadow-sm p-4 flex items-center">
        <DragHandle listeners={listeners} attributes={attributes} />
        {children}
      </div>
    </div>
  );
}

function CategoryToggle({ value, onChange, ariaLabel }) {
  const { t } = useLanguage();
  return (
    <div role="group" aria-label={ariaLabel || t('selectCategory')} className="inline-flex rounded-md overflow-hidden border border-gray-300">
      <button
        type="button"
        onClick={() => onChange('fundamentals')}
        title={t('categories.fundamentals')}
        aria-pressed={value === 'fundamentals'}
        className={`px-2 py-1 text-xs font-semibold ${
          value === 'fundamentals' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
        }`}
      >
        {t('categories.fundamentalsShort')}
      </button>
      <button
        type="button"
        onClick={() => onChange('songs')}
        title={t('categories.songs')}
        aria-pressed={value === 'songs'}
        className={`px-2 py-1 text-xs font-semibold border-l border-gray-300 ${
          value === 'songs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
        }`}
      >
        {t('categories.songsShort')}
      </button>
    </div>
  );
}

function EmptyDropZone({ id, label }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`text-sm italic px-3 py-4 rounded-lg border border-dashed transition-colors ${
        isOver ? 'bg-blue-50 border-blue-400 text-blue-600' : 'bg-white border-gray-300 text-gray-400'
      }`}
    >
      {label}
    </div>
  );
}

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
}) {
  const { t } = useLanguage();
  const [newName, setNewName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTrashed, setShowTrashed] = useState(false);
  const [showArchivedNormal, setShowArchivedNormal] = useState(false);
  const [now] = useState(Date.now);
  const [addCategory, setAddCategory] = useState('fundamentals');

  const activeItems = items.filter(item => !item.archived && !item.trashed);
  const archivedItems = items.filter(item => item.archived && !item.trashed);
  const trashedItems = items.filter(item => item.trashed);
  const hasArchivedItems = archivedItems.length > 0;
  const hasTrashedItems = trashedItems.length > 0;
  const displayItems = editing
    ? (showArchived ? items.filter(i => !i.trashed) : activeItems)
    : activeItems;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeItem = displayItems.find(i => i.id === active.id);
    if (!activeItem) return;

    const isEmptyZone = typeof over.id === 'string' && over.id.startsWith('category-');
    const targetCategory = isEmptyZone
      ? (over.id === 'category-fundamentals' ? 'fundamentals' : 'songs')
      : displayItems.find(i => i.id === over.id)?.category;
    if (!targetCategory) return;

    if (!isEmptyZone && active.id === over.id) return;

    const isSameCategory = !isEmptyZone && activeItem.category === targetCategory;

    let fundamentals = displayItems.filter(i => i.category === 'fundamentals');
    let songs = displayItems.filter(i => i.category === 'songs');

    if (isSameCategory) {
      // Use arrayMove to correctly handle all positions including last
      const list = targetCategory === 'fundamentals' ? fundamentals : songs;
      const oldIndex = list.findIndex(i => i.id === active.id);
      const newIndex = list.findIndex(i => i.id === over.id);
      const reordered = arrayMove(list, oldIndex, newIndex);
      if (targetCategory === 'fundamentals') {
        fundamentals = reordered;
      } else {
        songs = reordered;
      }
    } else {
      // Cross-category: remove from source list, insert at target position
      fundamentals = displayItems.filter(i => i.category === 'fundamentals' && i.id !== active.id);
      songs = displayItems.filter(i => i.category === 'songs' && i.id !== active.id);

      const movedItem = { ...activeItem, category: targetCategory };
      const targetList = targetCategory === 'fundamentals' ? fundamentals : songs;

      if (isEmptyZone) {
        targetList.push(movedItem);
      } else {
        const dropIndex = targetList.findIndex(i => i.id === over.id);
        targetList.splice(dropIndex === -1 ? targetList.length : dropIndex, 0, movedItem);
      }
    }

    const ordered = [...fundamentals, ...songs];
    onReorder(ordered.map(i => ({ id: i.id, category: i.category })));
  };

  // Keyboard shortcuts (only in normal/timer mode, not edit mode)
  const handleKeyDown = useCallback((e) => {
    if (editing) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const orderedActive = [
      ...activeItems.filter(i => i.category === 'fundamentals'),
      ...activeItems.filter(i => i.category === 'songs'),
    ];
    if (orderedActive.length === 0) return;

    if (e.code === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => prev === null ? orderedActive.length - 1 : Math.max(0, prev - 1));
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => prev === null ? 0 : Math.min(orderedActive.length - 1, prev + 1));
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (focusedIndex === null) {
        if (activeItemId != null) onStop();
        return;
      }
      const focusedItem = orderedActive[focusedIndex];
      if (!focusedItem) return;
      if (activeItemId === focusedItem.id) {
        onStop();
      } else {
        onStart(focusedItem.id);
      }
    }
  }, [editing, activeItems, focusedIndex, activeItemId, onStart, onStop]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // When returning to this tab with an active item, restore focus to it
  useEffect(() => {
    if (focusedIndex === null && activeItemId != null) {
      const orderedActive = [
        ...activeItems.filter(i => i.category === 'fundamentals'),
        ...activeItems.filter(i => i.category === 'songs'),
      ];
      const idx = orderedActive.findIndex((item) => item.id === activeItemId);
      if (idx !== -1) setFocusedIndex(idx);
    }
  }, [activeItemId, activeItems, focusedIndex]);

  // Keep focusedIndex in bounds if items list changes
  useEffect(() => {
    const orderedActive = [
      ...activeItems.filter(i => i.category === 'fundamentals'),
      ...activeItems.filter(i => i.category === 'songs'),
    ];
    if (focusedIndex !== null && focusedIndex >= orderedActive.length) {
      setFocusedIndex(orderedActive.length > 0 ? orderedActive.length - 1 : null);
    }
  }, [activeItems, focusedIndex]);

  useEffect(() => {
    if (editing) setAddCategory('fundamentals');
  }, [editing]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddItem(name, addCategory);
    setNewName('');
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const startRename = (item) => {
    setEditingItemId(item.id);
    setEditingName(item.name);
  };

  const commitRename = () => {
    const name = editingName.trim();
    if (name && editingItemId != null) {
      onRenameItem(editingItemId, name);
    }
    setEditingItemId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      setEditingItemId(null);
      setEditingName('');
    }
  };

  // --- Edit mode ---
  if (editing) {
    const editFundamentals = displayItems.filter(i => i.category === 'fundamentals');
    const editSongs = displayItems.filter(i => i.category === 'songs');

    const renderEditRow = (item) => (
      <SortableItem key={item.id} item={item}>
        <div className={`flex-1 flex items-center justify-between ml-2 ${item.archived ? 'opacity-50' : ''}`}>
          {editingItemId === item.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              autoFocus
              className="flex-1 mr-3 px-3 py-1 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <span
              onClick={() => startRename(item)}
              className="font-medium text-gray-800 cursor-pointer hover:text-blue-600 transition-colors"
              title="Click to rename"
            >
              {item.name}
            </span>
          )}
          <div className="flex items-center gap-1">
            <CategoryToggle
              value={item.category}
              onChange={(c) => onSetItemCategory(item.id, c)}
              ariaLabel={`${t('selectCategory')}: ${item.name}`}
            />
            <button
              onClick={() => onArchiveItem(item.id, !item.archived)}
              className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
              title={item.archived ? t('unarchive') : t('archive')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4zM2 9a1 1 0 000 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a1 1 0 100-2H2zm5 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" />
              </svg>
            </button>
            <button
              onClick={() => onDeleteItem(item.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete item"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </SortableItem>
    );

    return (
      <div className="flex flex-col gap-3">
        {hasArchivedItems && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="self-start px-3 py-1 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {showArchived ? t('hideArchived') : `${t('showArchived')} (${archivedItems.length})`}
          </button>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
              {t('categories.fundamentals')}
            </h3>
            <SortableContext items={editFundamentals.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {editFundamentals.length === 0 ? (
                <EmptyDropZone id="category-fundamentals" label={t('noFundamentalsYet')} />
              ) : (
                editFundamentals.map(item => renderEditRow(item))
              )}
            </SortableContext>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
              {t('categories.songs')}
            </h3>
            <SortableContext items={editSongs.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {editSongs.length === 0 ? (
                <EmptyDropZone id="category-songs" label={t('noSongsYet')} />
              ) : (
                editSongs.map(item => renderEditRow(item))
              )}
            </SortableContext>
          </div>
        </DndContext>

        <div className="flex gap-2 items-center">
          <CategoryToggle value={addCategory} onChange={setAddCategory} />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder={t('newItemPlaceholder')}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + {t('add')}
          </button>
        </div>

        <button
          onClick={() => onSetEditing(false)}
          className="mt-1 px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          {t('done')}
        </button>

        {hasTrashedItems && (
          <div className="mt-4">
            <button
              onClick={() => setShowTrashed(!showTrashed)}
              className="self-start px-3 py-1 text-sm text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
            >
              {showTrashed ? t('hideTrash') : `${t('showTrash')} (${trashedItems.length})`}
            </button>

            {showTrashed && (
              <div className="flex flex-col gap-2 mt-3">
                {trashedItems.map((item) => {
                  const daysLeft = item.trashedAt
                    ? Math.max(0, 30 - Math.floor((now - new Date(item.trashedAt).getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;
                  return (
                    <div key={item.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center opacity-50">
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-800">{item.name}</span>
                          <span className="text-xs text-red-400">
                            {t('daysLeft', { days: daysLeft })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onRestoreItem(item.id)}
                            className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                            title={t('restore')}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0zm0-6a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(t('confirmPermanentDelete'))) {
                                onPermanentDelete(item.id);
                              }
                            }}
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
      </div>
    );
  }

  // --- Normal (timer) mode ---
  const fundamentalsItems = activeItems.filter(i => i.category === 'fundamentals');
  const songsItems = activeItems.filter(i => i.category === 'songs');

  const renderRow = (item, indexInActive) => {
    const isActive = activeItemId === item.id;
    const isFocused = focusedIndex !== null && indexInActive === focusedIndex;
    const savedTotal = totals[item.id] || 0;
    const displayTime = isActive ? savedTotal + elapsedTime : savedTotal;
    return (
      <div
        key={item.id}
        className={`bg-white rounded-lg shadow-sm p-4 flex items-center justify-between transition-colors ${
          isActive ? 'ring-2 ring-blue-500' : isFocused ? 'ring-2 ring-gray-300' : ''
        }`}
      >
        <div className="flex flex-col">
          <span className="font-medium text-gray-800">{item.name}</span>
          <span className="font-mono text-lg text-gray-600">
            {formatTime(displayTime)}
          </span>
        </div>
        {isActive ? (
          <button
            onClick={onStop}
            className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
          >
            {t('stop')}
          </button>
        ) : (
          <button
            onClick={() => onStart(item.id)}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            {t('start')}
          </button>
        )}
      </div>
    );
  };

  // Compute display index for keyboard focus (fundamentals first, then songs)
  const orderedActive = [...fundamentalsItems, ...songsItems];
  const indexOf = (id) => orderedActive.findIndex(i => i.id === id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
          {t('categories.fundamentals')}
        </h3>
        {fundamentalsItems.length === 0 && activeItems.length > 0 ? (
          <p className="text-sm text-gray-400 italic px-1">{t('noFundamentalsYet')}</p>
        ) : (
          fundamentalsItems.map(item => renderRow(item, indexOf(item.id)))
        )}
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
          {t('categories.songs')}
        </h3>
        {songsItems.length === 0 && activeItems.length > 0 ? (
          <p className="text-sm text-gray-400 italic px-1">{t('noSongsYet')}</p>
        ) : (
          songsItems.map(item => renderRow(item, indexOf(item.id)))
        )}
      </div>

      {hasArchivedItems && (
        <div className="mt-2">
          <button
            onClick={() => setShowArchivedNormal(!showArchivedNormal)}
            className="w-full text-left px-1 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"
            aria-expanded={showArchivedNormal}
          >
            <span className="text-xs" aria-hidden="true">{showArchivedNormal ? '▾' : '▸'}</span>
            {t('categories.archived')} ({archivedItems.length})
          </button>
          {showArchivedNormal && (
            <div className="flex flex-col gap-2 mt-1">
              {archivedItems.map(item => {
                const savedTotal = totals[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between opacity-50"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{item.name}</span>
                      <span className="font-mono text-lg text-gray-600">
                        {formatTime(savedTotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeItems.length === 0 && (
        <p className="text-center text-gray-400 py-4">
          {t('addFirstItem')}
        </p>
      )}

      <button
        onClick={() => onSetEditing(true)}
        className="mt-1 px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
      >
        {t('edit')}
      </button>
    </div>
  );
}

export default PracticeItemList;
