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
  const [reportLogs, setReportLogs] = useState([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(getTodayString()));
  const [weekLogs, setWeekLogs] = useState([]);
  const [monthStart, setMonthStart] = useState(() => getMonthStart(getTodayString()));
  const [monthLogs, setMonthLogs] = useState([]);
  const [yearStart, setYearStart] = useState(() => getYearStart(getTodayString()));
  const [yearLogs, setYearLogs] = useState([]);
  const [editTimeModal, setEditTimeModal] = useState(null); // { itemId, itemName, currentSeconds }

  const loadReportData = useCallback(async (dateString) => {
    const logs = await getLogsByDate(dateString);
    setReportLogs(logs);
  }, []);

  const loadWeekData = useCallback(async (weekStartStr) => {
    const weekEndStr = getWeekEnd(weekStartStr);
    const logs = await getLogsByDateRange(weekStartStr, weekEndStr);
    setWeekLogs(logs);
  }, []);

  const loadMonthData = useCallback(async (monthStartStr) => {
    const monthEndStr = getMonthEnd(monthStartStr);
    const logs = await getLogsByDateRange(monthStartStr, monthEndStr);
    setMonthLogs(logs);
  }, []);

  const loadYearData = useCallback(async (yearStartStr) => {
    const yearEndStr = getYearEnd(yearStartStr);
    const logs = await getLogsByDateRange(yearStartStr, yearEndStr);
    setYearLogs(logs);
  }, []);

  const handleReportDateChange = useCallback(
    async (dateString) => {
      setReportDate(dateString);
      await loadReportData(dateString);
    },
    [loadReportData],
  );

  const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
    const logId = await addAdjustmentLog(itemId, deltaSeconds, date);
    await Promise.all([
      loadReportData(date),
      loadWeekData(weekStart),
      loadMonthData(monthStart),
      loadYearData(yearStart),
      loadData(),
    ]);
    if (user) {
      const log = await db.practiceLogs.get(logId);
      backend.pushLog(log, user.id).catch(console.error);
    }
  }, [loadReportData, loadWeekData, loadMonthData, loadYearData, weekStart, monthStart, yearStart, loadData, user, backend]);

  const handleEditTime = useCallback((itemId, itemName, currentSeconds) => {
    setEditTimeModal({ itemId, itemName, currentSeconds });
  }, []);

  const handleMergeToYesterday = useCallback(async () => {
    if (!reportLogs || reportLogs.length === 0) return;
    const yesterday = shiftDate(reportDate, -1);
    const logIds = reportLogs.map(l => l.id);
    const updated = await reattributeLogsToDate(logIds, yesterday);
    await Promise.all([
      loadReportData(reportDate),
      loadWeekData(weekStart),
      loadMonthData(monthStart),
      loadYearData(yearStart),
      loadData(),
    ]);
    if (user) {
      await Promise.all(
        updated.map(log => backend.pushLog(log, user.id).catch(console.error))
      );
    }
  }, [reportLogs, reportDate, loadReportData, loadWeekData, loadMonthData, loadYearData, weekStart, monthStart, yearStart, loadData, user, backend]);

  const handleAddTime = useCallback((itemId) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      setEditTimeModal({ itemId, itemName: item.name, currentSeconds: 0 });
    }
  }, [items]);

  const handleDayClick = useCallback(
    async (dateString) => {
      setReportDate(dateString);
      onNavigateToSubpage('daily');
      await loadReportData(dateString);
    },
    [loadReportData, onNavigateToSubpage],
  );

  const handleWeekClick = useCallback(
    async (newWeekStart) => {
      setWeekStart(newWeekStart);
      onNavigateToSubpage('weekly');
      await loadWeekData(newWeekStart);
    },
    [loadWeekData, onNavigateToSubpage],
  );

  const handleMonthClick = useCallback(
    async (newMonthStart) => {
      setMonthStart(newMonthStart);
      onNavigateToSubpage('monthly');
      await loadMonthData(newMonthStart);
    },
    [loadMonthData, onNavigateToSubpage],
  );

  const handleWeekChange = useCallback(async (newWeekStart) => {
    setWeekStart(newWeekStart);
    await loadWeekData(newWeekStart);
  }, [loadWeekData]);

  const handleMonthChange = useCallback(async (newMonthStart) => {
    setMonthStart(newMonthStart);
    await loadMonthData(newMonthStart);
  }, [loadMonthData]);

  const handleYearChange = useCallback(async (newYearStart) => {
    setYearStart(newYearStart);
    await loadYearData(newYearStart);
  }, [loadYearData]);

  return {
    reportDate, weekStart, weekLogs, monthStart, monthLogs, yearStart, yearLogs,
    reportLogs, editTimeModal, setEditTimeModal,
    loadReportData, loadWeekData, loadMonthData, loadYearData,
    handleReportDateChange, handleManualTimeAdjust, handleMergeToYesterday,
    handleEditTime, handleAddTime, handleDayClick, handleWeekClick, handleMonthClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    setReportDate, setWeekStart, setMonthStart, setYearStart,
    setReportLogs, setWeekLogs, setMonthLogs, setYearLogs,
  };
}
