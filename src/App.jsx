import { useState, useEffect, useCallback, useRef } from 'react';
import { useMetronomeState } from './hooks/useMetronomeState';
import PracticeItemList from './components/PracticeItemList';
import DailyReport from './components/DailyReport';
import WeeklyReport from './components/WeeklyReport';
import MonthlyReport from './components/MonthlyReport';
import YearlyReport from './components/YearlyReport';
import StatsReport from './components/StatsReport';
import Metronome from './components/Metronome';
import SequencerPage from './components/SequencerPage';
import PracticePage from './components/PracticePage';
import MultiMeterPage from './components/MultiMeterPage';
import TabBar from './components/TabBar';
import SettingsPanel from './components/SettingsPanel';
import { useLanguage } from './contexts/LanguageContext';
import { useAuth } from './contexts/AuthContext';
import firebaseBackend from './services/backends/firebaseBackend';
import AuthScreen from './components/AuthScreen';
import FloatingVoiceIndicator from './components/FloatingVoiceIndicator';
import FloatingPracticeWidget from './components/FloatingPracticeWidget';
import EncouragementButton from './components/EncouragementButton';
import EncouragementModal from './components/EncouragementModal';
import EditTimeModal from './components/EditTimeModal';
import NotesPage from './components/NotesPage';
import GoalsPage from './components/GoalsPage';
import { getOfflineMode, setOfflineMode as setOfflineServiceMode } from './services/offlineService';
import { useUiPreferences } from './hooks/useUiPreferences';
import { useAppData } from './hooks/useAppData';
import { usePracticeTimer } from './hooks/usePracticeTimer';
import { usePracticeItems } from './hooks/usePracticeItems';
import { useMetronomePractices } from './hooks/useMetronomePractices';
import { useReports } from './hooks/useReports';
import { useNavigation } from './hooks/useNavigation';
import { useTts } from './hooks/useTts';
import { useLlmEncouragement } from './hooks/useLlmEncouragement';
import OfflineBanner from './components/OfflineBanner';
import PendingChangesModal from './components/PendingChangesModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { createSttService } from './services/sttService';
import { parseIntent, findBestItemMatch } from './services/intentParser';

import {
  db,
  insertGoalRecord,
  archiveGoal,
  getGoalByUid,
} from './services/database';
import { shouldMigrateLegacy, buildMigratedGoal, selectExpiredForArchive } from './utils/goalStatus';
import { initTimezone } from './services/timezoneService';
import { initPriorHours } from './services/priorPracticeService';
import { getTodayString, shiftDate, getWeekStart, getMonthStart, getYearStart } from './utils/dateHelpers';
import { getItem, setItem, removeItem } from './utils/safeStorage';

