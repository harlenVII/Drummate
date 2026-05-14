import { useState } from 'react';
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

function PracticeRow({ practice, onStart, onEdit }) {
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
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-400 hover:text-gray-600 cursor-grab touch-none px-1"
        aria-label="drag"
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 truncate">{practice.name}</div>
        <div className="text-sm text-gray-500 truncate">
          {t('practiceMode.summary', {
            start: practice.startBpm,
            end: practice.endBpm,
            inc: practice.bpmIncrement,
            bars: practice.barsPerStep,
            beats: practice.timeSignature.beats,
            noteValue: practice.timeSignature.noteValue,
          })}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
      >
        {t('edit')}
      </button>
      <button
        onClick={onStart}
        className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white font-medium hover:bg-blue-700"
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
}) {
  const { t } = useLanguage();
  const [modalState, setModalState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', practice }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
          <div className="text-center text-gray-500 py-12">
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
                {practices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    onStart={() => onStartPractice(p.uid)}
                    onEdit={() => setModalState({ mode: 'edit', practice: p })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <button
          onClick={() => setModalState({ mode: 'create' })}
          className="self-end px-4 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700"
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
