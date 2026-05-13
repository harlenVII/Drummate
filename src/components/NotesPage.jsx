import { useState, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import NotesByDate from './NotesByDate';
import NotesByItem from './NotesByItem';
import NoteEditModal from './NoteEditModal';
import {
  addNote, updateNote, trashNote, db,
} from '../services/database';

function NotesPage({
  items,
  user,
  firebaseBackend,
  defaultItemUid,
  notesSubpage,
  onSubpageChange,
}) {
  const { t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleCreate = useCallback(async ({ itemUid, date, body }) => {
    const localId = await addNote(itemUid, body, date);
    bumpRefresh();
    if (user) {
      const note = await db.notes.get(localId);
      firebaseBackend.pushNote(note, user.id).catch(console.error);
    }
  }, [user, firebaseBackend, bumpRefresh]);

  const handleEdit = useCallback(async ({ body }) => {
    if (!editingNote) return;
    await updateNote(editingNote.id, body);
    bumpRefresh();
    if (user) {
      const note = await db.notes.get(editingNote.id);
      firebaseBackend.pushNote(note, user.id).catch(console.error);
    }
  }, [editingNote, user, firebaseBackend, bumpRefresh]);

  const handleDelete = useCallback(async () => {
    if (!editingNote) return;
    await trashNote(editingNote.id);
    bumpRefresh();
    if (user) {
      const note = await db.notes.get(editingNote.id);
      firebaseBackend.pushNote(note, user.id).catch(console.error);
    }
  }, [editingNote, user, firebaseBackend, bumpRefresh]);

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
      <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
        {[
          { key: 'byDate', label: t('notes.subpageByDate') },
          { key: 'byItem', label: t('notes.subpageByItem') },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSubpageChange(key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              notesSubpage === key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={openCreate}
        className="self-start px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('notes.addButton')}
      </button>

      {notesSubpage === 'byDate' ? (
        <NotesByDate items={items} refreshKey={refreshKey} onEdit={openEdit} />
      ) : (
        <NotesByItem items={items} refreshKey={refreshKey} onEdit={openEdit} />
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
    </>
  );
}

export default NotesPage;
