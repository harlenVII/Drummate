import { useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

function NotesByItem({ items, notes, onEdit, compactMode = false }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(() => new Set());

  const notesByItemUid = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      if (!map.has(n.itemUid)) map.set(n.itemUid, []);
      map.get(n.itemUid).push(n);
    }
    return map;
  }, [notes]);

  const activeItems = useMemo(
    () => items.filter(i => !i.trashed).sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const sections = useMemo(() => {
    return {
      fundamentals: activeItems.filter(i => (i.category ?? 'fundamentals') === 'fundamentals'),
      songs: activeItems.filter(i => i.category === 'songs'),
    };
  }, [activeItems]);

  const toggle = (uid) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const renderItem = (item) => {
    const itemNotes = notesByItemUid.get(item.uid) || [];
    const isOpen = expanded.has(item.uid);
    const mostRecent = itemNotes[0];
    return (
      <div key={item.uid} className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md' : 'rounded-lg'}`}>
        <button
          onClick={() => toggle(item.uid)}
          className={`w-full flex items-center justify-between ${compactMode ? 'px-2 py-1' : 'px-3 py-2'} hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors`}
        >
          <span className="font-medium text-gray-800 dark:text-slate-100 text-left">{item.name}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {itemNotes.length}
          </span>
        </button>
        {!isOpen && mostRecent && (
          <button
            onClick={() => onEdit(mostRecent)}
            className={`w-full text-left border-t border-gray-100 dark:border-slate-800 ${compactMode ? 'px-2 py-1' : 'px-3 py-2'} hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors`}
          >
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">{mostRecent.date}</p>
            <p className="text-sm text-gray-800 dark:text-slate-100 whitespace-pre-wrap break-words line-clamp-2">
              {mostRecent.body}
            </p>
          </button>
        )}
        {isOpen && (
          <div className={`border-t border-gray-100 dark:border-slate-800 ${compactMode ? 'px-2 py-1' : 'px-3 py-2'} flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
            {itemNotes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 py-2">{t('notes.emptyByItem')}</p>
            ) : (
              itemNotes.map(note => (
                <button
                  key={note.id}
                  onClick={() => onEdit(note)}
                  className="text-left rounded p-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">{note.date.replace(/-/g, '/')}</p>
                  <p className="text-sm text-gray-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                    {note.body}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (activeItems.length === 0) {
    return (
      <p className="text-gray-500 dark:text-slate-400 text-center py-12">{t('notes.noActiveItems')}</p>
    );
  }

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
      {sections.fundamentals.length > 0 && (
        <section className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide px-1">
            {t('categories.fundamentals')}
          </h3>
          {sections.fundamentals.map(renderItem)}
        </section>
      )}
      {sections.songs.length > 0 && (
        <section className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide px-1">
            {t('categories.songs')}
          </h3>
          {sections.songs.map(renderItem)}
        </section>
      )}
    </div>
  );
}

export default NotesByItem;
