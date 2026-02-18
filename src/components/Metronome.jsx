import { useEffect, useCallback, useRef } from 'react';
import BpmDial from './BpmDial';
import BeatIndicator from './BeatIndicator';
import SubdivisionIcon from './SubdivisionIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const TIME_SIGNATURES = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
];

const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

function Metronome({
  engineRef,
  noSleepRef,
  bpm,
  setBpm,
  isPlaying,
  setIsPlaying,
  currentBeat,
  setCurrentBeat,
  timeSignature,
  setTimeSignature,
  subdivision,
  setSubdivision,
  soundType,
  setSoundType,
}) {
  const { t } = useLanguage();
  const tapTimesRef = useRef([]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [engineRef, bpm]);

  const prevTimeSignatureRef = useRef(timeSignature);
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBeatsPerMeasure(timeSignature[0]);
    }
    // Only reset beat display when the time signature actually changes,
    // not on remount with the same value
    if (prevTimeSignatureRef.current[0] !== timeSignature[0] ||
        prevTimeSignatureRef.current[1] !== timeSignature[1]) {
      setCurrentBeat(-1);
      prevTimeSignatureRef.current = timeSignature;
    }
  }, [engineRef, timeSignature, setCurrentBeat]);

  useEffect(() => {
    if (engineRef.current) {
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
    }
  }, [engineRef, subdivision]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSoundType(soundType);
    }
  }, [engineRef, soundType]);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentBeat(-1);
      noSleepRef.current.disable();
    } else {
      // Ensure sequence mode is off for normal metronome
      engineRef.current.setSequence(null);
      // Enable NoSleep BEFORE async engine start to preserve user gesture context
      noSleepRef.current.enable();
      await engineRef.current.start();
      setIsPlaying(true);
    }
  }, [engineRef, isPlaying, setIsPlaying, setCurrentBeat, noSleepRef]);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [];
      tapTimesRef.current.push(now);
      return;
    }

    taps.push(now);

    if (taps.length > 5) {
      taps.shift();
    }

    if (taps.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < taps.length; i++) {
        totalInterval += taps[i] - taps[i - 1];
      }
      const avgInterval = totalInterval / (taps.length - 1);
      const newBpm = Math.round(60000 / avgInterval);
      setBpm(Math.max(30, Math.min(300, newBpm)));
    }

    tapTimesRef.current = taps;
  }, []);

  const handleTimeSignatureChange = useCallback((sig) => {
    setTimeSignature(sig);
  }, []);

  const handleSubdivisionChange = useCallback((key) => {
    setSubdivision(key);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Space: toggle play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
      // Left arrow: decrease BPM by 1
      else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setBpm((prev) => Math.max(30, prev - 1));
      }
      // Right arrow: increase BPM by 1
      else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setBpm((prev) => Math.min(300, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, setBpm]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Beat indicator */}
      <BeatIndicator
        beats={timeSignature[0]}
        currentBeat={currentBeat}
        isPlaying={isPlaying}
      />

      {/* BPM dial */}
      <BpmDial bpm={bpm} onBpmChange={setBpm} />

      {/* Sound type selector */}
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

      {/* Time signature selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {TIME_SIGNATURES.map(([num, den]) => (
          <button
            key={`${num}/${den}`}
            onClick={() => handleTimeSignatureChange([num, den])}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              timeSignature[0] === num && timeSignature[1] === den
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {num}/{den}
          </button>
        ))}
      </div>

      {/* Subdivision selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SUBDIVISIONS.filter(({ key }) => key !== 'rest').map(({ key }) => (
          <button
            key={key}
            onClick={() => handleSubdivisionChange(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              subdivision === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            <SubdivisionIcon type={key} />
          </button>
        ))}
      </div>

      {/* Play/Stop button */}
      <button
        onClick={handleTogglePlay}
        className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-md ${
          isPlaying
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

      {/* Tap Tempo button */}
      <button
        onClick={handleTap}
        className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-100 transition-colors"
      >
        {t('tapTempo')}
      </button>
    </div>
  );
}

export default Metronome;
