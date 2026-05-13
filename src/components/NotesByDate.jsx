import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getAllNotes } from '../services/database';
import { getTodayString, shiftDate, formatDateLabel } from '../utils/dateHelpers';

const PAGE_SIZE = 30;

function NotesByDate({ items, refreshKey, onEdit }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getAllNotes();
      if (!cancelled) setNotes(all);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
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
      <p className="text-gray-500 text-center py-12">{t('notes.emptyByDate')}</p>
    );
  }

  const visibleGroups = groups.slice(0, visibleCount);
  const hasMore = visibleCount < groups.length;

  return (
    <div className="flex flex-col gap-6">
      {visibleGroups.map(([date, notesForDate]) => (
        <section key={date}>
          <h3 className="text-sm font-semibold text-gray-500 mb-2 sticky top-0 bg-gray-100 py-1">
            {dateHeader(date)}
          </h3>
          <div className="flex flex-col gap-2">
            {notesForDate.map(note => {
              const itemName = itemNameByUid.get(note.itemUid);
              return (
                <button
                  key={note.id}
                  onClick={() => onEdit(note)}
                  className="text-left bg-white rounded-lg shadow-sm p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      {itemName}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
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
          className="self-center px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('notes.loadMore')}
        </button>
      )}
    </div>
  );
}

export default NotesByDate;
