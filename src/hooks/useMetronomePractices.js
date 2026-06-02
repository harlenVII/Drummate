import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import {
  getPractices,
  addPractice as dbAddPractice,
  updatePractice as dbUpdatePractice,
  deletePractice as dbDeletePractice,
  updatePracticeOrder,
} from '../services/database';

export function useMetronomePractices({
  metronomePractices, items, handleStart, saveAndStop, activeItemId,
}) {
  const { user } = useAuth();
  const backend = useBackend();

  // Run-view state persisted in App so it survives tab switches.
  const [runningPracticeUid, setRunningPracticeUid] = useState(null);
  const [practiceRunStepIndex, setPracticeRunStepIndex] = useState(0);
  const [practiceRunBarIndex, setPracticeRunBarIndex] = useState(0);
  const [practiceRunIsPlaying, setPracticeRunIsPlaying] = useState(false);
  const [practiceRunComplete, setPracticeRunComplete] = useState(false);

  const handleAddPractice = useCallback(
    async (data) => {
      const record = await dbAddPractice(data);
      if (user) {
        backend.pushPractice({ ...record }, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  const handleUpdatePractice = useCallback(
    async (id, data) => {
      await dbUpdatePractice(id, data);
      if (user) {
        const updated = await getPractices().then((ps) => ps.find((p) => p.id === id));
        if (updated) backend.pushPractice(updated, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  const handleDeletePractice = useCallback(
    async (id, uid) => {
      if (runningPracticeUid && uid === runningPracticeUid) {
        setRunningPracticeUid(null);
        setPracticeRunStepIndex(0);
        setPracticeRunBarIndex(0);
        setPracticeRunIsPlaying(false);
        setPracticeRunComplete(false);
      }
      await dbDeletePractice(id);
      if (user) {
        backend.pushDeletePractice(uid, user.id).catch(console.error);
      }
    },
    [user, runningPracticeUid, backend],
  );

  const handleReorderPractices = useCallback(
    async (orderedIds) => {
      await updatePracticeOrder(orderedIds);
      if (user) {
        const updated = await getPractices();
        backend.pushPracticeReorder(updated, user.id).catch(console.error);
      }
    },
    [user, backend],
  );

  const handleStartPractice = useCallback(async (uid) => {
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
    setRunningPracticeUid(uid);

    const practice = metronomePractices.find(p => p.uid === uid);
    if (practice?.linkedItemUid) {
      const linkedItem = items.find(i => i.uid === practice.linkedItemUid && !i.trashed && !i.archived);
      if (linkedItem) {
        await handleStart(linkedItem.id);
      }
    }
  }, [metronomePractices, items, handleStart]);

  const handleEndPractice = useCallback(async (wasComplete) => {
    const practiceUid = runningPracticeUid;

    if (wasComplete && practiceUid) {
      const practice = metronomePractices.find(p => p.uid === practiceUid);
      if (practice?.linkedItemUid && activeItemId != null) {
        const activeItem = items.find(i => i.id === activeItemId);
        if (activeItem?.uid === practice.linkedItemUid) {
          await saveAndStop();
        }
      }
    }

    setRunningPracticeUid(null);
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
  }, [runningPracticeUid, metronomePractices, activeItemId, items, saveAndStop]);

  return {
    runningPracticeUid, setRunningPracticeUid,
    practiceRunStepIndex, setPracticeRunStepIndex,
    practiceRunBarIndex, setPracticeRunBarIndex,
    practiceRunIsPlaying, setPracticeRunIsPlaying,
    practiceRunComplete, setPracticeRunComplete,
    handleAddPractice, handleUpdatePractice, handleDeletePractice,
    handleReorderPractices, handleStartPractice, handleEndPractice,
  };
}
