import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const TIME_SIGNATURES = [
  { beats: 2, noteValue: 4 },
  { beats: 3, noteValue: 4 },
  { beats: 4, noteValue: 4 },
  { beats: 5, noteValue: 4 },
  { beats: 6, noteValue: 8 },
  { beats: 7, noteValue: 8 },
];
const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

const DEFAULTS = {
  name: '',
  startBpm: 80,
  endBpm: 120,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: 'quarter',
  soundType: 'click',
};

export default function PracticeEditModal({ practice, onSave, onDelete, onCancel }) {
  const { t } = useLanguage();
  const isEdit = !!practice;
  const [form, setForm] = useState(() =>
    practice ? { ...practice } : { ...DEFAULTS }
  );
  const [error, setError] = useState(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = (k) => (e) => {
    const v = parseInt(e.target.value, 10);
    setField(k, Number.isFinite(v) ? v : 0);
  };

  const validate = () => {
    if (!form.name.trim()) return t('practiceMode.validation.nameRequired');
    if (form.endBpm < form.startBpm) return t('practiceMode.validation.endBeforeStart');
    if (form.bpmIncrement < 1) return t('practiceMode.validation.positiveIncrement');
    if (form.barsPerStep < 1) return t('practiceMode.validation.positiveBars');
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) { setError(err); return; }
    onSave({
      ...form,
      name: form.name.trim(),
      startBpm: Math.max(30, Math.min(300, form.startBpm)),
      endBpm: Math.max(30, Math.min(300, form.endBpm)),
    });
  };

  const handleDelete = () => {
    if (window.confirm(t('practiceMode.confirmDelete'))) {
      onDelete();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-800">
            {isEdit ? t('practiceMode.editPractice') : t('practiceMode.addPractice')}
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.name')}</span>
            <input
              ref={firstInputRef}
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder={t('practiceMode.namePlaceholder')}
              className="border border-gray-300 rounded-lg px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.startBpm')}</span>
              <input type="number" min="30" max="300" value={form.startBpm}
                onChange={setNum('startBpm')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.endBpm')}</span>
              <input type="number" min="30" max="300" value={form.endBpm}
                onChange={setNum('endBpm')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.bpmIncrement')}</span>
              <input type="number" min="1" max="50" value={form.bpmIncrement}
                onChange={setNum('bpmIncrement')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">{t('practiceMode.barsPerStep')}</span>
              <input type="number" min="1" max="64" value={form.barsPerStep}
                onChange={setNum('barsPerStep')}
                className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.timeSignature')}</span>
            <div className="flex gap-2 flex-wrap">
              {TIME_SIGNATURES.map((ts) => (
                <button
                  key={`${ts.beats}/${ts.noteValue}`}
                  type="button"
                  onClick={() => setField('timeSignature', { beats: ts.beats, noteValue: ts.noteValue })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    form.timeSignature.beats === ts.beats && form.timeSignature.noteValue === ts.noteValue
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {ts.beats}/{ts.noteValue}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.subdivision')}</span>
            <select
              value={form.subdivision}
              onChange={(e) => setField('subdivision', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {SUBDIVISIONS.filter((s) => s.pattern !== null).map((s) => (
                <option key={s.key} value={s.key}>{s.key}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600">{t('practiceMode.sound')}</span>
            <select
              value={form.soundType}
              onChange={(e) => setField('soundType', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {SOUND_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {isEdit ? (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 font-medium"
              >
                {t('delete')}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
