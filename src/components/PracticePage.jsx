import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLanguage } from '../contexts/LanguageContext';
import PracticeEditModal from './PracticeEditModal';
import PracticeRunView from './PracticeRunView';

function computePracticeSeconds(practice) {
  const steps = [];
  for (let bpm = practice.startBpm; bpm < practice.endBpm; bpm += practice.bpmIncrement) {
    steps.push(bpm);
  }
  steps.push(practice.endBpm);
  return steps.reduce((acc, bpm) => {
    return acc + (practice.timeSignature.beats * 60 / bpm) * practice.barsPerStep;
  }, 0);
}

function formatPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PracticeRow({ practice, isFocused, onStart, onEdit, compactMode }) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: practice.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-slate-800 ${compactMode ? 'rounded-md p-2' : 'rounded-xl p-5'} shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-3 ${
        isFocused ? 'ring-2 ring-blue-400 dark:ring-indigo-400' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 dark:text-slate-700 hover:text-gray-500 dark:hover:text-slate-400 cursor-grab touch-none px-1 transition-colors"
        aria-label="drag"
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-800 dark:text-slate-100 truncate">{practice.name}</div>
        <div className="text-sm text-gray-400 dark:text-slate-500 truncate">
          {t('practiceMode.summary', {
            start: practice.startBpm,
            end: practice.endBpm,
            inc: practice.bpmIncrement,
            bars: practice.barsPerStep,
            beats: practice.timeSignature.beats,
            noteValue: practice.timeSignature.noteValue,
          })}
          {' '}
          <span className="text-gray-400 dark:text-slate-500">
            ({formatPracticeTime(computePracticeSeconds(practice))})
          </span>
        </div>
      </div>
      <button
        onClick={onEdit}
        className={`${compactMode ? 'px-2 py-1' : 'px-3 py-1.5'} rounded-md text-sm text-gray-600 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700`}
      >
        {t('edit')}
      </button>
      <button
        onClick={onStart}
        className={`${compactMode ? 'px-2 py-1' : 'px-3 py-1.5'} rounded-md text-sm bg-blue-600 dark:bg-indigo-600 text-white font-medium hover:bg-blue-700 dark:hover:bg-indigo-700`}
      >
        {t('practiceMode.start')}
      </button>
    </div>
  );
}

export default function PracticePage({
  practices,
  runningPracticeUid,
  engineRef,
  noSleepRef,
  onAddPractice,
  onUpdatePractice,
  onDeletePractice,
  onReorderPractices,
  onStartPractice,
  onEndPractice,
  runStepIndex,
  runBarIndex,
  runIsPlaying,
  runComplete,
  setRunStepIndex,
  setRunBarIndex,
  setRunIsPlaying,
  setRunComplete,
  compactMode = false,
}) {
  const { t } = useLanguage();
  const [modalState, setModalState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', practice }
  const [focusedIndex, setFocusedIndex] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (modalState !== null || practices.length === 0) return;

      if (e.code === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === null ? 0 : (prev + 1) % practices.length
        );
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === null ? practices.length - 1 : (prev - 1 + practices.length) % practices.length
        );
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (focusedIndex !== null) {
          setFocusedIndex(null);
          onStartPractice(practices[focusedIndex].uid);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, practices, focusedIndex, onStartPractice]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = practices.findIndex((p) => p.id === active.id);
    const newIndex = practices.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(practices, oldIndex, newIndex);
    onReorderPractices(reordered.map((p) => p.id));
  };

  if (runningPracticeUid) {
    const practice = practices.find((p) => p.uid === runningPracticeUid);
    if (!practice) {
      // The practice was deleted/synced-away while running — just end.
      onEndPractice();
      return null;
    }
    return (
      <PracticeRunView
        practice={practice}
        engineRef={engineRef}
        noSleepRef={noSleepRef}
        onEnd={onEndPractice}
        stepIndex={runStepIndex}
        barIndex={runBarIndex}
        isPlaying={runIsPlaying}
        complete={runComplete}
        setStepIndex={setRunStepIndex}
        setBarIndex={setRunBarIndex}
        setIsPlaying={setRunIsPlaying}
        setComplete={setRunComplete}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {practices.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 py-12">
            {t('practiceMode.empty')}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={practices.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {practices.map((p, idx) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    isFocused={focusedIndex === idx}
                    onStart={() => { setFocusedIndex(null); onStartPractice(p.uid); }}
                    onEdit={() => { setFocusedIndex(null); setModalState({ mode: 'edit', practice: p }); }}
                    compactMode={compactMode}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <button
          onClick={() => { setFocusedIndex(null); setModalState({ mode: 'create' }); }}
          className="self-end px-4 py-2 rounded-full bg-blue-600 dark:bg-indigo-600 text-white font-medium hover:bg-blue-700 dark:hover:bg-indigo-700"
        >
          + {t('practiceMode.addPractice')}
        </button>
      </div>

      {modalState && (
        <PracticeEditModal
          practice={modalState.mode === 'edit' ? modalState.practice : null}
          onSave={async (data) => {
            if (modalState.mode === 'edit') {
              await onUpdatePractice(modalState.practice.id, data);
            } else {
              await onAddPractice(data);
            }
            setModalState(null);
          }}
          onDelete={async () => {
            await onDeletePractice(modalState.practice.id, modalState.practice.uid);
            setModalState(null);
          }}
          onCancel={() => setModalState(null)}
        />
      )}
    </>
  );
}
