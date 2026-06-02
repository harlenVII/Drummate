import { useLiveQuery } from './useLiveQuery';
import { getItems, getPractices, getAllNotes, getTodaysLogs } from '../services/database';

export function useLiveData() {
  const items = useLiveQuery(() => getItems(), [], []);
  const practices = useLiveQuery(() => getPractices(), [], []);
  const notes = useLiveQuery(() => getAllNotes(), [], []);
  const totals = useLiveQuery(async () => {
    const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
    const trashed = new Set(allItems.filter((i) => i.trashed).map((i) => i.id));
    const map = {};
    for (const l of logs) if (!trashed.has(l.itemId)) map[l.itemId] = (map[l.itemId] || 0) + l.duration;
    return map;
  }, [], {});
  return { items: items ?? [], practices: practices ?? [], notes: notes ?? [], totals: totals ?? {} };
}
