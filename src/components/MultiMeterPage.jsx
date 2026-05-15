import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import BpmDial from './BpmDial';
import BeatIndicator from './BeatIndicator';
import SubdivisionIcon from './SubdivisionIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { SUBDIVISIONS } from '../constants/subdivisions';

const MAX_SLOTS = 16;
const SOUND_TYPES = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];

const METER_OPTIONS = [
  { beats: 2, noteValue: 4 },
  { beats: 3, noteValue: 4 },
  { beats: 4, noteValue: 4 },
  { beats: 5, noteValue: 4 },
  { beats: 6, noteValue: 4 },
  { beats: 7, noteValue: 4 },
  { beats: 3, noteValue: 8 },
  { beats: 6, noteValue: 8 },
  { beats: 7, noteValue: 8 },
  { beats: 9, noteValue: 8 },
  { beats: 11, noteValue: 8 },
  { beats: 12, noteValue: 8 },
];

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="absolute top-0.5 left-0.5 p-0.5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    </button>
  );
}

function SortableSlot({ slot, index, isSelected, editing, isPlaying, playingSlot, onDelete, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: slot.id });
  const isCurrentlyPlaying = isPlaying && index === playingSlot;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={editing ? () => onSelect(index) : undefined}
      className={`
        relative flex flex-col items-center justify-center
        p-3 rounded-xl border-2
        transition-all duration-150
        ${isCurrentlyPlaying
          ? 'border-blue-500 bg-blue-50 scale-105 shadow-md'
          : isSelected
            ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300'
            : 'border-gray-200 bg-white'
        }
        ${editing ? 'cursor-pointer' : ''}
      `}
    >
      {editing && (
        <DragHandle listeners={listeners} attributes={attributes} />
      )}

      <span className={`text-[10px] font-bold mb-0.5 ${
        isCurrentlyPlaying ? 'text-blue-600' : 'text-gray-400'
      }`}>
        {index + 1}
      </span>

      <span className={`text-sm font-semibold ${
        isCurrentlyPlaying ? 'text-blue-700' : 'text-gray-700'
      }`}>
        {slot.beats}/{slot.noteValue}
      </span>

      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(index); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500
            text-white rounded-full flex items-center justify-center
            text-xs font-bold shadow-sm hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}

