import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getOfflineMode, setOfflineMode as setOfflineServiceMode } from '../services/offlineService';
import firebaseBackend from '../services/backends/firebaseBackend';
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

export function useSync({ loadData, resetters }) {
  const { user, authReady, isVisitor } = useAuth();

  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineMode, _setOfflineMode] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

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
      resetters.setItems([]);
      resetters.setTotals({});
      resetters.setMetronomePractices([]);
      resetters.setNotes([]);
      resetters.setReportLogs([]);
      resetters.setWeekLogs([]);
      resetters.setMonthLogs([]);
      resetters.setYearLogs([]);
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
      resetters.setActiveTab('practice');
      resetters.setItems([]);
      resetters.setTotals({});
      resetters.setMetronomePractices([]);
      resetters.setNotes([]);
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
          initTimezone(firebaseBackend, user.id),
          initPriorHours(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
          firebaseBackend.pullAllPractices(user.id),
          firebaseBackend.pullAllGoals(user.id),
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
        // local Dexie to match payload, so loadData below reads the final
        // post-merge state. Keep the sync overlay up until this is done —
        // otherwise the UI flickers between pull-overwritten old state and
        // queue-applied new state.
        await firebaseBackend.flushSyncQueue(user.id);
        await firebaseBackend.pushAllLocal(user.id);
        // Auto-archive any goals whose endDate has passed.
        const todayStr = getTodayString();
        const allGoalsForArchive = await db.goals.toArray();
        const expiredGoals = selectExpiredForArchive(allGoalsForArchive, todayStr);
        for (const g of expiredGoals) {
          await archiveGoal(g.uid);
          const fresh = await getGoalByUid(g.uid);
          if (fresh) await firebaseBackend.pushGoal(fresh, user.id);
        }
      } catch (err) {
        console.error('Sync init failed:', err);
      } finally {
        // loadData is the single source of truth for UI state. Run it
        // whether sync succeeded, failed, or short-circuited (offline).
        // Guard with !cancelled: if sign-out fired the cleanup, the !user
        // useEffect already cleared state. Calling loadData() here after
        // that clear (but before wipeAllLocalData finishes) would repopulate
        // React state with the previous user's Dexie rows.
        if (!cancelled) {
          await loadData();
          setIsSyncing(false);
        }
      }
      // Subscribe AFTER local state is reconciled — its initial snapshot
      // will see local == cloud and won't trigger a flicker. Stored in a
      // ref so handleEnterOfflineMode can tear it down without re-running
      // the effect.
      if (!cancelled && !getOfflineMode()) {
        subscriptionRef.current = firebaseBackend.subscribeToChanges(loadData);
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
  }, [user, authReady, loadData, syncTrigger, setOfflineMode]);

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
    handleEnterOfflineMode, handleGoOnline,
  };
}
