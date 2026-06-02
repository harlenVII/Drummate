import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import {
  getItems,
  getTodaysLogs,
  getPractices,
  getAllNotes,
  purgeExpiredTrash,
} from '../services/database';
import { getTodayString } from '../utils/dateHelpers';

export function useAppData() {
  const { user } = useAuth();
  const backend = useBackend();

  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [metronomePractices, setMetronomePractices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [goalRefreshKey, setGoalRefreshKey] = useState(0);

  const refreshNotes = useCallback(async () => {
    setNotes(await getAllNotes());
  }, []);

  const loadData = useCallback(async () => {
    const [allItems, logs, practices, allNotes] = await Promise.all([
      getItems(), getTodaysLogs(), getPractices(), getAllNotes(),
    ]);
    setItems(allItems);
    setMetronomePractices(practices);
    setNotes(allNotes);
    const trashedIds = new Set(allItems.filter(i => i.trashed).map(i => i.id));
    const totalsMap = {};
    for (const log of logs) {
      if (!trashedIds.has(log.itemId)) {
        totalsMap[log.itemId] = (totalsMap[log.itemId] || 0) + log.duration;
      }
    }
    setTotals(totalsMap);
    setGoalRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const purge = async () => {
      const { expiredItems, expiredNotes } = await purgeExpiredTrash();
      if (expiredItems.length > 0 || expiredNotes.length > 0) {
        await loadData();
        if (user) {
          for (const item of expiredItems) {
            backend.pushDeleteItem(item.uid, user.id).catch(console.error);
          }
          for (const note of expiredNotes) {
            backend.deleteNoteRemote(note.uid, user.id).catch(console.error);
          }
        }
      }
    };
    purge();
  }, [loadData, user, backend]);

  // Refresh practice data when the calendar day changes (app left open past midnight)
  useEffect(() => {
    let currentDay = getTodayString();

    const checkDayChange = () => {
      const now = getTodayString();
      if (now !== currentDay) {
        currentDay = now;
        loadData();
      }
    };

    // Check every 30 seconds for a day change
    const id = setInterval(checkDayChange, 30_000);

    // Also refresh when the tab becomes visible again (e.g. phone unlocked next morning)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDayChange();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadData]);

  return {
    items, setItems,
    totals, setTotals,
    metronomePractices, setMetronomePractices,
    notes, setNotes,
    goalRefreshKey,
    loadData, refreshNotes,
  };
}