function App() {
  const { language, toggleLanguage, t } = useLanguage();
  const { user, authReady, signOut, isVisitor } = useAuth();
  const languageRef = useRef(language);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    timeUnit, setTimeUnit,
    groupByCategory, setGroupByCategory,
    compactMode, setCompactMode,
    theme, setTheme,
  } = useUiPreferences();
  const {
    items, setItems, totals, setTotals,
    metronomePractices, setMetronomePractices,
    notes, setNotes, goalRefreshKey, loadData, refreshNotes,
  } = useAppData();
  const metronome = useMetronomeState();
  const {
    engineRef: metronomeEngineRef,
    noSleepRef,
    bpm: metronomeBpm, setBpm: setMetronomeBpm,
    isPlaying: metronomeIsPlaying, setIsPlaying: setMetronomeIsPlaying,
    currentBeat: metronomeCurrentBeat, setCurrentBeat: setMetronomeCurrentBeat,
    timeSignature: metronomeTimeSignature, setTimeSignature: setMetronomeTimeSignature,
    subdivision: metronomeSubdivision, setSubdivision: setMetronomeSubdivision,
    soundType: metronomeSoundType, setSoundType: setMetronomeSoundType,
    accentFirstBeat: metronomeAccentFirstBeat, setAccentFirstBeat: setMetronomeAccentFirstBeat,
    sequencerBpm, setSequencerBpm, sequencerSoundType, setSequencerSoundType,
    sequencerSlots, setSequencerSlots, sequencerPlayingSlot, setSequencerPlayingSlot,
    sequencerNextIdRef,
    multiMeterBpm, setMultiMeterBpm, multiMeterSoundType, setMultiMeterSoundType,
    multiMeterSlots, setMultiMeterSlots, multiMeterPlayingSlot, setMultiMeterPlayingSlot,
  } = metronome;

  const timer = usePracticeTimer({ loadData, metronome });
  const {
    activeItemId, elapsedTime,
    focusedPracticeItemId, setFocusedPracticeItemId,
    editing, saveAndStop, handleStart, handleStop, handleSetEditing,
  } = timer;

  const tts = useTts();
  const { speakText, stopSpeech } = tts;
  const {
    kokoroEnabled, kokoroStatus, kokoroProgress,
    handleToggleKokoro,
  } = tts;

  const llm = useLlmEncouragement({ items, totals, activeItemId, elapsedTime, speakText });
  const {
    aiCoachEnabled, setAiCoachEnabled,
    llmStatus, llmProgress, llmMessage, llmError, llmModalOpen, setLlmModalOpen,
    handleLlmDownload, handleEncouragementPress, generateEncouragement,
  } = llm;

  // Wake word (hands-free mode) state
  const wakeWordEngineRef = useRef(null);
  const sttServiceRef = useRef(null);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [wakeWordLoading, setWakeWordLoading] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [wakeWordError, setWakeWordError] = useState(null);
  const [listeningState, setListeningState] = useState('idle'); // 'idle'|'listening'|'processing'|'feedback'|'error'
  const [voiceTranscript, setVoiceTranscript] = useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineMode, _setOfflineMode] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const setOfflineMode = useCallback((value) => {
    setOfflineServiceMode(value);
    _setOfflineMode(!!value);
  }, []);

  const [goOnlineToast, setGoOnlineToast] = useState(false);

  useEffect(() => {
    if (!goOnlineToast) return;
    const timer = setTimeout(() => setGoOnlineToast(false), 3500);
    return () => clearTimeout(timer);
  }, [goOnlineToast]);

  const subscriptionRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setTotals({});
      setMetronomePractices([]);
      setNotes([]);
      setReportLogs([]);
      setWeekLogs([]);
      setMonthLogs([]);
      setYearLogs([]);
      setSequencerBpm(120);
      setSequencerSoundType('click');
      setSequencerSlots([]);
      sequencerNextIdRef.current = 1;
      setMultiMeterBpm(120);
      setMultiMeterSoundType('click');
      setMultiMeterSlots([]);
      setIsSyncing(false);
      setSettingsOpen(false);
      setActiveTab('practice');
      prevUserRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const prevIsVisitorRef = useRef(isVisitor);
  useEffect(() => {
    const wasVisitor = prevIsVisitorRef.current;
    prevIsVisitorRef.current = isVisitor;
    // Visitor logged off: isVisitor went true→false, no user
    if (wasVisitor && !isVisitor && !user) {
      setActiveTab('practice');
      setItems([]);
      setTotals({});
      setMetronomePractices([]);
      setNotes([]);
      setSequencerBpm(120);
      setSequencerSoundType('click');
      setSequencerSlots([]);
      sequencerNextIdRef.current = 1;
      setMultiMeterBpm(120);
      setMultiMeterSoundType('click');
      setMultiMeterSlots([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisitor, user]);

  const prevUserRef = useRef(null);

  useEffect(() => {
    if (!user || !authReady) return;

    if (!prevUserRef.current) {
      setActiveTab('practice');
    }
    prevUserRef.current = user;

    let cancelled = false;

    const init = async () => {
      setIsSyncing(true);
      try {
        // Initial-load auto-enter offline: if the device is plainly offline
        // when sync starts, flip into offline mode so the banner shows and
        // we skip every Firestore call. We do NOT re-check navigator.onLine
        // during the session — that's the user's job via the banner's "Go
        // online" link or the settings toggle.
        if (!navigator.onLine) {
          setOfflineMode(true);
          return;
        }
        // initTimezone runs in parallel with the three pulls. The module-level
        // currentTz is already initialized from localStorage at module load
        // (see timezoneService.js), so getTimezone() returns a valid cached
        // value before initTimezone's Firestore reconciliation finishes. None
        // of the pulls read or write timezone — logs store loggedAt epoch ms;
        // tz is only used for UI bucketing afterwards.
        //
        // Order matters: pull first so we adopt cloud truth (renames, deletes
        // applied while this device was offline) BEFORE pushing local state up.
        // The syncedOnce flag in pullAll handles offline-deletion cleanup.
        await Promise.all([
          initTimezone(firebaseBackend, user.id),
          initPriorHours(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
          firebaseBackend.pullAllPractices(user.id),
          firebaseBackend.pullAllGoals(user.id),
        ]);
        if (getOfflineMode()) {
          return;
        }
        // One-shot legacy migration: if Dexie has no goals AND localStorage
        // has a single goal from the pre-v15 schema, promote it.
        const dexieGoalCount = await db.goals.count();
        const legacyGoalRaw = getItem('drummate_goal');
        if (shouldMigrateLegacy(dexieGoalCount, legacyGoalRaw)) {
          const record = buildMigratedGoal(legacyGoalRaw, Date.now(), () => crypto.randomUUID());
          if (record) {
            await insertGoalRecord(record);
          }
        }
        if (legacyGoalRaw) removeItem('drummate_goal');
        // flushSyncQueue replays queued offline edits to cloud AND restores
        // local Dexie to match payload, so loadData below reads the final
        // post-merge state. Keep the sync overlay up until this is done —
        // otherwise the UI flickers between pull-overwritten old state and
        // queue-applied new state.
        await firebaseBackend.flushSyncQueue(user.id);
        await firebaseBackend.pushAllLocal(user.id);
        // Auto-archive any goals whose endDate has passed.
        const todayStr = getTodayString();
        const allGoalsForArchive = await db.goals.toArray();
        const expiredGoals = selectExpiredForArchive(allGoalsForArchive, todayStr);
        for (const g of expiredGoals) {
          await archiveGoal(g.uid);
          const fresh = await getGoalByUid(g.uid);
          if (fresh) await firebaseBackend.pushGoal(fresh, user.id);
        }
      } catch (err) {
        console.error('Sync init failed:', err);
      } finally {
        // loadData is the single source of truth for UI state. Run it
        // whether sync succeeded, failed, or short-circuited (offline).
        // Guard with !cancelled: if sign-out fired the cleanup, the !user
        // useEffect already cleared state. Calling loadData() here after
        // that clear (but before wipeAllLocalData finishes) would repopulate
        // React state with the previous user's Dexie rows.
        if (!cancelled) {
          await loadData();
          setIsSyncing(false);
        }
      }
      // Subscribe AFTER local state is reconciled — its initial snapshot
      // will see local == cloud and won't trigger a flicker. Stored in a
      // ref so handleEnterOfflineMode can tear it down without re-running
      // the effect.
      if (!cancelled && !getOfflineMode()) {
        subscriptionRef.current = firebaseBackend.subscribeToChanges(loadData);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authReady, loadData, syncTrigger, setOfflineMode]);



  const {
    handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
    handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
    handleMergeItem, handleReorder,
  } = usePracticeItems({ items, loadData, activeItemId, clearActiveTimer: timer.clearActiveTimer });

  const practices = useMetronomePractices({
    metronomePractices, items, loadData, handleStart, saveAndStop, activeItemId,
  });
  const {
    runningPracticeUid,
    practiceRunStepIndex, setPracticeRunStepIndex,
    practiceRunBarIndex, setPracticeRunBarIndex,
    practiceRunIsPlaying, setPracticeRunIsPlaying,
    practiceRunComplete, setPracticeRunComplete,
    handleAddPractice, handleUpdatePractice, handleDeletePractice,
    handleReorderPractices, handleStartPractice, handleEndPractice,
  } = practices;

  // reportSubpageNavRef breaks the wiring cycle between useReports and useNavigation:
  // useNavigation owns setReportSubpage, but useReports needs onNavigateToDaily which
  // calls setReportSubpage. We forward the call through a stable ref that gets assigned
  // after nav is created below.
  const reportSubpageNavRef = useRef(() => {});
  const reports = useReports({
    loadData,
    onNavigateToDaily: () => reportSubpageNavRef.current(),
    items,
  });
  const {
    reportDate, weekStart, weekLogs, monthStart, monthLogs, yearStart, yearLogs,
    reportLogs, editTimeModal, setEditTimeModal,
    handleReportDateChange, handleManualTimeAdjust, handleMergeToYesterday,
    handleEditTime, handleAddTime, handleDayClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    setReportLogs, setWeekLogs, setMonthLogs, setYearLogs,
  } = reports;

  const nav = useNavigation({ reports, metronome, practices });
  reportSubpageNavRef.current = () => nav.setReportSubpage('daily');
  const {
    activeTab, setActiveTab,
    metronomeSubpage, setMetronomeSubpage,
    reportSubpage, setReportSubpage,
    notesSubpage, setNotesSubpage,
    activeTabRef,
    metronomeSubpageRef,
    reportSubpageRef,
    notesSubpageRef,
    reportDateRef, weekStartRef, monthStartRef, yearStartRef,
    handleTabChange, handleSubpageChange,
  } = nav;

  // Auto-disable Kokoro TTS when neither AI Coach nor Hands-Free is on
  useEffect(() => {
    if (!aiCoachEnabled && !handsFreeMode && tts.kokoroEnabled) {
      tts.setKokoroEnabled(false);
      setItem('drummate_kokoro_tts', 'false');
    }
  }, [aiCoachEnabled, handsFreeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice command dispatcher — called after STT transcription
  const dispatchVoiceCommand = useCallback(async (intent) => {
    switch (intent.action) {
      case 'metronome.start': {
        if (metronomeIsPlaying) {
          speakText(language === 'zh' ? '已经在播放' : 'Metronome is already running');
          return;
        }
        const engine = metronomeEngineRef.current;
        if (!engine) return;
        engine.setSequence(null);
        noSleepRef.current.enable();
        await engine.start();
        setMetronomeIsPlaying(true);
        setActiveTab('metronome');
        setMetronomeSubpage('metronome');
        speakText(language === 'zh' ? '节拍器已启动' : 'Metronome started');
        break;
      }

      case 'metronome.stop': {
        const engine = metronomeEngineRef.current;
        if (engine && metronomeIsPlaying) {
          engine.stop();
          setMetronomeIsPlaying(false);
          setMetronomeCurrentBeat(-1);
          noSleepRef.current.disable();
          speakText(language === 'zh' ? '节拍器已停止' : 'Metronome stopped');
        } else {
          speakText(language === 'zh' ? '节拍器没有在运行' : 'Metronome is not running');
        }
        break;
      }

      case 'metronome.setTempo': {
        const bpm = Math.max(30, Math.min(300, intent.value));
        setMetronomeBpm(bpm);
        metronomeEngineRef.current?.setBpm(bpm);
        speakText(language === 'zh' ? `速度已设置为 ${bpm}` : `Tempo set to ${bpm}`);
        break;
      }

      case 'metronome.adjustTempo': {
        const currentBpm = metronomeEngineRef.current?.bpm ?? metronomeBpm;
        const newBpm = Math.max(30, Math.min(300, currentBpm + intent.delta));
        setMetronomeBpm(newBpm);
        metronomeEngineRef.current?.setBpm(newBpm);
        const direction = intent.delta > 0
          ? (language === 'zh' ? '加速' : 'Increased')
          : (language === 'zh' ? '减速' : 'Decreased');
        speakText(language === 'zh' ? `${direction}到 ${newBpm}` : `${direction} tempo to ${newBpm}`);
        break;
      }

      case 'metronome.setTimeSignature': {
        setMetronomeTimeSignature(intent.value);
        metronomeEngineRef.current?.setBeatsPerMeasure(intent.value[0]);
        speakText(language === 'zh'
          ? `拍号设为 ${intent.value[0]} 比 ${intent.value[1]}`
          : `Time signature set to ${intent.value[0]} over ${intent.value[1]}`);
        break;
      }

      case 'metronome.setSubdivision': {
        setMetronomeSubdivision(intent.value);
        speakText(language === 'zh' ? `切换到${intent.value}` : `Switched to ${intent.value}`);
        break;
      }

      case 'practice.start': {
        const match = findBestItemMatch(intent.itemQuery, items);
        if (!match) {
          speakText(language === 'zh'
            ? `找不到练习项目：${intent.itemQuery}`
            : `No practice item found for: ${intent.itemQuery}`);
          return;
        }
        setActiveTab('practice');
        await handleStart(match.id);
        speakText(language === 'zh' ? `开始练习 ${match.name}` : `Starting practice: ${match.name}`);
        break;
      }

      case 'practice.stop': {
        if (activeItemId == null) {
          speakText(language === 'zh' ? '没有正在进行的练习' : 'No practice session is running');
          return;
        }
        await handleStop();
        speakText(language === 'zh' ? '练习已保存' : 'Practice session saved');
        break;
      }

      case 'report.generate': {
        handleTabChange('report');
        speakText(language === 'zh' ? '打开报告' : 'Opening report');
        break;
      }

      case 'navigate': {
        if (intent.subpage) {
          handleTabChange(intent.tab);
          handleSubpageChange(intent.subpage);
        } else {
          handleTabChange(intent.tab);
        }
        speakText(language === 'zh' ? `切换到${intent.tab}` : `Navigating to ${intent.tab}`);
        break;
      }

      case 'toggleLanguage': {
        toggleLanguage();
        speakText('Language switched');
        break;
      }

      case 'unknown':
      default: {
        speakText(language === 'zh' ? '我没听懂，请再说一遍' : "Sorry, I didn't understand that");
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, metronomeIsPlaying, metronomeBpm, items, activeItemId, handleStart, handleStop, handleTabChange, handleSubpageChange, toggleLanguage, speakText]);

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

    // Turning on — only supported in Chrome (ONNX WASM issues on Safari/Firefox)
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
    if (!isChrome) {
      setWakeWordError('unsupported_browser');
      return;
    }

    setWakeWordError(null);
    try {
      if (!wakeWordEngineRef.current) {
        const { createWakeWordEngine } = await import('./audio/wakeWordEngine');
        wakeWordEngineRef.current = createWakeWordEngine();
      }

      if (!wakeWordEngineRef.current.isLoaded) {
        setWakeWordLoading(true);
        await wakeWordEngineRef.current.load();
        setWakeWordLoading(false);
      }

      // Initialize STT service if not already done
      if (!sttServiceRef.current) {
        sttServiceRef.current = createSttService();
      }

      wakeWordEngineRef.current.onDetected(async ({ keyword, score }) => {
        console.log(`Wake word "${keyword}" detected (score: ${score.toFixed(3)})`);
        setWakeWordDetected(true);

        if (!sttServiceRef.current) {
          setTimeout(() => setWakeWordDetected(false), 2000);
          return;
        }

        setListeningState('listening');
        setVoiceTranscript(null);

        try {
          const sttLang = language === 'zh' ? 'zh-CN' : 'en-US';
          const transcript = await sttServiceRef.current.listenOnce({
            language: sttLang,
            timeoutMs: 7000,
          });

          setListeningState('processing');
          setVoiceTranscript(transcript);

          const intent = parseIntent(transcript);
          await dispatchVoiceCommand(intent);

          setListeningState('feedback');
          setTimeout(() => {
            setListeningState('idle');
            setWakeWordDetected(false);
            setVoiceTranscript(null);
          }, 2500);
        } catch (err) {
          const noSpeech = err === 'no-speech' || err === 'timeout';
          setListeningState('error');
          if (!noSpeech) {
            console.error('STT error:', err);
          }
          setTimeout(() => {
            setListeningState('idle');
            setWakeWordDetected(false);
            setVoiceTranscript(null);
          }, 2500);
        }
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
  }, [handsFreeMode, language, dispatchVoiceCommand]);

  // Clean up wake word engine on unmount
  useEffect(() => {
    return () => {
      if (wakeWordEngineRef.current) {
        wakeWordEngineRef.current.destroy();
        wakeWordEngineRef.current = null;
      }
    };
  }, []);

  useEffect(() => { languageRef.current = language; }, [language]);

  // Global shortcuts: 1 = Practice, 2 = Metronome, 3 = Report, m = minutes, h = hours
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Digit1') handleTabChange('practice');
      else if (e.code === 'Digit2') handleTabChange('metronome');
      else if (e.code === 'Digit3') handleTabChange('report');
      else if (e.code === 'Digit4') handleTabChange('notes');
      else if (e.code === 'KeyM') setTimeUnit('minutes');
      else if (e.code === 'KeyH') setTimeUnit('hours');
      else if (e.code === 'KeyE') { if (languageRef.current !== 'en') toggleLanguage(); }
      else if (e.code === 'KeyC') { if (languageRef.current !== 'zh') toggleLanguage(); }
      else if (e.code === 'KeyL') setTheme('light');
      else if (e.code === 'KeyD') setTheme('dark');
      else if (e.code === 'KeyS') {
        if (timer.activeItemIdRef.current != null) saveAndStop();
      }
      else if (e.code === 'KeyA') {
        if (activeTabRef.current === 'metronome') setMetronomeAccentFirstBeat(prev => !prev);
      }
      else if (e.key === '?') setShowKeyboardHelp(prev => !prev);
      else if (e.key === 'Tab') {
        if (activeTabRef.current === 'metronome') {
          e.preventDefault();
          const pages = ['metronome', 'practice', 'sequencer', 'multiMeter'];
          const idx = pages.indexOf(metronomeSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          handleSubpageChange(next);
        } else if (activeTabRef.current === 'report') {
          e.preventDefault();
          const pages = ['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'];
          const idx = pages.indexOf(reportSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          setReportSubpage(next);
        } else if (activeTabRef.current === 'notes') {
          e.preventDefault();
          const pages = ['byDate', 'byItem'];
          const idx = pages.indexOf(notesSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          setNotesSubpage(next);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (activeTabRef.current === 'report') {
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          const subpage = reportSubpageRef.current;
          const today = getTodayString();
          if (subpage === 'daily') {
            e.preventDefault();
            const newDate = shiftDate(reportDateRef.current, dir);
            if (newDate <= today) handleReportDateChange(newDate);
          } else if (subpage === 'weekly') {
            e.preventDefault();
            const newWeekStart = getWeekStart(shiftDate(weekStartRef.current, dir * 7));
            if (newWeekStart <= getWeekStart(today)) handleWeekChange(newWeekStart);
          } else if (subpage === 'monthly') {
            e.preventDefault();
            const newMonthStart = dir === -1
              ? getMonthStart(shiftDate(monthStartRef.current, -1))
              : getMonthStart(shiftDate(monthStartRef.current, 32));
            if (newMonthStart <= getMonthStart(today)) handleMonthChange(newMonthStart);
          } else if (subpage === 'yearly') {
            e.preventDefault();
            const newYearStart = dir === -1
              ? getYearStart(shiftDate(yearStartRef.current, -1))
              : getYearStart(shiftDate(yearStartRef.current, 366));
            if (newYearStart <= getYearStart(today)) handleYearChange(newYearStart);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleTabChange, handleSubpageChange, setReportSubpage, handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange, toggleLanguage, saveAndStop, setTheme, setMetronomeAccentFirstBeat, setTimeUnit]);

  const handleEnterOfflineMode = useCallback(() => {
    // Tear down the live Firestore listener so it can't overwrite local
    // Dexie state while the user thinks they're isolated. The sync-overlay
    // path arrives here before the subscription is ever started; the
    // settings-toggle path arrives with an active subscription.
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
    setOfflineMode(true);
    setIsSyncing(false);
  }, [setOfflineMode]);

  const handleGoOnline = useCallback(() => {
    if (!navigator.onLine) {
      // Network still down — stay in offline mode and let the user know.
      setGoOnlineToast(true);
      setSettingsOpen(false);
      return;
    }
    setOfflineMode(false);
    setSettingsOpen(false);
    setSyncTrigger((n) => n + 1);
  }, [setOfflineMode]);

  if (!user && !isVisitor) {
    return <AuthScreen />;
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-100 dark:bg-slate-900 overflow-hidden">
      {offlineMode && (
        <OfflineBanner
          onShowPending={() => setPendingModalOpen(true)}
          onGoOnline={handleGoOnline}
        />
      )}
      {isSyncing && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gray-100/80 dark:bg-slate-900/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-12 h-12 border-4 border-blue-500 dark:border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-700 dark:text-slate-200 font-medium">{t('auth.syncing')}</p>
          <button
            onClick={handleEnterOfflineMode}
            className="mt-2 px-4 py-2 text-sm font-medium text-amber-700 bg-white dark:bg-slate-800 dark:text-amber-400 border border-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-slate-700"
          >
            {t('auth.enterOfflineMode')}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className={`${activeTab === 'practice' ? 'max-w-4xl' : 'max-w-lg'} mx-auto px-4 py-8 flex flex-col gap-6`}>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100">
              {t('appName')}
            </h1>
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-blue-600 dark:bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors shrink-0"
              aria-label={t('accessibility.openSettings')}
              data-settings-button
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
              onRestoreItem={handleRestoreItem}
              onPermanentDelete={handlePermanentDelete}
              onArchiveItem={handleArchiveItem}
              onSetItemCategory={handleSetItemCategory}
              onMergeItem={handleMergeItem}
              onReorder={handleReorder}
              focusedItemId={focusedPracticeItemId}
              onFocusChange={setFocusedPracticeItemId}
              goalRefreshKey={goalRefreshKey}
              compactMode={compactMode}
              timeUnit={timeUnit}
            />
          )}

          {activeTab === 'metronome' && (
            <>
              {/* Subpage toggle */}
              <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
                <button
                  onClick={() => handleSubpageChange('metronome')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'metronome'
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('metronomeSubpages.metronome')}
                </button>
                <button
                  onClick={() => handleSubpageChange('practice')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'practice'
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('metronomeSubpages.practice')}
                </button>
                <button
                  onClick={() => handleSubpageChange('sequencer')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'sequencer'
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('metronomeSubpages.sequencer')}
                </button>
                <button
                  onClick={() => handleSubpageChange('multiMeter')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    metronomeSubpage === 'multiMeter'
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('metronomeSubpages.multiMeter')}
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
                  accentFirstBeat={metronomeAccentFirstBeat}
                  setAccentFirstBeat={setMetronomeAccentFirstBeat}
                  compactMode={compactMode}
                />
              ) : metronomeSubpage === 'sequencer' ? (
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
                  compactMode={compactMode}
                />
              ) : metronomeSubpage === 'multiMeter' ? (
                <MultiMeterPage
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  bpm={multiMeterBpm}
                  setBpm={setMultiMeterBpm}
                  isPlaying={metronomeIsPlaying}
                  setIsPlaying={setMetronomeIsPlaying}
                  soundType={multiMeterSoundType}
                  setSoundType={setMultiMeterSoundType}
                  slots={multiMeterSlots}
                  setSlots={setMultiMeterSlots}
                  playingSlot={multiMeterPlayingSlot}
                  setPlayingSlot={setMultiMeterPlayingSlot}
                  currentBeat={metronomeCurrentBeat}
                  setCurrentBeat={setMetronomeCurrentBeat}
                  compactMode={compactMode}
                />
              ) : (
                <PracticePage
                  practices={metronomePractices}
                  runningPracticeUid={runningPracticeUid}
                  items={items.filter(i => !i.trashed && !i.archived)}
                  engineRef={metronomeEngineRef}
                  noSleepRef={noSleepRef}
                  onAddPractice={handleAddPractice}
                  onUpdatePractice={handleUpdatePractice}
                  onDeletePractice={handleDeletePractice}
                  onReorderPractices={handleReorderPractices}
                  onStartPractice={handleStartPractice}
                  onEndPractice={handleEndPractice}
                  runStepIndex={practiceRunStepIndex}
                  runBarIndex={practiceRunBarIndex}
                  runIsPlaying={practiceRunIsPlaying}
                  runComplete={practiceRunComplete}
                  setRunStepIndex={setPracticeRunStepIndex}
                  setRunBarIndex={setPracticeRunBarIndex}
                  setRunIsPlaying={setPracticeRunIsPlaying}
                  setRunComplete={setPracticeRunComplete}
                  compactMode={compactMode}
                />
              )}
            </>
          )}

          {activeTab === 'report' && (
            <>
              {/* Report subpage toggle */}
              <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
                {['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'].map((page) => (
                  <button
                    key={page}
                    onClick={() => setReportSubpage(page)}
                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      reportSubpage === page
                        ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                        : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {t(`reportSubpages.${page}`)}
                  </button>
                ))}
              </div>

              {reportSubpage === 'daily' && (
                <DailyReport
                  items={items.filter(i => !i.trashed)}
                  allItems={items.filter(i => !i.trashed)}
                  reportDate={reportDate}
                  reportLogs={reportLogs}
                  onDateChange={handleReportDateChange}
                  onEditTime={handleEditTime}
                  onAddTime={handleAddTime}
                  onMergeToYesterday={handleMergeToYesterday}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                  compactMode={compactMode}
                />
              )}

              {reportSubpage === 'weekly' && (
                <WeeklyReport
                  items={items.filter(i => !i.trashed)}
                  weekStart={weekStart}
                  weekLogs={weekLogs}
                  onWeekChange={handleWeekChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                  compactMode={compactMode}
                />
              )}

              {reportSubpage === 'monthly' && (
                <MonthlyReport
                  items={items.filter(i => !i.trashed)}
                  monthStart={monthStart}
                  monthLogs={monthLogs}
                  onMonthChange={handleMonthChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                  compactMode={compactMode}
                />
              )}

              {reportSubpage === 'yearly' && (
                <YearlyReport
                  items={items.filter(i => !i.trashed)}
                  yearStart={yearStart}
                  yearLogs={yearLogs}
                  onYearChange={handleYearChange}
                  onDayClick={handleDayClick}
                  timeUnit={timeUnit}
                  groupByCategory={groupByCategory}
                  compactMode={compactMode}
                />
              )}

              {reportSubpage === 'stats' && (
                <StatsReport
                  items={items.filter(i => !i.trashed)}
                  timeUnit={timeUnit}
                  compactMode={compactMode}
                />
              )}

              {reportSubpage === 'goals' && (
                <GoalsPage
                  user={user}
                  firebaseBackend={firebaseBackend}
                  compactMode={compactMode}
                  timeUnit={timeUnit}
                />
              )}
            </>
          )}

          {activeTab === 'notes' && (
            <NotesPage
              items={items}
              user={user}
              firebaseBackend={firebaseBackend}
              defaultItemUid={
                focusedPracticeItemId != null
                  ? items.find(i => i.id === focusedPracticeItemId)?.uid
                  : null
              }
              notesSubpage={notesSubpage}
              onSubpageChange={setNotesSubpage}
              notes={notes}
              onNotesRefresh={refreshNotes}
              compactMode={compactMode}
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
        timeUnit={timeUnit}
        onToggleTimeUnit={() => setTimeUnit((u) => (u === 'minutes' ? 'hours' : 'minutes'))}
        kokoroEnabled={kokoroEnabled}
        kokoroStatus={kokoroStatus}
        kokoroProgress={kokoroProgress}
        onToggleKokoro={handleToggleKokoro}
        aiCoachEnabled={aiCoachEnabled}
        onToggleAiCoach={() => {
          setAiCoachEnabled((prev) => {
            const next = !prev;
            setItem('drummate_ai_coach_enabled', String(next));
            return next;
          });
        }}
        handsFreeMode={handsFreeMode}
        onToggleHandsFree={handleToggleHandsFree}
        wakeWordLoading={wakeWordLoading}
        wakeWordDetected={wakeWordDetected}
        wakeWordError={wakeWordError}
        listeningState={listeningState}
        voiceTranscript={voiceTranscript}
        userId={user?.id}
        onTimezoneChange={loadData}
        offlineMode={offlineMode}
        onEnterOfflineMode={handleEnterOfflineMode}
        onGoOnline={handleGoOnline}
        onShowPending={() => setPendingModalOpen(true)}
        groupByCategory={groupByCategory}
        onToggleGroupByCategory={() => setGroupByCategory((v) => !v)}
        compactMode={compactMode}
        onToggleCompactMode={() => setCompactMode((v) => !v)}
        theme={theme}
        onThemeChange={setTheme}
      />

      <PendingChangesModal
        isOpen={pendingModalOpen}
        onClose={() => setPendingModalOpen(false)}
      />

      <KeyboardShortcutsModal
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

      {goOnlineToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 dark:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-xs text-center"
          role="status"
          aria-live="polite"
        >
          {t('offline.stillOffline')}
        </div>
      )}

      {handsFreeMode && (
        <FloatingVoiceIndicator
          listeningState={listeningState}
          transcript={voiceTranscript}
        />
      )}

      {activeItemId != null && activeTab !== 'practice' && (
        <FloatingPracticeWidget
          itemName={items.find(i => i.id === activeItemId)?.name ?? ''}
          elapsedTime={elapsedTime}
          onStop={saveAndStop}
          onNavigate={() => handleTabChange('practice')}
        />
      )}

      {aiCoachEnabled && (
        <>
          <EncouragementButton
            status={llmStatus}
            onPress={handleEncouragementPress}
          />

          <EncouragementModal
            isOpen={llmModalOpen}
            status={llmStatus}
            progress={llmProgress}
            message={llmMessage}
            error={llmError}
            onClose={() => { setLlmModalOpen(false); stopSpeech(); }}
            onDownload={handleLlmDownload}
            onRegenerate={generateEncouragement}
          />
        </>
      )}

      {editTimeModal && (
        <EditTimeModal
          itemName={editTimeModal.itemName}
          date={reportDate}
          currentSeconds={editTimeModal.currentSeconds}
          onSave={async (deltaSeconds) => {
            await handleManualTimeAdjust(editTimeModal.itemId, deltaSeconds, reportDate);
            setEditTimeModal(null);
          }}
          onDelete={async () => {
            await handleManualTimeAdjust(editTimeModal.itemId, -editTimeModal.currentSeconds, reportDate);
            setEditTimeModal(null);
          }}
          onClose={() => setEditTimeModal(null)}
        />
      )}

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
