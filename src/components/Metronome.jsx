import { useEffect, useCallback, useRef } from 'react';
import NoSleep from 'nosleep.js';
import BpmDial from './BpmDial';
import BeatIndicator from './BeatIndicator';
import SubdivisionIcon from './SubdivisionIcon';
import { useLanguage } from '../contexts/LanguageContext';

const TIME_SIGNATURES = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
];

const SUBDIVISIONS = [
  { key: 'quarter', pattern: [0] },
  { key: 'eighth', pattern: [0, 0.5] },
  { key: 'triplet', pattern: [0, 1 / 3, 2 / 3] },
  { key: 'sixteenth', pattern: [0, 0.25, 0.5, 0.75] },
  { key: 'eighthTwoSixteenths', pattern: [0, 0.5, 0.75] },
  { key: 'twoSixteenthsEighth', pattern: [0, 0.25, 0.5] },
  { key: 'sixteenthEighthSixteenth', pattern: [0, 0.25, 0.75] },
];

function Metronome({
  engineRef,
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
}) {
  const { t } = useLanguage();
  const tapTimesRef = useRef([]);
  const noSleepRef = useRef(new NoSleep());

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [engineRef, bpm]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBeatsPerMeasure(timeSignature[0]);
    }
    setCurrentBeat(-1);
  }, [engineRef, timeSignature, setCurrentBeat]);

  useEffect(() => {
    if (engineRef.current) {
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
    }
  }, [engineRef, subdivision]);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentBeat(-1);
      noSleepRef.current.disable();
    } else {
      // Enable NoSleep BEFORE async engine start to preserve user gesture context
      noSleepRef.current.enable();
      await engineRef.current.start();
      setIsPlaying(true);
    }
  }, [engineRef, isPlaying, setIsPlaying, setCurrentBeat]);

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

  // Clean up NoSleep on unmount
  useEffect(() => {
    return () => {
      noSleepRef.current.disable();
    };
  }, []);

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
        {SUBDIVISIONS.map(({ key }) => (
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
