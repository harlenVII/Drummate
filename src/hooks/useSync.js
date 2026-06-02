import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import { getOfflineMode, setOfflineMode as setOfflineServiceMode } from '../services/offlineService';
import {
  db,
  insertGoalRecord,
  archiveGoal,
  getGoalByUid,
} from '../services/database';
import { shouldMigrateLegacy, buildMigratedGoal, selectExpiredForArchive } from '../utils/goalStatus';
import { initTimezone } from '../services/timezoneService';
import { initPriorHours } from '../services/priorPracticeService';
import { getTodayString } from '../utils/dateHelpers';
import { getItem, removeItem } from '../utils/safeStorage';

export function useSync({ resetters }) {
  const { user, authReady, isVisitor } = useAuth();
  const backend = useBackend();

  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineMode, _setOfflineMode] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const setOfflineMode = useCallback((value) => {
    setOfflineServiceMode(value);
    _setOfflineMode(!!value);
  }, []);

  const [goOnlineToast, setGoOnlineToast] = useState(false);

  useEffect(() => {
    if (!goOnlineToast) return;
    const timer = setTimeout(() => setGoOnlineToast(false), 3500);
    return () => clearTimeout(timer);
  }, [goOnlineToast]);

  const subscriptionRef = useRef(null);

  useEffect(() => {
    if (!user) {
      // Data (items/totals/practices/notes/logs) is reactive via liveQuery and
      // signOut wipes Dexie, so the data UI clears itself. We only reset the
      // ephemeral metronome/sequencer/multimeter engine state and navigation.
      resetters.setSequencerBpm(120);
      resetters.setSequencerSoundType('click');
      resetters.setSequencerSlots([]);
      resetters.sequencerNextIdRef.current = 1;
      resetters.setMultiMeterBpm(120);
      resetters.setMultiMeterSoundType('click');
      resetters.setMultiMeterSlots([]);
      setIsSyncing(false);
      resetters.setSettingsOpen(false);
      resetters.setActiveTab('practice');
      prevUserRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const prevIsVisitorRef = useRef(isVisitor);
  useEffect(() => {
    const wasVisitor = prevIsVisitorRef.current;
    prevIsVisitorRef.current = isVisitor;
    // Visitor logged off: isVisitor went true→false, no user
    if (wasVisitor && !isVisitor && !user) {
      // Data clears via liveQuery + the Dexie wipe in exitVisitorModeLogOff.
      resetters.setActiveTab('practice');
      resetters.setSequencerBpm(120);
      resetters.setSequencerSoundType('click');
      resetters.setSequencerSlots([]);
      resetters.sequencerNextIdRef.current = 1;
      resetters.setMultiMeterBpm(120);
      resetters.setMultiMeterSoundType('click');
      resetters.setMultiMeterSlots([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisitor, user]);

  const prevUserRef = useRef(null);

  useEffect(() => {
    if (!user || !authReady) return;

    if (!prevUserRef.current) {
      resetters.setActiveTab('practice');
    }
    prevUserRef.current = user;

    let cancelled = false;

    const init = async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        // Initial-load auto-enter offline: if the device is plainly offline
        // when sync starts, flip into offline mode so the banner shows and
        // we skip every Firestore call. We do NOT re-check navigator.onLine
        // during the session — that's the user's job via the banner's "Go
        // online" link or the settings toggle.
        if (!navigator.onLine) {
          setOfflineMode(true);
          return;
        }
        // initTimezone runs in parallel with the three pulls. The module-level
        // currentTz is already initialized from localStorage at module load
        // (see timezoneService.js), so getTimezone() returns a valid cached
        // value before initTimezone's Firestore reconciliation finishes. None
        // of the pulls read or write timezone — logs store loggedAt epoch ms;
        // tz is only used for UI bucketing afterwards.
        //
        // Order matters: pull first so we adopt cloud truth (renames, deletes
        // applied while this device was offline) BEFORE pushing local state up.
        // The syncedOnce flag in pullAll handles offline-deletion cleanup.
        await Promise.all([
          initTimezone(backend, user.id),
          initPriorHours(backend, user.id),
          backend.pullAll(user.id),
          backend.pullAllNotes(user.id),
          backend.pullAllPractices(user.id),
          backend.pullAllGoals(user.id),
        ]);
        if (getOfflineMode()) {
          return;
        }
        // One-shot legacy migration: if Dexie has no goals AND localStorage
        // has a single goal from the pre-v15 schema, promote it.
        const dexieGoalCount = await db.goals.count();
        const legacyGoalRaw = getItem('drummate_goal');
        if (shouldMigrateLegacy(dexieGoalCount, legacyGoalRaw)) {
          const record = buildMigratedGoal(legacyGoalRaw, Date.now(), () => crypto.randomUUID());
          if (record) {
            await insertGoalRecord(record);
          }
        }
        if (legacyGoalRaw) removeItem('drummate_goal');
        // flushSyncQueue replays queued offline edits to cloud AND restores
        // local Dexie to match payload, so the reactive UI settles on the
        // final post-merge state. Keep the sync overlay up until this is done —
        // otherwise the UI flickers between pull-overwritten old state and
        // queue-applied new state.
        await backend.flushSyncQueue(user.id);
        await backend.pushAllLocal(user.id);
        // Auto-archive any goals whose endDate has passed.
        const todayStr = getTodayString();
        const allGoalsForArchive = await db.goals.toArray();
        const expiredGoals = selectExpiredForArchive(allGoalsForArchive, todayStr);
        for (const g of expiredGoals) {
          await archiveGoal(g.uid);
          const fresh = await getGoalByUid(g.uid);
          if (fresh) await backend.pushGoal(fresh, user.id);
        }
      } catch (err) {
        console.error('Sync init failed:', err);
        if (!cancelled) setSyncError(err?.message || 'sync_failed');
      } finally {
        // UI reads are reactive (useLiveData / useReports subscribe to Dexie
        // via liveQuery), so the pulls above already propagated to the UI by
        // writing Dexie — no manual refetch needed. Just drop the overlay.
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
      // Subscribe AFTER local state is reconciled — its initial snapshot
      // will see local == cloud and won't trigger a flicker. The callback is
      // a no-op: subscribeToChanges writes adopted remote changes to Dexie,
      // and liveQuery re-emits from those writes automatically. Stored in a
      // ref so handleEnterOfflineMode can tear it down without re-running
      // the effect.
      if (!cancelled && !getOfflineMode()) {
        subscriptionRef.current = backend.subscribeToChanges(() => {});
      }
    };
    init();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authReady, syncTrigger, setOfflineMode, backend]);

  const handleEnterOfflineMode = useCallback(() => {
    // Tear down the live Firestore listener so it can't overwrite local
    // Dexie state while the user thinks they're isolated. The sync-overlay
    // path arrives here before the subscription is ever started; the
    // settings-toggle path arrives with an active subscription.
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
    setOfflineMode(true);
    setIsSyncing(false);
  }, [setOfflineMode]);

  const handleGoOnline = useCallback(() => {
    if (!navigator.onLine) {
      // Network still down — stay in offline mode and let the user know.
      setGoOnlineToast(true);
      resetters.setSettingsOpen(false);
      return;
    }
    setOfflineMode(false);
    resetters.setSettingsOpen(false);
    setSyncTrigger((n) => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOfflineMode]);

  return {
    isSyncing, offlineMode, setOfflineMode,
    pendingModalOpen, setPendingModalOpen,
    goOnlineToast,
    syncError, setSyncError,
    handleEnterOfflineMode, handleGoOnline,
  };
}
