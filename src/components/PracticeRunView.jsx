import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

function computeSteps(startBpm, endBpm, bpmIncrement) {
  const steps = [];
  for (let bpm = startBpm; bpm < endBpm; bpm += bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(endBpm);
  return steps;
}

export default function PracticeRunView({
  practice,
  engineRef,
  noSleepRef,
  onEnd,
}) {
  const { t } = useLanguage();
  const steps = computeSteps(practice.startBpm, practice.endBpm, practice.bpmIncrement);
  const totalSteps = steps.length;
  const totalBars = totalSteps * practice.barsPerStep;

  const [stepIndex, setStepIndex] = useState(0);
  const [barIndex, setBarIndex] = useState(0); // bars completed within current step
  const [isPlaying, setIsPlaying] = useState(false);
  const [complete, setComplete] = useState(false);

  // Refs mirror state for use inside the onBeat callback (which closes over
  // its initial values).
  const stepIndexRef = useRef(0);
  const barIndexRef = useRef(0);
  // Track previous beat number so we can detect bar boundaries (beat wraps 0).
  const prevBeatRef = useRef(-1);
  // Suppress the initial beat=0 firing on start (which would falsely count as
  // a completed bar before any bar has actually played).
  const sawFirstBeatRef = useRef(false);
  // Prevent the onBeat handler from firing twice after engine.stop() is
  // called for completion.
  const stoppedRef = useRef(false);

  // Configure engine for this practice's settings on mount, restore on unmount.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBpm(practice.startBpm);
    engine.setBeatsPerMeasure(practice.timeSignature.beats);
    const sub = SUBDIVISIONS.find((s) => s.key === practice.subdivision);
    engine.setSubdivision(sub && sub.pattern ? sub.pattern : [0]);
    engine.setSoundType(practice.soundType);
    engine.setSequence(null);
  }, [engineRef, practice]);

  const handleEnd = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.isPlaying) engine.stop();
    engine && (engine.onBeat = null);
    noSleepRef.current?.disable?.();
    onEnd();
  }, [engineRef, noSleepRef, onEnd]);

  const handleTogglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      // Pause: stop audio, preserve {stepIndex, barIndex}; resume will
      // restart at start of current bar (beat 0). beat-mid resume is not
      // supported by the engine.
      engine.stop();
      sawFirstBeatRef.current = false;
      prevBeatRef.current = -1;
      noSleepRef.current?.disable?.();
      setIsPlaying(false);
      return;
    }

    if (complete) {
      // Restart from scratch.
      setStepIndex(0);
      setBarIndex(0);
      stepIndexRef.current = 0;
      barIndexRef.current = 0;
      setComplete(false);
      stoppedRef.current = false;
      engine.setBpm(steps[0]);
    } else {
      // Resume / start: re-assert this step's BPM in case it was changed.
      engine.setBpm(steps[stepIndexRef.current]);
    }

    sawFirstBeatRef.current = false;
    prevBeatRef.current = -1;

    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      // Bar boundary: previous beat was nonzero, current is 0 (wrap).
      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      const nextBarIndex = barIndexRef.current + 1;
      if (nextBarIndex < practice.barsPerStep) {
        barIndexRef.current = nextBarIndex;
        setBarIndex(nextBarIndex);
        return;
      }

      // Step transition.
      const nextStepIndex = stepIndexRef.current + 1;
      if (nextStepIndex >= totalSteps) {
        // Completion.
        stoppedRef.current = true;
        engine.stop();
        engine.onBeat = null;
        noSleepRef.current?.disable?.();
        // Bump bar counter to total so the bar display reads barsPerStep/barsPerStep.
        barIndexRef.current = practice.barsPerStep;
        setBarIndex(practice.barsPerStep);
        setIsPlaying(false);
        setComplete(true);
        return;
      }

      stepIndexRef.current = nextStepIndex;
      barIndexRef.current = 0;
      setStepIndex(nextStepIndex);
      setBarIndex(0);
      engine.setBpm(steps[nextStepIndex]);
      engine.triggerOneShotAccent();
    };

    noSleepRef.current?.enable?.();
    await engine.start();
    setIsPlaying(true);
  }, [engineRef, isPlaying, complete, noSleepRef, practice.barsPerStep, steps, totalSteps]);

  // Stop on unmount.
  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      if (engine?.isPlaying) engine.stop();
      if (engine) engine.onBeat = null;
      noSleepRef.current?.disable?.();
    };
  }, [engineRef, noSleepRef]);

  const currentBpm = complete ? steps[steps.length - 1] : steps[stepIndex];
  const barsCompletedTotal = stepIndex * practice.barsPerStep + barIndex;
  const progressPct = Math.min(100, (barsCompletedTotal / totalBars) * 100);

  return (
    <div className="flex flex-col gap-6 items-center">
      <h2 className="text-2xl font-bold text-gray-800 text-center">{practice.name}</h2>

      <div className="text-6xl font-bold text-gray-900 tabular-nums">{currentBpm}</div>

      <div className="text-sm text-gray-600 flex flex-col items-center gap-1">
        <div>{t('practiceMode.stepProgress', { current: stepIndex + 1, total: totalSteps })}</div>
        <div>{t('practiceMode.barProgress', { current: Math.min(barIndex + (isPlaying ? 1 : 0), practice.barsPerStep), total: practice.barsPerStep })}</div>
      </div>

      <div className="w-full max-w-sm h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {complete ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-lg font-semibold text-green-700">{t('practiceMode.complete')}</div>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {t('practiceMode.done')}
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleTogglePlay}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 min-w-[100px]"
          >
            {isPlaying ? t('practiceMode.pause') : (stepIndex === 0 && barIndex === 0 ? t('practiceMode.start') : t('practiceMode.resume'))}
          </button>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 font-medium hover:bg-gray-300"
          >
            {t('practiceMode.end')}
          </button>
        </div>
      )}
    </div>
  );
}
