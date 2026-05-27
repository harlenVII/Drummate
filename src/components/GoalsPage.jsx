import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import {
  db,
  addGoal,
  updateGoal,
  archiveGoal,
  setGoalPinned,
  deleteGoalLocal,
  getGoalByUid,
  unarchiveGoal,
  updateGoalOrder,
} from '../services/database';
import { DndContext, DragOverlay, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { isCurrentGoal, isHistoryGoal } from '../utils/goalStatus';
import GoalCard from './GoalCard';
import GoalSetupModal from './GoalSetupModal';

function SortableGoalCard({ goal, logs, ...cardProps }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.uid });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <GoalCard
        goal={goal}
        logs={logs}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        {...cardProps}
      />
    </div>
  );
}

function GoalsPage({ user, firebaseBackend, compactMode = false }) {
  const { t } = useLanguage();
  const [goals, setGoals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const [localOrder, setLocalOrder] = useState(null);

  useEffect(() => {
    const sub = liveQuery(() => db.goals.toArray()).subscribe({
      next: (all) => setGoals(all),
      error: (err) => console.error('GoalsPage goals liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.practiceLogs.toArray()).subscribe({
      next: (all) => setLogs(all),
      error: (err) => console.error('GoalsPage logs liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  const today = getTodayString();

  const { currentGoals, historyGoals } = useMemo(() => {
    const current = goals.filter(g => isCurrentGoal(g, today));
    const history = goals.filter(g => isHistoryGoal(g, today));
    if (localOrder) {
      current.sort((a, b) => {
        const ai = localOrder.indexOf(a.uid);
        const bi = localOrder.indexOf(b.uid);
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      });
    } else {
      current.sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
    }
    history.sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0));
    return { currentGoals: current, historyGoals: history };
  }, [goals, today, localOrder]);

  const pushOne = async (goalUid) => {
    if (!user) return;
    const fresh = await getGoalByUid(goalUid);
    if (fresh) await firebaseBackend.pushGoal(fresh, user.id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    setActiveDragId(null);
    if (!over || active.id === over.id) {
      setLocalOrder(null);
      return;
    }
    const uids = currentGoals.map(g => g.uid);
    const oldIndex = uids.indexOf(active.id);
    const newIndex = uids.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) {
      setLocalOrder(null);
      return;
    }
    const newUids = arrayMove(uids, oldIndex, newIndex);
    // Apply new order synchronously so SortableContext sees it in the same
    // render that clears activeDragId — prevents snap-back to old positions.
    setLocalOrder(newUids);
    await updateGoalOrder(newUids);
    setLocalOrder(null);
    await Promise.all(newUids.map(uid => pushOne(uid)));
  };

  const handleSave = async (payload) => {
    let uid = payload.uid;
    if (uid) {
      await updateGoal(uid, {
        name: payload.name,
        startDate: payload.startDate,
        endDate: payload.endDate,
        targetHours: payload.targetHours,
      });
    } else {
      uid = await addGoal({
        name: payload.name,
        startDate: payload.startDate,
        endDate: payload.endDate,
        targetHours: payload.targetHours,
      });
    }
    await pushOne(uid);
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingGoal(null);
    setShowModal(true);
  };

  const handlePin = async (goal) => {
    const changed = await setGoalPinned(goal.uid);
    if (!user) return;
    for (const g of changed) {
      const fresh = await getGoalByUid(g.uid);
      if (fresh) await firebaseBackend.pushGoal(fresh, user.id);
    }
  };

  const handleArchive = async (goal) => {
    await archiveGoal(goal.uid);
    await pushOne(goal.uid);
  };

  const handleDelete = async (goal) => {
    if (!window.confirm(t('goal.deleteConfirm'))) return;
    await deleteGoalLocal(goal.uid);
    if (user) await firebaseBackend.deleteGoalRemote(goal.uid, user.id);
  };

  const handleUnarchive = async (goal) => {
    await unarchiveGoal(goal.uid);
    await pushOne(goal.uid);
  };

  const sectionGap = compactMode ? 'gap-2' : 'gap-3';
  const wrapperGap = compactMode ? 'gap-3' : 'gap-4';

  return (
    <div className={`flex flex-col ${wrapperGap}`}>
      <section className={`flex flex-col ${sectionGap}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('goal.current')}</h3>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 bg-blue-600 dark:bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors"
          >
            {t('goal.newGoal')}
          </button>
        </div>
        {currentGoals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 text-sm text-gray-500 dark:text-slate-400">
            {t('goal.emptyCurrent')}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveDragId(active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => { setActiveDragId(null); setLocalOrder(null); }}
          >
            <SortableContext items={currentGoals.map(g => g.uid)} strategy={verticalListSortingStrategy}>
              {currentGoals.map(g => (
                <SortableGoalCard
                  key={g.uid}
                  goal={g}
                  logs={logs}
                  variant="current"
                  onEdit={handleEdit}
                  onPin={handlePin}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  compactMode={compactMode}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
              {activeDragId ? (() => {
                const g = currentGoals.find(g => g.uid === activeDragId);
                return g ? (
                  <div className="shadow-2xl opacity-95 rotate-1">
                    <GoalCard
                      goal={g}
                      logs={logs}
                      variant="current"
                      compactMode={compactMode}
                    />
                  </div>
                ) : null;
              })() : null}
            </DragOverlay>
          </DndContext>
        )}
      </section>

      <section className={`flex flex-col ${sectionGap}`}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('goal.history')}</h3>
        {historyGoals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 text-sm text-gray-500 dark:text-slate-400">
            {t('goal.emptyHistory')}
          </div>
        ) : (
          historyGoals.map(g => (
            <GoalCard
              key={g.uid}
              goal={g}
              logs={logs}
              variant="history"
              onEdit={handleEdit}
              onPin={handlePin}
              onUnarchive={handleUnarchive}
              onDelete={handleDelete}
              compactMode={compactMode}
            />
          ))
        )}
      </section>

      <GoalSetupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        goal={editingGoal}
      />
    </div>
  );
}

export default GoalsPage;
