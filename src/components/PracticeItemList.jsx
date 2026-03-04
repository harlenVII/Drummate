import { useState, useEffect, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
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
}) {
  const { t } = useLanguage();
  const [newName, setNewName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newItems = [...items];
    const [moved] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, moved);
    onReorder(newItems.map(i => i.id));
  };

  // Keyboard shortcuts (only in normal/timer mode, not edit mode)
  const handleKeyDown = useCallback((e) => {
    if (editing) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (items.length === 0) return;

    if (e.code === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => prev === null ? items.length - 1 : Math.max(0, prev - 1));
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => prev === null ? 0 : Math.min(items.length - 1, prev + 1));
    } else if (e.code === 'Space') {
      e.preventDefault();
      // If nothing is focused but something is running, stop it
      if (focusedIndex === null) {
        if (activeItemId != null) onStop();
        return;
      }
      const focusedItem = items[focusedIndex];
      if (!focusedItem) return;
      if (activeItemId === focusedItem.id) {
        onStop();
      } else {
        onStart(focusedItem.id);
      }
    }
  }, [editing, items, focusedIndex, activeItemId, onStart, onStop]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // When returning to this tab with an active item, restore focus to it
  useEffect(() => {
    if (focusedIndex === null && activeItemId != null) {
      const idx = items.findIndex((item) => item.id === activeItemId);
      if (idx !== -1) setFocusedIndex(idx);
    }
  }, [activeItemId, items, focusedIndex]);

  // Keep focusedIndex in bounds if items list changes
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= items.length) {
      setFocusedIndex(items.length > 0 ? items.length - 1 : null);
    }
  }, [items.length, focusedIndex]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddItem(name);
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
    return (
      <div className="flex flex-col gap-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableItem key={item.id} item={item}>
                <div className="flex-1 flex items-center justify-between ml-2">
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
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>

        {items.length === 0 && (
          <p className="text-center text-gray-400 py-4">
            {t('noPracticeItems')}
          </p>
        )}

        <div className="flex gap-2">
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
      </div>
    );
  }

  // --- Normal (timer) mode ---
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const isActive = activeItemId === item.id;
        const isFocused = focusedIndex !== null && index === focusedIndex;
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
      })}

      {items.length === 0 && (
        <p className="text-center text-gray-400 py-4">
          {t('noPracticeItems')}
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
