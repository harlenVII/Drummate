import Metronome from './Metronome';
import SequencerPage from './SequencerPage';
import MultiMeterPage from './MultiMeterPage';
import PracticePage from './PracticePage';
import { useLanguage } from '../contexts/LanguageContext';

export default function MetronomeTab({
  metronomeSubpage, onSubpageChange,
  metronome,
  practices,
  metronomePractices,
  items, compactMode,
}) {
  const { t } = useLanguage();

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

  const {
    runningPracticeUid,
    practiceRunStepIndex, setPracticeRunStepIndex,
    practiceRunBarIndex, setPracticeRunBarIndex,
    practiceRunIsPlaying, setPracticeRunIsPlaying,
    practiceRunComplete, setPracticeRunComplete,
    handleAddPractice, handleUpdatePractice, handleDeletePractice,
    handleReorderPractices, handleStartPractice, handleEndPractice,
  } = practices;

  return (
    <>
      {/* Subpage toggle */}
      <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
        <button
          onClick={() => onSubpageChange('metronome')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
            metronomeSubpage === 'metronome'
              ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
              : 'text-gray-500 dark:text-slate-400'
          }`}
        >
          {t('metronomeSubpages.metronome')}
        </button>
        <button
          onClick={() => onSubpageChange('practice')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
            metronomeSubpage === 'practice'
              ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
              : 'text-gray-500 dark:text-slate-400'
          }`}
        >
          {t('metronomeSubpages.practice')}
        </button>
        <button
          onClick={() => onSubpageChange('sequencer')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
            metronomeSubpage === 'sequencer'
              ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
              : 'text-gray-500 dark:text-slate-400'
          }`}
        >
          {t('metronomeSubpages.sequencer')}
        </button>
        <button
          onClick={() => onSubpageChange('multiMeter')}
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
  );
}
