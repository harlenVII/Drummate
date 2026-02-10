import { useState, useEffect, useCallback, useRef } from 'react';
import { MetronomeEngine } from '../audio/metronomeEngine';
import BpmDial from './BpmDial';
import BeatIndicator from './BeatIndicator';

const TIME_SIGNATURES = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [7, 8],
];

function Metronome() {
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [timeSignature, setTimeSignature] = useState([4, 4]);

  const engineRef = useRef(null);
  const tapTimesRef = useRef([]);

  useEffect(() => {
    engineRef.current = new MetronomeEngine();
    engineRef.current.onBeat = (beat) => {
      setCurrentBeat(beat);
    };
    return () => {
      engineRef.current.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [bpm]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBeatsPerMeasure(timeSignature[0]);
    }
    setCurrentBeat(-1);
  }, [timeSignature]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentBeat(-1);
    } else {
      engineRef.current.start();
      setIsPlaying(true);
    }
  }, [isPlaying]);

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
        Tap Tempo
      </button>
    </div>
  );
}

export default Metronome;
