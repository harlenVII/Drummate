import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, addLog } from '../services/database';
import firebaseBackend from '../services/backends/firebaseBackend';
import { getItem, setItem, removeItem } from '../utils/safeStorage';

export function usePracticeTimer({ loadData, metronome }) {
  const { user } = useAuth();
  // metronome provides: bpm, timeSignature, subdivision, soundType,
  //   setBpm, setTimeSignature, setSubdivision, setSoundType,
  //   isPlaying, setIsPlaying, engineRef

  const [editing, setEditing] = useState(false);
  const [activeItemId, setActiveItemId] = useState(null);
  const [focusedPracticeItemId, setFocusedPracticeItemId] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const activeItemIdRef = useRef(null);

  // Keep ref in sync so pagehide/beforeunload always read latest value
  useEffect(() => {
    activeItemIdRef.current = activeItemId;
  }, [activeItemId]);

  // Recover any unsaved practice session from a previous page close
  useEffect(() => {
    const pending = getItem('drummate_pending_log');
    if (pending) {
      removeItem('drummate_pending_log');
      try {
        const parsed = JSON.parse(pending);
        const { itemId, duration } = parsed;
        // Older format used `date`; convert to loggedAt for backward compat.
        const loggedAt = typeof parsed.loggedAt === 'number'
          ? parsed.loggedAt
          : (parsed.date ? Date.parse(parsed.date + 'T12:00:00') : Date.now());
        if (itemId != null && duration > 0) {
          addLog(itemId, duration, { loggedAt })
            .then(() => loadData())
            .catch((err) => console.error('addLog failed:', err));
        }
      } catch {
        // ignore malformed data
      }
    }
  }, [loadData]);

  // Save ongoing practice session when page is closed/refreshed
  useEffect(() => {
    const saveSession = () => {
      const itemId = activeItemIdRef.current;
      const start = startTimeRef.current;
      if (itemId != null && start != null) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        if (elapsed > 0) {
          clearInterval(intervalRef.current);
          // Synchronous localStorage write survives iOS page kill
          setItem(
            'drummate_pending_log',
            JSON.stringify({ itemId, duration: elapsed, loggedAt: Date.now() }),
          );
        }
      }
    };

    // For desktop browsers (close/refresh)
    window.addEventListener('beforeunload', saveSession);

    // For iOS Safari (more reliable than beforeunload)
    window.addEventListener('pagehide', saveSession);

    return () => {
      window.removeEventListener('beforeunload', saveSession);
      window.removeEventListener('pagehide', saveSession);
    };
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    startTimeRef.current = null;
  }, []);

  const saveAndStop = useCallback(async () => {
    stopTimer();
    if (metronome.isPlaying && metronome.engineRef.current) {
      metronome.engineRef.current.stop();
      metronome.setIsPlaying(false);
    }
    const elapsed = elapsedTime;
    const itemId = activeItemId;

    if (itemId != null) {
      await db.practiceItems.update(itemId, {
        metronomeSettings: { bpm: metronome.bpm, timeSignature: metronome.timeSignature, subdivision: metronome.subdivision, soundType: metronome.soundType },
      });
    }

    if (elapsed > 0 && itemId != null) {
      const logId = await addLog(itemId, elapsed);
      await loadData();
      setActiveItemId(null);
      setElapsedTime(0);
      if (user) {
        const log = await db.practiceLogs.get(logId);
        firebaseBackend.pushLog(log, user.id).catch(console.error);
      }
    } else {
      setActiveItemId(null);
      setElapsedTime(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId, elapsedTime, stopTimer, loadData, user, metronome.bpm, metronome.timeSignature, metronome.subdivision, metronome.soundType, metronome.isPlaying]);

  const handleStart = useCallback(
    async (itemId) => {
      // If another item is running, save it first (including its metronome settings)
      if (activeItemId != null) {
        stopTimer();
        await db.practiceItems.update(activeItemId, {
          metronomeSettings: { bpm: metronome.bpm, timeSignature: metronome.timeSignature, subdivision: metronome.subdivision, soundType: metronome.soundType },
        });
        if (elapsedTime > 0) {
          const logId = await addLog(activeItemId, elapsedTime);
          if (user) {
            const log = await db.practiceLogs.get(logId);
            firebaseBackend.pushLog(log, user.id).catch(console.error);
          }
        }
      }

      // Load metronome settings saved for this item
      const item = await db.practiceItems.get(itemId);
      if (item?.metronomeSettings) {
        const { bpm, timeSignature, subdivision, soundType } = item.metronomeSettings;
        if (bpm != null) metronome.setBpm(bpm);
        if (timeSignature != null) metronome.setTimeSignature(timeSignature);
        if (subdivision != null) metronome.setSubdivision(subdivision);
        if (soundType != null) metronome.setSoundType(soundType);
      }

      setActiveItemId(itemId);
      setElapsedTime(0);
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      if (activeItemId != null && elapsedTime > 0) {
        await loadData();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, elapsedTime, stopTimer, loadData, user, metronome.bpm, metronome.timeSignature, metronome.subdivision, metronome.soundType],
  );

  const handleStop = useCallback(async () => {
    await saveAndStop();
  }, [saveAndStop]);

  const handleSetEditing = useCallback(
    async (value) => {
      if (value && activeItemId != null) {
        await saveAndStop();
      }
      setEditing(value);
    },
    [activeItemId, saveAndStop],
  );

  const clearActiveTimer = useCallback((id) => {
    if (activeItemId === id) {
      stopTimer();
      setActiveItemId(null);
      setElapsedTime(0);
    }
  }, [activeItemId, stopTimer]);

  return {
    activeItemId, setActiveItemId,
    elapsedTime, setElapsedTime,
    focusedPracticeItemId, setFocusedPracticeItemId,
    editing,
    activeItemIdRef,
    stopTimer, saveAndStop, handleStart, handleStop, handleSetEditing,
    clearActiveTimer,
  };
}
