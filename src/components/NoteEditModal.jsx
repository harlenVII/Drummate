import { useState, useEffect, useMemo, useRef } from 'react';
import DatePicker from 'react-datepicker';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';

const moveCursorToEnd = (el) => {
  if (!el) return;
  const len = el.value.length;
  el.setSelectionRange(len, len);
};

function NoteEditModal({
  note,           // null for create, { id, itemUid, date, body } for edit
  items,          // array of active (non-trashed) practice items
  defaultItemUid, // pre-selected item on create (e.g. focused practice item)
  onSave,         // (payload) => Promise<void>; payload is { itemUid, date, body } on create OR { body } on edit
  onDelete,       // optional, only used in edit mode
  onClose,
}) {
  const { t } = useLanguage();

  const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null);

  const fromPickerDate = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const isEdit = note != null;

  const activeItems = useMemo(
    () => items.filter(i => !i.trashed).sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const [itemUid, setItemUid] = useState(
    isEdit ? note.itemUid
           : (defaultItemUid && activeItems.some(i => i.uid === defaultItemUid)
              ? defaultItemUid
              : (activeItems[0]?.uid ?? '')),
  );
  const [date, setDate] = useState(isEdit ? note.date : getTodayString());
  const [body, setBody] = useState(isEdit ? note.body : '');
  const [saving, setSaving] = useState(false);
  const datePickerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canSave = body.trim().length > 0 && (isEdit || (itemUid && date));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        await onSave({ body });
      } else {
        await onSave({ itemUid, date, body });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || saving) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isEdit && activeItems.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <p className="text-gray-700 dark:text-slate-200">{t('notes.noActiveItems')}</p>
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400">
              {t('notes.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
          {isEdit ? t('notes.editTitle') : t('notes.createTitle')}
        </h2>

        {!isEdit && (
          <>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
              {t('notes.itemLabel')}
            </label>
            <select
              value={itemUid}
              onChange={(e) => setItemUid(e.target.value)}
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 rounded-md"
            >
              {activeItems.map(item => (
                <option key={item.uid} value={item.uid}>{item.name}</option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
              {t('notes.dateLabel')}
            </label>
            <DatePicker
              ref={datePickerRef}
              selected={toPickerDate(date)}
              onChange={(d) => {
                setDate(fromPickerDate(d));
                requestAnimationFrame(() => moveCursorToEnd(datePickerRef.current?.input));
              }}
              onFocus={(e) => moveCursorToEnd(e.target)}
              maxDate={new Date()}
              dateFormat="yyyy/MM/dd"
              calendarStartDay={1}
              shouldCloseOnSelect
              className="w-full px-3 py-2 border border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 rounded-md"
              wrapperClassName="w-full mb-3"
              popperProps={{ strategy: 'fixed' }}
            />
          </>
        )}

        <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
          {t('notes.bodyLabel')}
        </label>
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('notes.bodyPlaceholder')}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 rounded-md resize-y"
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
              >
                {t('notes.delete')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-50"
            >
              {t('notes.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-4 py-2 text-sm bg-blue-600 dark:bg-indigo-600 text-white rounded hover:bg-blue-700 dark:hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('notes.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NoteEditModal;
