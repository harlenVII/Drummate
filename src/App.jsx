import { useState, useEffect, useCallback, useRef } from 'react';
import NoSleep from 'nosleep.js';
import PracticeItemList from './components/PracticeItemList';
import DailyReport from './components/DailyReport';
import Metronome from './components/Metronome';
import SequencerPage from './components/SequencerPage';
import TabBar from './components/TabBar';
import SettingsPanel from './components/SettingsPanel';
import { useLanguage } from './contexts/LanguageContext';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import { MetronomeEngine } from './audio/metronomeEngine';

import {
  db,
  getItems,
  addItem,
  renameItem,
  deleteItem,
  addLog,
  getTodaysLogs,
  getLogsByDate,
} from './services/database';
import { pushItem, pushLog, pushDeleteItem, pushRenameItem, pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges } from './services/sync';
import { getTodayString } from './utils/dateHelpers';

function App() {
  const { language, toggleLanguage, t } = useLanguage();
  const { user, loading, authReady, signOut } = useAuth();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [editing, setEditing] = useState(false);
  const [activeItemId, setActiveItemId] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const activeItemIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState('practice');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportDate, setReportDate] = useState(getTodayString());
  const [reportLogs, setReportLogs] = useState([]);

  // Metronome state (persists across tab changes and page reloads)
  const noSleepRef = useRef(new NoSleep());
  const metronomeEngineRef = useRef(null);
  const [metronomeBpm, setMetronomeBpm] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_metronome_bpm');
      const bpm = saved ? Number(saved) : 120;
      return bpm >= 30 && bpm <= 300 ? bpm : 120;
    } catch {
      return 120;
    }
  });
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeCurrentBeat, setMetronomeCurrentBeat] = useState(-1);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_metronome_time_signature');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2 &&
            typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
          return parsed;
        }
      }
      return [4, 4];
    } catch {
      return [4, 4];
    }
  });
  const [metronomeSubdivision, setMetronomeSubdivision] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_metronome_subdivision');
      const validSubdivisions = ['quarter', 'eighth', 'triplet', 'sixteenth',
                                  'eighthTwoSixteenths', 'twoSixteenthsEighth',
                                  'sixteenthEighthSixteenth', 'quintuplet', 'sextuplet'];
      return saved && validSubdivisions.includes(saved) ? saved : 'quarter';
    } catch {
      return 'quarter';
    }
  });
  const [metronomeSoundType, setMetronomeSoundType] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_metronome_sound_type');
      const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
      return saved && validTypes.includes(saved) ? saved : 'click';
    } catch {
      return 'click';
    }
  });

  // Subpage toggle within metronome tab
  const [metronomeSubpage, setMetronomeSubpage] = useState('metronome');
  // 'metronome' | 'sequencer'

  // Sequencer state (persists across tab changes and page reloads)
  const [sequencerBpm, setSequencerBpm] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_sequencer_bpm');
      const bpm = saved ? Number(saved) : 120;
      return bpm >= 30 && bpm <= 300 ? bpm : 120;
    } catch {
      return 120;
    }
  });
  const [sequencerSoundType, setSequencerSoundType] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_sequencer_sound_type');
      const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
      return saved && validTypes.includes(saved) ? saved : 'click';
    } catch {
      return 'click';
    }
  });
  const [sequencerSlots, setSequencerSlots] = useState(() => {
    try {
      const saved = localStorage.getItem('drummate_sequencer_slots');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [sequencerPlayingSlot, setSequencerPlayingSlot] = useState(-1);

  // Wake word (hands-free mode) state
  const wakeWordEngineRef = useRef(null);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [wakeWordLoading, setWakeWordLoading] = useState(false);
  const [wakeWordReady, setWakeWordReady] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [wakeWordError, setWakeWordError] = useState(null);
  const sequencerNextIdRef = useRef(null);
  if (sequencerNextIdRef.current === null) {
    try {
      const saved = localStorage.getItem('drummate_sequencer_next_id');
      sequencerNextIdRef.current = saved ? Number(saved) : 1;
    } catch {
      sequencerNextIdRef.current = 1;
    }
  }

  // Persist metronome settings to localStorage
  useEffect(() => {
    localStorage.setItem('drummate_metronome_bpm', String(metronomeBpm));
  }, [metronomeBpm]);

  useEffect(() => {
    localStorage.setItem('drummate_metronome_sound_type', metronomeSoundType);
  }, [metronomeSoundType]);

  useEffect(() => {
    localStorage.setItem('drummate_metronome_time_signature', JSON.stringify(metronomeTimeSignature));
  }, [metronomeTimeSignature]);

  useEffect(() => {
    localStorage.setItem('drummate_metronome_subdivision', metronomeSubdivision);
  }, [metronomeSubdivision]);

  // Persist sequencer settings to localStorage
  useEffect(() => {
    localStorage.setItem('drummate_sequencer_bpm', String(sequencerBpm));
  }, [sequencerBpm]);

  useEffect(() => {
    localStorage.setItem('drummate_sequencer_sound_type', sequencerSoundType);
  }, [sequencerSoundType]);

  useEffect(() => {
    localStorage.setItem('drummate_sequencer_slots', JSON.stringify(sequencerSlots));
    localStorage.setItem('drummate_sequencer_next_id', String(sequencerNextIdRef.current));
  }, [sequencerSlots]);

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

  // Sync with PocketBase on sign-in (wait for token refresh to complete)
  useEffect(() => {
    if (!user || !authReady) return;

    let unsubscribe = null;
    let cancelled = false;

    const init = async () => {
      try {
        await flushSyncQueue(user.id);
        await pushAllLocal(user.id);
        await pullAll(user.id);
        await loadData();
      } catch (err) {
        console.error('Sync init failed:', err);
      }
      // Subscribe to real-time changes only after initial sync completes
      if (!cancelled) {
        unsubscribe = subscribeToChanges(loadData);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, authReady, loadData]);

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

    if (itemId != null) {
      await db.practiceItems.update(itemId, {
        metronomeSettings: { bpm: metronomeBpm, timeSignature: metronomeTimeSignature, subdivision: metronomeSubdivision, soundType: metronomeSoundType },
      });
    }

    if (elapsed > 0 && itemId != null) {
      const logId = await addLog(itemId, elapsed);
      await loadData();
      setActiveItemId(null);
      setElapsedTime(0);
      if (user) {
        const log = await db.practiceLogs.get(logId);
        pushLog(log, user.id).catch(console.error);
      }
    } else {
      setActiveItemId(null);
      setElapsedTime(0);
    }
  }, [activeItemId, elapsedTime, stopTimer, loadData, user, metronomeBpm, metronomeTimeSignature, metronomeSubdivision, metronomeSoundType]);

  const handleStart = useCallback(
    async (itemId) => {
      // If another item is running, save it first (including its metronome settings)
      if (activeItemId != null) {
        stopTimer();
        await db.practiceItems.update(activeItemId, {
          metronomeSettings: { bpm: metronomeBpm, timeSignature: metronomeTimeSignature, subdivision: metronomeSubdivision, soundType: metronomeSoundType },
        });
        if (elapsedTime > 0) {
          const logId = await addLog(activeItemId, elapsedTime);
          if (user) {
            const log = await db.practiceLogs.get(logId);
            pushLog(log, user.id).catch(console.error);
          }
        }
      }

      // Load metronome settings saved for this item
      const item = await db.practiceItems.get(itemId);
      if (item?.metronomeSettings) {
        const { bpm, timeSignature, subdivision, soundType } = item.metronomeSettings;
        if (bpm != null) setMetronomeBpm(bpm);
        if (timeSignature != null) setMetronomeTimeSignature(timeSignature);
        if (subdivision != null) setMetronomeSubdivision(subdivision);
        if (soundType != null) setMetronomeSoundType(soundType);
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
    [activeItemId, elapsedTime, stopTimer, loadData, user, metronomeBpm, metronomeTimeSignature, metronomeSubdivision, metronomeSoundType],
  );

  const handleStop = useCallback(async () => {
    await saveAndStop();
  }, [saveAndStop]);

  const handleAddItem = useCallback(
    async (name) => {
      const duplicate = items.some(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        alert(t('duplicateItem'));
        return;
      }
      const localId = await addItem(name);
      await loadData();
      if (user) {
        const item = await db.practiceItems.get(localId);
        pushItem(item, user.id).catch(console.error);
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
        pushRenameItem(item.name, newName, user.id).catch(console.error);
      }
    },
    [loadData, user],
  );

  const handleDeleteItem = useCallback(
    async (id) => {
      if (activeItemId === id) {
        stopTimer();
        setActiveItemId(null);
        setElapsedTime(0);
      }
      const item = await db.practiceItems.get(id);
      await deleteItem(id);
      await loadData();
      if (user && item) {
        pushDeleteItem(item.name, user.id).catch(console.error);
      }
    },
    [activeItemId, stopTimer, loadData, user],
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

  // Wake word toggle handler
  const handleToggleHandsFree = useCallback(async () => {
    if (handsFreeMode) {
      // Turning off
      if (wakeWordEngineRef.current) {
        await wakeWordEngineRef.current.stop();
      }
      setHandsFreeMode(false);
      setWakeWordDetected(false);
      setWakeWordError(null);
      return;
    }

    // Turning on
    setWakeWordError(null);
    try {
      if (!wakeWordEngineRef.current) {
        const { createWakeWordEngine } = await import('./audio/wakeWordEngine');
        wakeWordEngineRef.current = createWakeWordEngine();
      }

      if (!wakeWordEngineRef.current.isLoaded) {
        setWakeWordLoading(true);
        await wakeWordEngineRef.current.load();
        setWakeWordReady(true);
        setWakeWordLoading(false);
      }

      wakeWordEngineRef.current.onDetected(({ keyword, score }) => {
        setWakeWordDetected(true);
        // Clear detected state after 2 seconds
        setTimeout(() => setWakeWordDetected(false), 2000);
        // TODO: Phase 2 — trigger STT pipeline here
        console.log(`Wake word "${keyword}" detected (score: ${score.toFixed(3)})`);
      });

      wakeWordEngineRef.current.onError((err) => {
        console.error('Wake word error:', err);
        setWakeWordError(err.message || 'Unknown error');
      });

      await wakeWordEngineRef.current.start();
      setHandsFreeMode(true);
    } catch (err) {
      setWakeWordLoading(false);
      if (err.name === 'NotAllowedError') {
        setWakeWordError('mic_permission');
      } else {
        setWakeWordError(err.message || 'Failed to start');
      }
      console.error('Failed to start hands-free mode:', err);
    }
  }, [handsFreeMode]);

  // Clean up wake word engine on unmount
  useEffect(() => {
    return () => {
      if (wakeWordEngineRef.current) {
        wakeWordEngineRef.current.destroy();
        wakeWordEngineRef.current = null;
      }
    };
  }, []);

  // Global tab-switching shortcuts: 1 = Practice, 2 = Metronome, 3 = Report
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Digit1') handleTabChange('practice');
      else if (e.code === 'Digit2') handleTabChange('metronome');
      else if (e.code === 'Digit3') handleTabChange('report');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabChange]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-lg">{t('auth.syncing')}</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-100 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">
              {t('appName')}
            </h1>
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold hover:bg-blue-700 transition-colors shrink-0"
              aria-label="Open settings"
            >
              {(user?.name || user?.email || '?')[0].toUpperCase()}
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
                  bpm={sequencerBpm}
                  setBpm={setSequencerBpm}
                  isPlaying={metronomeIsPlaying}
                  setIsPlaying={setMetronomeIsPlaying}
                  soundType={sequencerSoundType}
                  setSoundType={setSequencerSoundType}
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

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        signOut={signOut}
        language={language}
        toggleLanguage={toggleLanguage}
        user={user}
        handsFreeMode={handsFreeMode}
        onToggleHandsFree={handleToggleHandsFree}
        wakeWordLoading={wakeWordLoading}
        wakeWordDetected={wakeWordDetected}
        wakeWordError={wakeWordError}
      />

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
