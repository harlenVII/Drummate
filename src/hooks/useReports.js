import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import {
  db,
  addAdjustmentLog,
  reattributeLogsToDate,
  getLogsByDate,
  getLogsByDateRange,
} from '../services/database';
import { useLiveQuery } from './useLiveQuery';
import {
  getTodayString,
  shiftDate,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getYearStart,
  getYearEnd,
} from '../utils/dateHelpers';

export function useReports({ loadData, onNavigateToSubpage, items = [] }) {
  const { user } = useAuth();
  const backend = useBackend();

  const [reportDate, setReportDate] = useState(getTodayString());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(getTodayString()));
  const [monthStart, setMonthStart] = useState(() => getMonthStart(getTodayString()));
  const [yearStart, setYearStart] = useState(() => getYearStart(getTodayString()));
  const [editTimeModal, setEditTimeModal] = useState(null); // { itemId, itemName, currentSeconds }

  // Reactive log reads: each query re-subscribes when its date anchor changes,
  // and re-emits whenever the underlying practiceLogs rows mutate.
  const reportLogs = useLiveQuery(() => getLogsByDate(reportDate), [reportDate], []);
  const weekLogs = useLiveQuery(
    () => getLogsByDateRange(weekStart, getWeekEnd(weekStart)),
    [weekStart],
    [],
  );
  const monthLogs = useLiveQuery(
    () => getLogsByDateRange(monthStart, getMonthEnd(monthStart)),
    [monthStart],
    [],
  );
  const yearLogs = useLiveQuery(
    () => getLogsByDateRange(yearStart, getYearEnd(yearStart)),
    [yearStart],
    [],
  );

  const handleReportDateChange = useCallback((dateString) => {
    setReportDate(dateString);
  }, []);

  const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
    const logId = await addAdjustmentLog(itemId, deltaSeconds, date);
    await loadData();
    if (user) {
      const log = await db.practiceLogs.get(logId);
      backend.pushLog(log, user.id).catch(console.error);
    }
  }, [loadData, user, backend]);

  const handleEditTime = useCallback((itemId, itemName, currentSeconds) => {
    setEditTimeModal({ itemId, itemName, currentSeconds });
  }, []);

  const handleMergeToYesterday = useCallback(async () => {
    if (!reportLogs || reportLogs.length === 0) return;
    const yesterday = shiftDate(reportDate, -1);
    const logIds = reportLogs.map(l => l.id);
    const updated = await reattributeLogsToDate(logIds, yesterday);
    await loadData();
    if (user) {
      await Promise.all(
        updated.map(log => backend.pushLog(log, user.id).catch(console.error))
      );
    }
  }, [reportLogs, reportDate, loadData, user, backend]);

  const handleAddTime = useCallback((itemId) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      setEditTimeModal({ itemId, itemName: item.name, currentSeconds: 0 });
    }
  }, [items]);

  const handleDayClick = useCallback(
    (dateString) => {
      setReportDate(dateString);
      onNavigateToSubpage('daily');
    },
    [onNavigateToSubpage],
  );

  const handleWeekClick = useCallback(
    (newWeekStart) => {
      setWeekStart(newWeekStart);
      onNavigateToSubpage('weekly');
    },
    [onNavigateToSubpage],
  );

  const handleMonthClick = useCallback(
    (newMonthStart) => {
      setMonthStart(newMonthStart);
      onNavigateToSubpage('monthly');
    },
    [onNavigateToSubpage],
  );

  const handleWeekChange = useCallback((newWeekStart) => {
    setWeekStart(newWeekStart);
  }, []);

  const handleMonthChange = useCallback((newMonthStart) => {
    setMonthStart(newMonthStart);
  }, []);

  const handleYearChange = useCallback((newYearStart) => {
    setYearStart(newYearStart);
  }, []);

  return {
    reportDate, weekStart, weekLogs, monthStart, monthLogs, yearStart, yearLogs,
    reportLogs, editTimeModal, setEditTimeModal,
    handleReportDateChange, handleManualTimeAdjust, handleMergeToYesterday,
    handleEditTime, handleAddTime, handleDayClick, handleWeekClick, handleMonthClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    setReportDate, setWeekStart, setMonthStart, setYearStart,
  };
}
