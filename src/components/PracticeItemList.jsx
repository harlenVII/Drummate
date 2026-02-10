import { useState } from 'react';

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

function PracticeItemList({
  items,
  totals,
  activeItemId,
  elapsedTime,
  onStart,
  onStop,
  onAddItem,
  onDeleteItem,
}) {
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddItem(name);
    setNewName('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

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
            <div className="flex items-center gap-2">
              {isActive ? (
                <button
                  onClick={onStop}
                  className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => onStart(item.id)}
                  className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Start
                </button>
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
          </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-center text-gray-400 py-4">
          No practice items yet. Add one below!
        </p>
      )}

      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="New practice item..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

export default PracticeItemList;
