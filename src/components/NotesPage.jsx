import { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useBackend } from '../contexts/BackendContext';
import { daysUntilPurge } from '../utils/dateHelpers';
import NotesByDate from './NotesByDate';
import NotesByItem from './NotesByItem';
import NoteEditModal from './NoteEditModal';
import {
  addNote, updateNote, trashNote, restoreNote, getTrashedNotes, purgeNote, db,
} from '../services/database';

function NotesPage({
  items,
  user,
  defaultItemUid,
  notesSubpage,
  onSubpageChange,
  notes,
  compactMode = false,
}) {
  const { t } = useLanguage();
  const backend = useBackend();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState([]);

  useEffect(() => {
    getTrashedNotes()
      .then(setTrashedNotes)
      .catch((err) => console.error('getTrashedNotes failed:', err));
  }, [showTrash, notes]);

  const handleCreate = useCallback(async ({ itemUid, date, body }) => {
    const localId = await addNote(itemUid, body, date);
    // notes are reactive (liveQuery in App) — the Dexie write above propagates.
    if (user) {
      const note = await db.notes.get(localId);
      backend.pushNote(note, user.id).catch(console.error);
    }
  }, [user, backend]);

  const handleEdit = useCallback(async ({ body }) => {
    if (!editingNote) return;
    await updateNote(editingNote.id, body);
    if (user) {
      const note = await db.notes.get(editingNote.id);
      backend.pushNote(note, user.id).catch(console.error);
    }
  }, [editingNote, user, backend]);

  const handleDelete = useCallback(async () => {
    if (!editingNote) return;
    await trashNote(editingNote.id);
    if (user) {
      const note = await db.notes.get(editingNote.id);
      backend.pushNote(note, user.id).catch(console.error);
    }
  }, [editingNote, user, backend]);

  const handleRestore = useCallback(async (note) => {
    await restoreNote(note.id);
    setTrashedNotes(prev => prev.filter(n => n.id !== note.id));
    if (user) {
      const updated = await db.notes.get(note.id);
      backend.pushNote(updated, user.id).catch(console.error);
    }
  }, [user, backend]);

  const handlePermanentDelete = useCallback(async (note) => {
    if (!window.confirm(t('notes.confirmPermanentDelete'))) return;
    await purgeNote(note.id);
    setTrashedNotes(prev => prev.filter(n => n.id !== note.id));
    if (user) {
      backend.deleteNoteRemote(note.uid, user.id).catch(console.error);
    }
  }, [user, backend, t]);

  const openCreate = () => {
    setEditingNote(null);
    setModalOpen(true);
  };

  const openEdit = (note) => {
    setEditingNote(note);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingNote(null);
  };

  return (
    <>
      <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
        {[
          { key: 'byDate', label: t('notes.subpageByDate') },
          { key: 'byItem', label: t('notes.subpageByItem') },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSubpageChange(key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              notesSubpage === key
                ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 shadow-sm'
                : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={openCreate}
        className={`self-start ${compactMode ? 'px-3 py-1' : 'px-4 py-2'} bg-blue-600 dark:bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors`}
      >
        {t('notes.addButton')}
      </button>

      {notesSubpage === 'byDate' ? (
        <NotesByDate items={items} notes={notes} onEdit={openEdit} compactMode={compactMode} />
      ) : (
        <NotesByItem items={items} notes={notes} onEdit={openEdit} compactMode={compactMode} />
      )}

      {modalOpen && (
        <NoteEditModal
          note={editingNote}
          items={items}
          defaultItemUid={defaultItemUid}
          onSave={editingNote ? handleEdit : handleCreate}
          onDelete={editingNote ? handleDelete : null}
          onClose={closeModal}
        />
      )}

      {(trashedNotes.length > 0 || showTrash) && (
        <div className="mt-2">
          <button
            onClick={() => setShowTrash(prev => !prev)}
            className="px-3 py-1 text-sm text-red-500 border border-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            {showTrash ? t('notes.hideTrash') : t('notes.showTrash', { count: trashedNotes.length })}
          </button>

          {showTrash && (
            <div className="flex flex-col gap-2 mt-3">
              {trashedNotes.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-2">{t('notes.emptyTrash')}</p>
              )}
              {trashedNotes.map((note) => {
                const daysLeft = daysUntilPurge(note.trashedAt);
                const itemName = items.find(i => i.uid === note.itemUid)?.name ?? t('notes.itemDeleted');
                const preview = note.body.length > 80 ? note.body.slice(0, 80) + '…' : note.body;
                return (
                  <div key={note.id} className={`bg-white dark:bg-slate-800 shadow-sm flex items-center opacity-50 ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-gray-500 dark:text-slate-400">{note.date.replace(/-/g, '/')} · {itemName}</span>
                        <span className="text-sm text-gray-700 dark:text-slate-200 truncate">{preview}</span>
                        <span className="text-xs text-red-400">{t('daysLeft', { days: daysLeft })}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRestore(note)}
                          className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                          title={t('restore')}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414zm0-6a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(note)}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title={t('permanentDelete')}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default NotesPage;
