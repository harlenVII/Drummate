import { useState, useEffect } from 'react';
import { useLiveQuery } from './useLiveQuery';
import { useTimezone } from './useTimezone';
import { getItems, getPractices, getAllNotes, getTodaysLogs } from '../services/database';
import { getTodayString } from '../utils/dateHelpers';

export function useLiveData() {
  const items = useLiveQuery(() => getItems(), [], []);
  const practices = useLiveQuery(() => getPractices(), [], []);
  const notes = useLiveQuery(() => getAllNotes(), [], []);

  // `getTodaysLogs()` derives its window from the current calendar day and home
  // timezone — neither of which is a Dexie write, so liveQuery alone won't
  // re-run the totals query when the day rolls over (app left open past
  // midnight) or when the user changes their timezone. We track a `today`
  // string and the reactive `tz` (shared timezoneService pub/sub) and feed both
  // into the totals query deps so it re-subscribes (and re-buckets) on those
  // changes.
  const [today, setToday] = useState(getTodayString());
  const tz = useTimezone();

  // Detect a calendar-day change (moved here from useAppData): re-bucket
  // "today's" totals after midnight or when the tab becomes visible again.
  useEffect(() => {
    const checkDayChange = () => {
      const now = getTodayString();
      setToday((prev) => (prev !== now ? now : prev));
    };
    const id = setInterval(checkDayChange, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkDayChange();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const totals = useLiveQuery(async () => {
    const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
    const trashed = new Set(allItems.filter((i) => i.trashed).map((i) => i.id));
    const map = {};
    for (const l of logs) if (!trashed.has(l.itemId)) map[l.itemId] = (map[l.itemId] || 0) + l.duration;
    return map;
  }, [today, tz], {});

  return {
    items: items ?? [],
    practices: practices ?? [],
    notes: notes ?? [],
    totals: totals ?? {},
  };
}
