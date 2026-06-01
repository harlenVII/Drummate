import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString, shiftDate, getWeekStart, getMonthStart, getYearStart } from '../utils/dateHelpers';

export function useKeyboardShortcuts({
  activeItemIdRef,
  nav,        // { activeTabRef, metronomeSubpageRef, reportSubpageRef, notesSubpageRef,
              //   reportDateRef, weekStartRef, monthStartRef, yearStartRef,
              //   handleTabChange, handleSubpageChange, setReportSubpage, setNotesSubpage }
  reports,    // { handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange }
  setTimeUnit, setTheme, setMetronomeAccentFirstBeat,
  saveAndStop,
}) {
  const { language, toggleLanguage } = useLanguage();
  const languageRef = useRef(language);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  useEffect(() => { languageRef.current = language; }, [language]);

  // Global shortcuts: 1 = Practice, 2 = Metronome, 3 = Report, m = minutes, h = hours
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Digit1') nav.handleTabChange('practice');
      else if (e.code === 'Digit2') nav.handleTabChange('metronome');
      else if (e.code === 'Digit3') nav.handleTabChange('report');
      else if (e.code === 'Digit4') nav.handleTabChange('notes');
      else if (e.code === 'KeyM') setTimeUnit('minutes');
      else if (e.code === 'KeyH') setTimeUnit('hours');
      else if (e.code === 'KeyE') { if (languageRef.current !== 'en') toggleLanguage(); }
      else if (e.code === 'KeyC') { if (languageRef.current !== 'zh') toggleLanguage(); }
      else if (e.code === 'KeyL') setTheme('light');
      else if (e.code === 'KeyD') setTheme('dark');
      else if (e.code === 'KeyS') {
        if (activeItemIdRef.current != null) saveAndStop();
      }
      else if (e.code === 'KeyA') {
        if (nav.activeTabRef.current === 'metronome') setMetronomeAccentFirstBeat(prev => !prev);
      }
      else if (e.key === '?') setShowKeyboardHelp(prev => !prev);
      else if (e.key === 'Tab') {
        if (nav.activeTabRef.current === 'metronome') {
          e.preventDefault();
          const pages = ['metronome', 'practice', 'sequencer', 'multiMeter'];
          const idx = pages.indexOf(nav.metronomeSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          nav.handleSubpageChange(next);
        } else if (nav.activeTabRef.current === 'report') {
          e.preventDefault();
          const pages = ['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'];
          const idx = pages.indexOf(nav.reportSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          nav.setReportSubpage(next);
        } else if (nav.activeTabRef.current === 'notes') {
          e.preventDefault();
          const pages = ['byDate', 'byItem'];
          const idx = pages.indexOf(nav.notesSubpageRef.current);
          const next = e.shiftKey
            ? pages[(idx - 1 + pages.length) % pages.length]
            : pages[(idx + 1) % pages.length];
          nav.setNotesSubpage(next);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (nav.activeTabRef.current === 'report') {
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          const subpage = nav.reportSubpageRef.current;
          const today = getTodayString();
          if (subpage === 'daily') {
            e.preventDefault();
            const newDate = shiftDate(nav.reportDateRef.current, dir);
            if (newDate <= today) reports.handleReportDateChange(newDate);
          } else if (subpage === 'weekly') {
            e.preventDefault();
            const newWeekStart = getWeekStart(shiftDate(nav.weekStartRef.current, dir * 7));
            if (newWeekStart <= getWeekStart(today)) reports.handleWeekChange(newWeekStart);
          } else if (subpage === 'monthly') {
            e.preventDefault();
            const newMonthStart = dir === -1
              ? getMonthStart(shiftDate(nav.monthStartRef.current, -1))
              : getMonthStart(shiftDate(nav.monthStartRef.current, 32));
            if (newMonthStart <= getMonthStart(today)) reports.handleMonthChange(newMonthStart);
          } else if (subpage === 'yearly') {
            e.preventDefault();
            const newYearStart = dir === -1
              ? getYearStart(shiftDate(nav.yearStartRef.current, -1))
              : getYearStart(shiftDate(nav.yearStartRef.current, 366));
            if (newYearStart <= getYearStart(today)) reports.handleYearChange(newYearStart);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.handleTabChange, nav.handleSubpageChange, nav.setReportSubpage, reports.handleReportDateChange, reports.handleWeekChange, reports.handleMonthChange, reports.handleYearChange, toggleLanguage, saveAndStop, setTheme, setMetronomeAccentFirstBeat, setTimeUnit]);

  return { showKeyboardHelp, setShowKeyboardHelp };
}
