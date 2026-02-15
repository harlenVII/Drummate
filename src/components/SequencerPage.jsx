import { useCallback, useEffect } from 'react';
import BpmDial from './BpmDial';
import SubdivisionIcon from './SubdivisionIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const MAX_SLOTS = 16;
const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

function SequencerPage({
  engineRef,
  noSleepRef,
  bpm,
  setBpm,
  isPlaying,
  setIsPlaying,
  soundType,
  setSoundType,
  slots,
  setSlots,
  playingSlot,
  setPlayingSlot,
  nextIdRef,
}) {
  const { t } = useLanguage();

  // Sync BPM to engine whenever it changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [engineRef, bpm]);

  // Sync sound type to engine whenever it changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSoundType(soundType);
    }
  }, [engineRef, soundType]);

  // Build pattern array from slots for the engine
  const buildSequencePatterns = useCallback((slotArray) => {
    return slotArray.map((slot) => {
      const sub = SUBDIVISIONS.find((s) => s.key === slot.subdivision);
      return sub ? sub.pattern : [0];
    });
  }, []);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      engineRef.current.stop();
      engineRef.current.setSequence(null);
      setIsPlaying(false);
      setPlayingSlot(-1);
      noSleepRef.current.disable();
    } else {
      if (slots.length === 0) return; // Can't play empty sequence
      // Set sequence mode with current slots
      const patterns = buildSequencePatterns(slots);
      engineRef.current.setSequence(patterns);
      // Set beatsPerMeasure to slot count so currentBeat wraps correctly
      engineRef.current.setBeatsPerMeasure(slots.length);
      noSleepRef.current.enable();
      await engineRef.current.start();
      setIsPlaying(true);
      setPlayingSlot(0);
    }
  }, [engineRef, isPlaying, setIsPlaying, setPlayingSlot,
      noSleepRef, slots, buildSequencePatterns]);

  const handleAddSubdivision = useCallback((subdivisionKey) => {
    if (slots.length >= MAX_SLOTS) return;
    const newSlot = {
      id: nextIdRef.current++,
      subdivision: subdivisionKey,
    };
    setSlots([...slots, newSlot]);
  }, [slots, setSlots, nextIdRef]);

  const handleDeleteSlot = useCallback((index) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSlots(newSlots);

    // If currently playing, update the engine's sequence live
    if (isPlaying && engineRef.current) {
      if (newSlots.length === 0) {
        // Stop if we deleted the last slot
        engineRef.current.stop();
        engineRef.current.setSequence(null);
        setIsPlaying(false);
        setPlayingSlot(-1);
        noSleepRef.current.disable();
      } else {
        const patterns = newSlots.map((slot) => {
          const sub = SUBDIVISIONS.find((s) => s.key === slot.subdivision);
          return sub ? sub.pattern : [0];
        });
        engineRef.current.setSequence(patterns);
        engineRef.current.setBeatsPerMeasure(newSlots.length);
      }
    }
  }, [slots, setSlots, isPlaying, engineRef, setIsPlaying, setPlayingSlot, noSleepRef]);

  return (
    <div className="flex flex-col items-center gap-5">

      {/* === Slot Sequence Visualization === */}
      <div className="w-full">
        {slots.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t('sequencerEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((slot, index) => {
              const isCurrentlyPlaying = isPlaying && index === playingSlot;
              return (
                <div
                  key={slot.id}
                  className={`
                    relative flex flex-col items-center justify-center
                    p-2 rounded-xl border-2
                    transition-all duration-150
                    ${isCurrentlyPlaying
                      ? 'border-blue-500 bg-blue-50 scale-105 shadow-md'
                      : 'border-gray-200 bg-white'
                    }
                  `}
                >
                  {/* Slot number badge */}
                  <span className={`text-[10px] font-bold mb-0.5 ${
                    isCurrentlyPlaying ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </span>

                  {/* Subdivision icon */}
                  <div className={`${
                    isCurrentlyPlaying ? 'text-blue-600' : 'text-gray-700'
                  }`}>
                    <SubdivisionIcon type={slot.subdivision} />
                  </div>

                  {/* Delete button (hidden while playing) */}
                  {!isPlaying && (
                    <button
                      onClick={() => handleDeleteSlot(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500
                        text-white rounded-full flex items-center justify-center
                        text-xs font-bold shadow-sm hover:bg-red-600 transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === Add Subdivision Buttons === */}
      <div className="w-full">
        <p className="text-xs text-gray-500 text-center mb-2">
          {t('sequencerTapToAdd')}
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          {SUBDIVISIONS.map(({ key }) => (
            <button
              key={key}
              onClick={() => handleAddSubdivision(key)}
              disabled={slots.length >= MAX_SLOTS || isPlaying}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                slots.length >= MAX_SLOTS || isPlaying
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-blue-50 hover:border-blue-400'
              }`}
            >
              <SubdivisionIcon type={key} />
              {/* Small + badge */}
              {slots.length < MAX_SLOTS && !isPlaying && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white
                  rounded-full flex items-center justify-center text-[10px] font-bold">
                  +
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* === Sound Type Selector === */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SOUND_TYPES.map((key) => (
          <button
            key={key}
            onClick={() => setSoundType(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              soundType === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {t(`soundTypes.${key}`)}
          </button>
        ))}
      </div>

      {/* === BPM Dial === */}
      <BpmDial bpm={bpm} onBpmChange={setBpm} />

      {/* === Play/Stop button === */}
      <button
        onClick={handleTogglePlay}
        disabled={slots.length === 0}
        className={`w-16 h-16 rounded-full flex items-center justify-center
          transition-colors shadow-md ${
            slots.length === 0
              ? 'bg-gray-300 cursor-not-allowed'
              : isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
      >
        {isPlaying ? (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default SequencerPage;
