import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getAllNotes } from '../services/database';
import { getTodayString, shiftDate, formatDateLabel } from '../utils/dateHelpers';

const PAGE_SIZE = 20; // note count threshold per page

function NotesByDate({ items, refreshKey, onEdit, compactMode = false }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    setVisibleCount(PAGE_SIZE);
    (async () => {
      const all = await getAllNotes();
      if (!cancelled) setNotes(all);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const itemNameByUid = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.trashed) map.set(it.uid, it.name);
    }
    return map;
  }, [items]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const n of notes) {
      if (!itemNameByUid.has(n.itemUid)) continue;
      if (!byDate.has(n.date)) byDate.set(n.date, []);
      byDate.get(n.date).push(n);
    }
    return Array.from(byDate.entries()); // already in date-desc order from getAllNotes
  }, [notes, itemNameByUid]);

  const dateHeader = (dateStr) => {
    const today = getTodayString();
    if (dateStr === today) return t('notes.todayLabel');
    if (dateStr === shiftDate(today, -1)) return t('notes.yesterdayLabel');
    return formatDateLabel(dateStr, t);
  };

  if (groups.length === 0) {
    return (
      <p className="text-gray-500 dark:text-slate-400 text-center py-12">{t('notes.emptyByDate')}</p>
    );
  }

  // Walk groups accumulating note counts; always complete the last date group
  let notesSeen = 0;
  let cutoff = groups.length;
  for (let i = 0; i < groups.length; i++) {
    notesSeen += groups[i][1].length;
    if (notesSeen >= visibleCount) { cutoff = i + 1; break; }
  }
  const visibleGroups = groups.slice(0, cutoff);
  const hasMore = cutoff < groups.length;

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-3' : 'gap-6'}`}>
      {visibleGroups.map(([date, notesForDate]) => (
        <section key={date}>
          <h3 className={`text-sm font-semibold text-gray-500 dark:text-slate-400 ${compactMode ? 'mb-1' : 'mb-2'} sticky top-0 bg-gray-100 dark:bg-slate-900 py-1`}>
            {dateHeader(date)}
          </h3>
          <div className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
            {notesForDate.map(note => {
              const itemName = itemNameByUid.get(note.itemUid);
              return (
                <button
                  key={note.id}
                  onClick={() => onEdit(note)}
                  className={`text-left bg-white dark:bg-slate-800 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-3'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 dark:bg-indigo-100 text-blue-700 dark:text-indigo-700 rounded-full">
                      {itemName}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                    {note.body}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(n => n + PAGE_SIZE)}
          className="self-center px-4 py-2 text-sm text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          {t('notes.loadMore')}
        </button>
      )}
    </div>
  );
}

export default NotesByDate;
