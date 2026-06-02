import { useState, useEffect, useCallback, useRef } from 'react';
import { getTodayString, getWeekStart, getMonthStart, getYearStart } from '../utils/dateHelpers';

export function useNavigation({ reports, metronome, practices }) {
  // reports: { setReportDate, setWeekStart, setMonthStart, setYearStart,
  //            reportDate, weekStart, monthStart, yearStart }
  // metronome: { engineRef, noSleepRef, isPlaying, setIsPlaying, setCurrentBeat,
  //              setSequencerPlayingSlot, setMultiMeterPlayingSlot }
  // practices: { runningPracticeUid, setRunningPracticeUid,
  //              setPracticeRunStepIndex, setPracticeRunBarIndex,
  //              setPracticeRunIsPlaying, setPracticeRunComplete }

  const [activeTab, setActiveTab] = useState('practice');
  const activeTabRef = useRef('practice');

  const [reportSubpage, setReportSubpage] = useState('daily');
  const reportSubpageRef = useRef('daily');

  const [metronomeSubpage, setMetronomeSubpage] = useState('metronome');
  // 'metronome' | 'sequencer' | 'practice'
  const metronomeSubpageRef = useRef('metronome');

  const [notesSubpage, setNotesSubpage] = useState('byDate');
  const notesSubpageRef = useRef('byDate');

  const reportDateRef = useRef(getTodayString());
  const weekStartRef = useRef(getWeekStart(getTodayString()));
  const monthStartRef = useRef(getMonthStart(getTodayString()));
  const yearStartRef = useRef(getYearStart(getTodayString()));

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { reportSubpageRef.current = reportSubpage; }, [reportSubpage]);
  useEffect(() => { metronomeSubpageRef.current = metronomeSubpage; }, [metronomeSubpage]);
  useEffect(() => { notesSubpageRef.current = notesSubpage; }, [notesSubpage]);
  useEffect(() => { reportDateRef.current = reports.reportDate; }, [reports.reportDate]);
  useEffect(() => { weekStartRef.current = reports.weekStart; }, [reports.weekStart]);
  useEffect(() => { monthStartRef.current = reports.monthStart; }, [reports.monthStart]);
  useEffect(() => { yearStartRef.current = reports.yearStart; }, [reports.yearStart]);

  const handleTabChange = useCallback(
    async (tab) => {
      setActiveTab(tab);
      if (tab === 'report') {
        const today = getTodayString();
        const wStart = getWeekStart(today);
        const mStart = getMonthStart(today);
        const yStart = getYearStart(today);
        // Setting the anchors re-subscribes each report liveQuery to "today".
        reports.setReportDate(today);
        reports.setWeekStart(wStart);
        reports.setMonthStart(mStart);
        reports.setYearStart(yStart);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports.setReportDate, reports.setWeekStart, reports.setMonthStart, reports.setYearStart],
  );

  const handleSubpageChange = useCallback(
    (subpage) => {
      if (metronome.isPlaying) {
        metronome.engineRef.current.stop();
        metronome.engineRef.current.setSequence(null);
        metronome.engineRef.current.setMeterTrack(null);
        metronome.setIsPlaying(false);
        metronome.setCurrentBeat(-1);
        metronome.setSequencerPlayingSlot(-1);
        metronome.setMultiMeterPlayingSlot(-1);
        metronome.noSleepRef.current.disable();
      }
      // Always restore the App-level beat callback — practice mode overrides it
      // and may null it on end/pause, leaving the indicators dead if not re-wired.
      if (metronome.engineRef.current) {
        metronome.engineRef.current.onBeat = ({ beat, subdivisionIndex }) => {
          if (subdivisionIndex === 0) metronome.setCurrentBeat(beat);
        };
      }
      if (practices.runningPracticeUid) {
        if (metronome.engineRef.current?.isPlaying) {
          metronome.engineRef.current.stop();
        }
        metronome.noSleepRef.current?.disable?.();
        practices.setRunningPracticeUid(null);
        practices.setPracticeRunStepIndex(0);
        practices.setPracticeRunBarIndex(0);
        practices.setPracticeRunIsPlaying(false);
        practices.setPracticeRunComplete(false);
      }
      setMetronomeSubpage(subpage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metronome.isPlaying, practices.runningPracticeUid],
  );

  return {
    activeTab, setActiveTab, activeTabRef,
    metronomeSubpage, setMetronomeSubpage, metronomeSubpageRef,
    reportSubpage, setReportSubpage, reportSubpageRef,
    notesSubpage, setNotesSubpage, notesSubpageRef,
    reportDateRef, weekStartRef, monthStartRef, yearStartRef,
    handleTabChange, handleSubpageChange,
  };
}
