import { useEffect, useRef, useCallback, useState } from 'react';
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
  // Run state lifted to App.jsx so it survives tab switches.
  stepIndex,
  barIndex,
  isPlaying,
  complete,
  setStepIndex,
  setBarIndex,
  setIsPlaying,
  setComplete,
}) {
  const { t } = useLanguage();
  const steps = computeSteps(practice.startBpm, practice.endBpm, practice.bpmIncrement);
  const totalSteps = steps.length;
  const totalBars = totalSteps * practice.barsPerStep;

  // Refs mirror state for use inside the onBeat callback (which closes over
  // its initial values).
  const stepIndexRef = useRef(stepIndex);
  const barIndexRef = useRef(barIndex);
  // Track previous beat number so we can detect bar boundaries (beat wraps 0).
  const prevBeatRef = useRef(-1);
  // Suppress the initial beat=0 firing on start (which would falsely count as
  // a completed bar before any bar has actually played).
  const sawFirstBeatRef = useRef(false);
  // Prevent the onBeat handler from firing twice after engine.stop() is
  // called for completion.
  const stoppedRef = useRef(complete);

  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBarsLeft, setCountInBarsLeft] = useState(2);
  const isCountingInRef = useRef(false);
  const countInBarsLeftRef = useRef(2);
  // True once the first count-in has fired; stays true for the component lifetime
  // so that resume-after-pause never re-triggers the count-in.
  const hasBegunRef = useRef(false);

  // Keep refs in sync with lifted state.
  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);
  useEffect(() => { barIndexRef.current = barIndex; }, [barIndex]);
  useEffect(() => { stoppedRef.current = complete; }, [complete]);

  // Configure engine for this practice's settings on mount.
  // On remount after a tab switch, re-assert the current step's BPM so the
  // engine stays in sync even if we switched back while it was playing.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const currentBpm = complete ? steps[steps.length - 1] : steps[stepIndexRef.current];
    engine.setBpm(currentBpm);
    engine.setBeatsPerMeasure(practice.timeSignature.beats);
    const sub = SUBDIVISIONS.find((s) => s.key === practice.subdivision);
    engine.setSubdivision(sub && sub.pattern ? sub.pattern : [0]);
    engine.setSoundType(practice.soundType);
    engine.setSequence(null);
    engine.setAccentFirstBeat(true);
  }, [engineRef, practice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-attach the onBeat handler when the engine is playing and we remount
  // (e.g. after a tab switch). Without this the bar/step counters would not
  // advance after returning to the metronome tab mid-practice.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isPlaying || complete) return;

    // Re-install the beat handler so counters work after a remount.
    sawFirstBeatRef.current = false;
    prevBeatRef.current = -1;

    engine.onBeat = ({ beat }) => {
      if (stoppedRef.current) return;

      if (!sawFirstBeatRef.current) {
        sawFirstBeatRef.current = true;
        prevBeatRef.current = beat;
        return;
      }

      const isBarBoundary = beat === 0 && prevBeatRef.current !== 0;
      prevBeatRef.current = beat;
      if (!isBarBoundary) return;

      // Count-in: decrement and wait for it to finish before tracking practice bars.
      if (isCountingInRef.current) {
        const barsLeft = countInBarsLeftRef.current - 1;
        countInBarsLeftRef.current = barsLeft;
        setCountInBarsLeft(barsLeft);
        if (barsLeft > 0) return;
        isCountingInRef.current = false;
        setIsCountingIn(false);
        return;
      }

      const nextBarIndex = barIndexRef.current + 1;
      if (nextBarIndex < practice.barsPerStep) {
        barIndexRef.current = nextBarIndex;
        setBarIndex(nextBarIndex);
        return;
      }

      const nextStepIndex = stepIndexRef.current + 1;
      if (nextStepIndex >= totalSteps) {
        stoppedRef.current = true;
        engine.stop();
        engine.onBeat = null;
        noSleepRef.current?.disable?.();
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
    // Intentionally not listing every dep — this effect only needs to
    // re-run when isPlaying flips to true (i.e. on remount while playing).
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

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
      engine.onBeat = null;
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
      hasBegunRef.current = false;
    } else {
      // Resume / start: re-assert this step's BPM in case it was changed.
      engine.setBpm(steps[stepIndexRef.current]);
    }

    // Trigger 2-bar count-in on fresh start or restart; skip on resume after pause.
    if (!hasBegunRef.current) {
      hasBegunRef.current = true;
      isCountingInRef.current = true;
      countInBarsLeftRef.current = 2;
      setIsCountingIn(true);
      setCountInBarsLeft(2);
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

      // Count-in: decrement and wait for it to finish before tracking practice bars.
      if (isCountingInRef.current) {
        const barsLeft = countInBarsLeftRef.current - 1;
        countInBarsLeftRef.current = barsLeft;
        setCountInBarsLeft(barsLeft);
        if (barsLeft > 0) return;
        isCountingInRef.current = false;
        setIsCountingIn(false);
        return;
      }

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
  }, [engineRef, isPlaying, complete, noSleepRef, practice.barsPerStep, steps, totalSteps,
      setStepIndex, setBarIndex, setIsPlaying, setComplete]);

  // Clean up onBeat on unmount only — do NOT stop the engine so that audio
  // keeps playing when the user switches away from the metronome tab.
  // The engine is explicitly stopped by handleEnd and handleSubpageChange.
  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      // Only clear the callback when the engine is not playing; stopping is
      // handled by explicit actions (handleEnd / handleSubpageChange).
      if (engine && !engine.isPlaying) {
        engine.onBeat = null;
      }
    };
  }, [engineRef]);

  // Space bar: toggle play/pause while practice is active
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !complete) {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, complete]);

  const currentBpm = complete ? steps[steps.length - 1] : steps[stepIndex];
  // Time-based progress: weight each bar by 1/bpm so slower tempos contribute
  // proportionally more time — progress advances at a steady real-time rate.
  const stepDurations = steps.map((bpm) => practice.barsPerStep / bpm);
  const totalTime = stepDurations.reduce((a, b) => a + b, 0);
  const elapsedTime =
    stepDurations.slice(0, stepIndex).reduce((a, b) => a + b, 0) +
    barIndex / steps[stepIndex];
  const progressPct = Math.min(100, (elapsedTime / totalTime) * 100);

  return (
    <div className="flex flex-col gap-6 items-center">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 text-center">{practice.name}</h2>

      <div className="text-6xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">{currentBpm}</div>

      {isCountingIn ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-widest">
            {t('practiceMode.getReady')}
          </div>
          <div className="text-7xl font-bold text-blue-600 dark:text-indigo-600 tabular-nums">
            {countInBarsLeft}
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-600 dark:text-slate-400 flex flex-col items-center gap-1">
            <div>{t('practiceMode.stepProgress', { current: stepIndex + 1, total: totalSteps })}</div>
            <div>{t('practiceMode.barProgress', { current: Math.min(barIndex + 1, practice.barsPerStep), total: practice.barsPerStep })}</div>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-1">
            <div className="flex justify-end">
              <span className="text-sm font-semibold text-blue-600 dark:text-indigo-600">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-indigo-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </>
      )}

      {complete ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-lg font-semibold text-green-700">{t('practiceMode.complete')}</div>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-blue-600 dark:bg-indigo-600 text-white font-medium hover:bg-blue-700 dark:hover:bg-indigo-700"
          >
            {t('practiceMode.done')}
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleTogglePlay}
            className="px-6 py-2 rounded-lg bg-blue-600 dark:bg-indigo-600 text-white font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 min-w-[100px]"
          >
            {isPlaying ? t('practiceMode.pause') : (stepIndex === 0 && barIndex === 0 ? t('practiceMode.start') : t('practiceMode.resume'))}
          </button>
          <button
            onClick={handleEnd}
            className="px-6 py-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-slate-100 font-medium hover:bg-gray-300 dark:hover:bg-slate-600"
          >
            {t('practiceMode.end')}
          </button>
        </div>
      )}
    </div>
  );
}
