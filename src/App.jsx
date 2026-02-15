import { useState, useEffect, useCallback, useRef } from 'react';
import NoSleep from 'nosleep.js';
import PracticeItemList from './components/PracticeItemList';
import DailyReport from './components/DailyReport';
import Metronome from './components/Metronome';
import SequencerPage from './components/SequencerPage';
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
  const activeItemIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState('practice');
  const [reportDate, setReportDate] = useState(getTodayString());
  const [reportLogs, setReportLogs] = useState([]);

  // Metronome state (persists across tab changes)
  const noSleepRef = useRef(new NoSleep());
  const metronomeEngineRef = useRef(null);
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeCurrentBeat, setMetronomeCurrentBeat] = useState(-1);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useState([4, 4]);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState('quarter');
  const [metronomeSoundType, setMetronomeSoundType] = useState('click');

  // Subpage toggle within metronome tab
  const [metronomeSubpage, setMetronomeSubpage] = useState('metronome');
  // 'metronome' | 'sequencer'

  // Sequencer state (persists across tab changes)
  const [sequencerSlots, setSequencerSlots] = useState([]);
  const [sequencerPlayingSlot, setSequencerPlayingSlot] = useState(-1);
  // -1 when not playing
  const sequencerNextIdRef = useRef(1);
  // Auto-increment ID for new slots

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
    metronomeEngineRef.current.onSequenceBeat = (slotIndex) => {
      setSequencerPlayingSlot(slotIndex);
    };

    return () => {
      if (metronomeEngineRef.current) {
        metronomeEngineRef.current.destroy();
        metronomeEngineRef.current = null;
      }
    };
  }, []);

  // Keep ref in sync so pagehide/beforeunload always read latest value
  useEffect(() => {
    activeItemIdRef.current = activeItemId;
  }, [activeItemId]);

  // Recover any unsaved practice session from a previous page close
  useEffect(() => {
    const pending = localStorage.getItem('drummate_pending_log');
    if (pending) {
      localStorage.removeItem('drummate_pending_log');
      try {
        const { itemId, duration, date } = JSON.parse(pending);
        if (itemId != null && duration > 0) {
          addLog(itemId, duration, date).then(() => loadData());
        }
      } catch {
        // ignore malformed data
      }
    }
  }, [loadData]);

  // Save ongoing practice session when page is closed/refreshed
  useEffect(() => {
    const saveSession = () => {
      const itemId = activeItemIdRef.current;
      const start = startTimeRef.current;
      if (itemId != null && start != null) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        if (elapsed > 0) {
          clearInterval(intervalRef.current);
          // Synchronous localStorage write survives iOS page kill
          localStorage.setItem(
            'drummate_pending_log',
            JSON.stringify({ itemId, duration: elapsed, date: getTodayString() }),
          );
        }
      }
    };

    // For desktop browsers (close/refresh)
    window.addEventListener('beforeunload', saveSession);

    // For iOS Safari (more reliable than beforeunload)
    window.addEventListener('pagehide', saveSession);

    return () => {
      window.removeEventListener('beforeunload', saveSession);
      window.removeEventListener('pagehide', saveSession);
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

  const handleSubpageChange = useCallback(
    (subpage) => {
      if (metronomeIsPlaying) {
        metronomeEngineRef.current.stop();
        metronomeEngineRef.current.setSequence(null);
        setMetronomeIsPlaying(false);
        setMetronomeCurrentBeat(-1);
        setSequencerPlayingSlot(-1);
        noSleepRef.current.disable();
      }
      setMetronomeSubpage(subpage);
    },
    [metronomeIsPlaying],
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-100 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
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
            <>
              {/* Subpage toggle */}
              <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
                <button
                  onClick={() => handleSubpageChange('metronome')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'metronome'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t('metronome')}
                </button>
                <button
                  onClick={() => handleSubpageChange('sequencer')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'sequencer'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t('sequencer')}
                </button>
              </div>

              {metronomeSubpage === 'metronome' ? (
                <Metronome
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
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
                  soundType={metronomeSoundType}
                  setSoundType={setMetronomeSoundType}
                />
              ) : (
                <SequencerPage
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  bpm={metronomeBpm}
                  setBpm={setMetronomeBpm}
                  isPlaying={metronomeIsPlaying}
                  setIsPlaying={setMetronomeIsPlaying}
                  soundType={metronomeSoundType}
                  setSoundType={setMetronomeSoundType}
                  slots={sequencerSlots}
                  setSlots={setSequencerSlots}
                  playingSlot={sequencerPlayingSlot}
                  setPlayingSlot={setSequencerPlayingSlot}
                  nextIdRef={sequencerNextIdRef}
                />
              )}
            </>
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
      </div>

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
