import { useState, useEffect, useCallback, useRef } from 'react';
import { useMetronomeState } from './hooks/useMetronomeState';
import PracticeItemList from './components/PracticeItemList';
import MetronomeTab from './components/MetronomeTab';
import ReportTab from './components/ReportTab';
import AppHeader from './components/AppHeader';
import TabBar from './components/TabBar';
import SettingsPanel from './components/SettingsPanel';
import { useLanguage } from './contexts/LanguageContext';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import FloatingVoiceIndicator from './components/FloatingVoiceIndicator';
import FloatingPracticeWidget from './components/FloatingPracticeWidget';
import EncouragementButton from './components/EncouragementButton';
import EncouragementModal from './components/EncouragementModal';
import EditTimeModal from './components/EditTimeModal';
import NotesPage from './components/NotesPage';
import { useUiPreferences } from './hooks/useUiPreferences';
import { useAppData } from './hooks/useAppData';
import { usePracticeTimer } from './hooks/usePracticeTimer';
import { usePracticeItems } from './hooks/usePracticeItems';
import { useMetronomePractices } from './hooks/useMetronomePractices';
import { useReports } from './hooks/useReports';
import { useNavigation } from './hooks/useNavigation';
import { useTts } from './hooks/useTts';
import { useLlmEncouragement } from './hooks/useLlmEncouragement';
import { useVoiceControl } from './hooks/useVoiceControl';
import { useSync } from './hooks/useSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import OfflineBanner from './components/OfflineBanner';
import PendingChangesModal from './components/PendingChangesModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';

import { setItem } from './utils/safeStorage';

function App() {
  const { language, toggleLanguage, t } = useLanguage();
  const { user, signOut, isVisitor } = useAuth();
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

  const {
    handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
    handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
    handleMergeItem, handleReorder,
  } = usePracticeItems({ items, loadData, activeItemId, clearActiveTimer: timer.clearActiveTimer });

  const practices = useMetronomePractices({
    metronomePractices, items, loadData, handleStart, saveAndStop, activeItemId,
  });

  // reportSubpageNavRef breaks the wiring cycle between useReports and useNavigation:
  // useNavigation owns setReportSubpage, but useReports needs onNavigateToSubpage which
  // calls setReportSubpage. We forward the call through a stable ref that gets assigned
  // after nav is created below.
  const reportSubpageNavRef = useRef(() => {});
  const reports = useReports({
    loadData,
    onNavigateToSubpage: (subpage) => reportSubpageNavRef.current(subpage),
    items,
  });
  const {
    reportDate,
    editTimeModal, setEditTimeModal,
    handleManualTimeAdjust,
  } = reports;

  const nav = useNavigation({ reports, metronome, practices });
  reportSubpageNavRef.current = (subpage) => nav.setReportSubpage(subpage); // eslint-disable-line react-hooks/refs
  const {
    activeTab, setActiveTab,
    metronomeSubpage, setMetronomeSubpage,
    reportSubpage, setReportSubpage,
    notesSubpage, setNotesSubpage,
    handleTabChange, handleSubpageChange,
  } = nav;

  const navigate = useCallback((tab, subpage) => {
    setActiveTab(tab);
    if (subpage) setMetronomeSubpage(subpage);
  }, [setActiveTab, setMetronomeSubpage]);

  const voice = useVoiceControl({
    metronome, items, activeItemId, handleStart, handleStop,
    handleTabChange, handleSubpageChange, speakText, navigate,
  });
  const {
    handsFreeMode, wakeWordLoading, wakeWordDetected, wakeWordError,
    listeningState, voiceTranscript, handleToggleHandsFree,
  } = voice;

  const sync = useSync({
    loadData,
    resetters: {
      setItems, setTotals, setMetronomePractices, setNotes,
      setSequencerBpm: metronome.setSequencerBpm,
      setSequencerSoundType: metronome.setSequencerSoundType,
      setSequencerSlots: metronome.setSequencerSlots,
      sequencerNextIdRef: metronome.sequencerNextIdRef,
      setMultiMeterBpm: metronome.setMultiMeterBpm,
      setMultiMeterSoundType: metronome.setMultiMeterSoundType,
      setMultiMeterSlots: metronome.setMultiMeterSlots,
      setActiveTab: nav.setActiveTab,
      setSettingsOpen,
    },
  });
  const {
    isSyncing, offlineMode, pendingModalOpen, setPendingModalOpen,
    goOnlineToast, syncError, setSyncError, handleEnterOfflineMode, handleGoOnline,
  } = sync;

  // Auto-disable Kokoro TTS when neither AI Coach nor Hands-Free is on
  useEffect(() => {
    if (!aiCoachEnabled && !handsFreeMode && tts.kokoroEnabled) {
      tts.setKokoroEnabled(false);
      setItem('drummate_kokoro_tts', 'false');
    }
  }, [aiCoachEnabled, handsFreeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const { showKeyboardHelp, setShowKeyboardHelp } = useKeyboardShortcuts({
    activeItemIdRef: timer.activeItemIdRef,
    nav,
    reports,
    setTimeUnit,
    setTheme,
    setMetronomeAccentFirstBeat: metronome.setAccentFirstBeat,
    saveAndStop,
  });

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
      {syncError && (
        <div
          className="flex items-center justify-between gap-3 bg-red-600 text-white text-sm px-4 py-2"
          role="alert"
        >
          <span>{t('sync.error')}</span>
          <button
            onClick={() => setSyncError(null)}
            className="font-medium underline underline-offset-2"
          >
            {t('common.dismiss')}
          </button>
        </div>
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
          <AppHeader user={user} onOpenSettings={() => setSettingsOpen(true)} />

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
            <MetronomeTab
              metronomeSubpage={metronomeSubpage}
              onSubpageChange={handleSubpageChange}
              metronome={metronome}
              practices={practices}
              metronomePractices={metronomePractices}
              items={items}
              compactMode={compactMode}
            />
          )}

          {activeTab === 'report' && (
            <ReportTab
              reportSubpage={reportSubpage}
              setReportSubpage={setReportSubpage}
              items={items}
              reports={reports}
              timeUnit={timeUnit}
              groupByCategory={groupByCategory}
              compactMode={compactMode}
              user={user}
            />
          )}

          {activeTab === 'notes' && (
            <NotesPage
              items={items}
              user={user}
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
