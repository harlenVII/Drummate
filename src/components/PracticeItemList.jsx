import { useState } from 'react';
import { formatTime } from '../utils/formatTime';
import { useLanguage } from '../contexts/LanguageContext';

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
}) {
  const { t } = useLanguage();
  const [newName, setNewName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');

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
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between"
          >
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
        ))}

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
      {items.map((item) => {
        const isActive = activeItemId === item.id;
        const savedTotal = totals[item.id] || 0;
        const displayTime = isActive ? savedTotal + elapsedTime : savedTotal;

        return (
          <div
            key={item.id}
            className={`bg-white rounded-lg shadow-sm p-4 flex items-center justify-between transition-colors ${
              isActive ? 'ring-2 ring-blue-500' : ''
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
