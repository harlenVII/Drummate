import { useState, useEffect, useCallback, useRef } from 'react';
import PracticeItemList from './components/PracticeItemList';
import DailyReport from './components/DailyReport';
import Metronome from './components/Metronome';
import TabBar from './components/TabBar';
import { useLanguage } from './contexts/LanguageContext';
import { MetronomeEngine } from './audio/metronomeEngine';
import {
  getItems,
  addItem,
  renameItem,
  deleteItem,
  addLog,
  getTodaysLogs,
  getLogsByDate,
} from './services/database';
import { getTodayString } from './utils/dateHelpers';

function App() {
  const { language, toggleLanguage, t } = useLanguage();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [editing, setEditing] = useState(false);
  const [activeItemId, setActiveItemId] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const [activeTab, setActiveTab] = useState('practice');
  const [reportDate, setReportDate] = useState(getTodayString());
  const [reportLogs, setReportLogs] = useState([]);

  // Metronome state (persists across tab changes)
  const metronomeEngineRef = useRef(null);
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeCurrentBeat, setMetronomeCurrentBeat] = useState(-1);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useState([4, 4]);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState('quarter');

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

  // Initialize metronome engine once
  useEffect(() => {
    metronomeEngineRef.current = new MetronomeEngine();
    metronomeEngineRef.current.onBeat = ({ beat, subdivisionIndex }) => {
      if (subdivisionIndex === 0) {
        setMetronomeCurrentBeat(beat);
      }
    };

    return () => {
      if (metronomeEngineRef.current) {
        metronomeEngineRef.current.destroy();
        metronomeEngineRef.current = null;
      }
    };
  }, []);

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

  const loadReportData = useCallback(async (dateString) => {
    const logs = await getLogsByDate(dateString);
    setReportLogs(logs);
  }, []);

  const handleReportDateChange = useCallback(
    async (dateString) => {
      setReportDate(dateString);
      await loadReportData(dateString);
    },
    [loadReportData],
  );

  const handleTabChange = useCallback(
    async (tab) => {
      setActiveTab(tab);
      if (tab === 'report') {
        const today = getTodayString();
        setReportDate(today);
        await loadReportData(today);
      }
    },
    [loadReportData],
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-lg mx-auto px-4 py-8 pb-24 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">
            {t('appName')}
          </h1>
          <button
            onClick={toggleLanguage}
            className="px-3 py-1 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {language === 'en' ? '中文' : 'EN'}
          </button>
        </div>

        {activeTab === 'practice' && (
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
        )}

        {activeTab === 'metronome' && (
          <Metronome
            engineRef={metronomeEngineRef}
            bpm={metronomeBpm}
            setBpm={setMetronomeBpm}
            isPlaying={metronomeIsPlaying}
            setIsPlaying={setMetronomeIsPlaying}
            currentBeat={metronomeCurrentBeat}
            setCurrentBeat={setMetronomeCurrentBeat}
            timeSignature={metronomeTimeSignature}
            setTimeSignature={setMetronomeTimeSignature}
            subdivision={metronomeSubdivision}
            setSubdivision={setMetronomeSubdivision}
          />
        )}

        {activeTab === 'report' && (
          <DailyReport
            items={items}
            reportDate={reportDate}
            reportLogs={reportLogs}
            onDateChange={handleReportDateChange}
          />
        )}
      </div>

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