function MultiMeterPage({
  engineRef,
  noSleepRef,
  bpm,
  setBpm,
  isPlaying,
  setIsPlaying,
  soundType,
  setSoundType,
  subdivision,
  setSubdivision,
  slots,
  setSlots,
  playingSlot,
  setPlayingSlot,
  currentBeat,
  setCurrentBeat,
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);

  const nextIdRef = useRef(null);
  if (nextIdRef.current === null) {
    nextIdRef.current = Math.max(0, ...slots.map(s => s.id)) + 1;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    if (engineRef.current) engineRef.current.setBpm(bpm);
  }, [engineRef, bpm]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setSoundType(soundType);
  }, [engineRef, soundType]);

  useEffect(() => {
    if (engineRef.current) {
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
    }
  }, [engineRef, subdivision]);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      engineRef.current.stop();
      engineRef.current.setMeterTrack(null);
      setIsPlaying(false);
      setPlayingSlot(-1);
      setCurrentBeat(-1);
      noSleepRef.current.disable();
    } else {
      if (slots.length === 0) return;
      setEditing(false);
      setSelectedSlotIndex(null);
      const sub = SUBDIVISIONS.find((s) => s.key === subdivision);
      engineRef.current.setSequence(null);
      engineRef.current.setSubdivision(sub ? sub.pattern : [0]);
      engineRef.current.setSoundType(soundType);
      engineRef.current.setBpm(bpm);
      engineRef.current.setMeterTrack(slots.map(s => s.beats));
      noSleepRef.current.enable();
      await engineRef.current.start();
      setIsPlaying(true);
      setPlayingSlot(0);
    }
  }, [engineRef, isPlaying, setIsPlaying, setPlayingSlot, setCurrentBeat,
      noSleepRef, slots, subdivision, soundType, bpm]);

  const handleAddSlot = useCallback((beats, noteValue) => {
    if (slots.length >= MAX_SLOTS) return;
    const newSlot = { id: nextIdRef.current++, beats, noteValue };
    if (editing && selectedSlotIndex !== null) {
      const newSlots = [...slots];
      newSlots.splice(selectedSlotIndex + 1, 0, newSlot);
      setSlots(newSlots);
      setSelectedSlotIndex(selectedSlotIndex + 1);
    } else {
      setSlots([...slots, newSlot]);
    }
  }, [slots, setSlots, editing, selectedSlotIndex]);

  const handleDeleteSlot = useCallback((index) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSlots(newSlots);
    if (selectedSlotIndex !== null) {
      if (index === selectedSlotIndex) setSelectedSlotIndex(null);
      else if (index < selectedSlotIndex) setSelectedSlotIndex(selectedSlotIndex - 1);
    }
    if (isPlaying && engineRef.current) {
      if (newSlots.length === 0) {
        engineRef.current.stop();
        engineRef.current.setMeterTrack(null);
        setIsPlaying(false);
        setPlayingSlot(-1);
        setCurrentBeat(-1);
        noSleepRef.current.disable();
      } else {
        engineRef.current.setMeterTrack(newSlots.map(s => s.beats));
        setPlayingSlot(0);
        setCurrentBeat(-1);
      }
    }
  }, [slots, setSlots, isPlaying, engineRef, setIsPlaying, setPlayingSlot, setCurrentBeat,
      noSleepRef, selectedSlotIndex]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex(s => s.id === active.id);
    const newIndex = slots.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newSlots = [...slots];
    const [moved] = newSlots.splice(oldIndex, 1);
    newSlots.splice(newIndex, 0, moved);
    setSlots(newSlots);
    if (selectedSlotIndex !== null) {
      if (selectedSlotIndex === oldIndex) setSelectedSlotIndex(newIndex);
      else if (oldIndex < selectedSlotIndex && newIndex >= selectedSlotIndex)
        setSelectedSlotIndex(selectedSlotIndex - 1);
      else if (oldIndex > selectedSlotIndex && newIndex <= selectedSlotIndex)
        setSelectedSlotIndex(selectedSlotIndex + 1);
    }
  }, [slots, setSlots, selectedSlotIndex]);

  const handleSelectSlot = useCallback((index) => {
    setSelectedSlotIndex(prev => prev === index ? null : index);
  }, []);

  const handleExitEditing = useCallback(() => {
    setEditing(false);
    setSelectedSlotIndex(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
      if (e.code === 'Space') { e.preventDefault(); handleTogglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); setBpm(prev => Math.max(30, prev - 1)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); setBpm(prev => Math.min(300, prev + 1)); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, setBpm]);

  const activeBeats = (playingSlot >= 0 && playingSlot < slots.length)
    ? slots[playingSlot].beats
    : 4;

  const slotGrid = (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((slot, index) => (
        <SortableSlot
          key={slot.id}
          slot={slot}
          index={index}
          isSelected={editing && selectedSlotIndex === index}
          editing={editing}
          isPlaying={isPlaying}
          playingSlot={playingSlot}
          onDelete={handleDeleteSlot}
          onSelect={handleSelectSlot}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-5">

      {/* Beat indicator */}
      <BeatIndicator beats={activeBeats} currentBeat={currentBeat} isPlaying={isPlaying} />

      {/* Slot grid */}
      <div className="w-full">
        {slots.length === 0 ? (
          !editing ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              {t('multiMeter.emptyState')}
            </div>
          ) : null
        ) : editing ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slots.map(s => s.id)} strategy={rectSortingStrategy}>
              {slotGrid}
            </SortableContext>
          </DndContext>
        ) : (
          slotGrid
        )}
      </div>

      {/* Edit mode: time signature picker */}
      {editing && (
        <>
          <p className="text-xs text-gray-500 text-center">
            {t('multiMeter.tapToAdd')}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {METER_OPTIONS.map(({ beats, noteValue }) => (
              <button
                key={`${beats}/${noteValue}`}
                onClick={() => handleAddSlot(beats, noteValue)}
                disabled={slots.length >= MAX_SLOTS}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  slots.length >= MAX_SLOTS
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-blue-50 hover:border-blue-400'
                }`}
              >
                {beats}/{noteValue}
                {slots.length < MAX_SLOTS && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white
                    rounded-full flex items-center justify-center text-[10px] font-bold">
                    +
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Sound type selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SOUND_TYPES.map((key) => (
          <button
            key={key}
            onClick={() => setSoundType(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              soundType === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {t(`soundTypes.${key}`)}
          </button>
        ))}
      </div>

      {/* Subdivision selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SUBDIVISIONS.filter(({ key }) => key !== 'rest').map(({ key }) => (
          <button
            key={key}
            onClick={() => setSubdivision(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              subdivision === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            <SubdivisionIcon type={key} />
          </button>
        ))}
      </div>

      {/* BPM dial */}
      <BpmDial bpm={bpm} onBpmChange={setBpm} />

      {/* Play/Stop button */}
      <button
        onClick={handleTogglePlay}
        disabled={slots.length === 0}
        className={`w-16 h-16 rounded-full flex items-center justify-center
          transition-colors shadow-md ${
            slots.length === 0
              ? 'bg-gray-300 cursor-not-allowed'
              : isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
      >
        {isPlaying ? (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Edit / Done button */}
      {!isPlaying && (
        editing ? (
          <button
            onClick={handleExitEditing}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            {t('done')}
          </button>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('edit')}
          </button>
        )
      )}
    </div>
  );
}

export default MultiMeterPage;
