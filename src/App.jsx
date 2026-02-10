import { useState, useEffect, useCallback, useRef } from 'react';
import PracticeItemList from './components/PracticeItemList';
import {
  getItems,
  addItem,
  renameItem,
  deleteItem,
  addLog,
  getTodaysLogs,
} from './services/database';

function App() {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [editing, setEditing] = useState(false);
  const [activeItemId, setActiveItemId] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const loadData = useCallback(async () => {
    const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
    setItems(allItems);

    const totalsMap = {};
    for (const log of logs) {
      totalsMap[log.itemId] = (totalsMap[log.itemId] || 0) + log.duration;
    }
    setTotals(totalsMap);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    startTimeRef.current = null;
  }, []);

  const saveAndStop = useCallback(async () => {
    stopTimer();
    const elapsed = elapsedTime;
    const itemId = activeItemId;
    setActiveItemId(null);
    setElapsedTime(0);

    if (elapsed > 0 && itemId != null) {
      await addLog(itemId, elapsed);
      await loadData();
    }
  }, [activeItemId, elapsedTime, stopTimer, loadData]);

  const handleStart = useCallback(
    async (itemId) => {
      // If another item is running, save it first
      if (activeItemId != null) {
        stopTimer();
        if (elapsedTime > 0) {
          await addLog(activeItemId, elapsedTime);
        }
      }

      setActiveItemId(itemId);
      setElapsedTime(0);
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      if (activeItemId != null && elapsedTime > 0) {
        await loadData();
      }
    },
    [activeItemId, elapsedTime, stopTimer, loadData],
  );

  const handleStop = useCallback(async () => {
    await saveAndStop();
  }, [saveAndStop]);

  const handleAddItem = useCallback(
    async (name) => {
      await addItem(name);
      await loadData();
    },
    [loadData],
  );

  const handleRenameItem = useCallback(
    async (id, newName) => {
      await renameItem(id, newName);
      await loadData();
    },
    [loadData],
  );

  const handleDeleteItem = useCallback(
    async (id) => {
      if (activeItemId === id) {
        stopTimer();
        setActiveItemId(null);
        setElapsedTime(0);
      }
      await deleteItem(id);
      await loadData();
    },
    [activeItemId, stopTimer, loadData],
  );

  const handleSetEditing = useCallback(
    async (value) => {
      if (value && activeItemId != null) {
        await saveAndStop();
      }
      setEditing(value);
    },
    [activeItemId, saveAndStop],
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">
          Drummate
        </h1>
        <PracticeItemList
          items={items}
          totals={totals}
          activeItemId={activeItemId}
          elapsedTime={elapsedTime}
          editing={editing}
          onSetEditing={handleSetEditing}
          onStart={handleStart}
          onStop={handleStop}
          onAddItem={handleAddItem}
          onRenameItem={handleRenameItem}
          onDeleteItem={handleDeleteItem}
        />
      </div>
    </div>
  );
}

export default App;
