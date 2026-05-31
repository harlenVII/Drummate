import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import firebaseBackend from '../services/backends/firebaseBackend';
import { wipeAllLocalData } from '../services/database';

const VISITOR_KEY = 'drummate_visitor';
const AuthContext = createContext();

function readVisitorFlag() {
  try {
    return globalThis.localStorage?.getItem(VISITOR_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => firebaseBackend.getUser());
  const [isVisitor, setIsVisitor] = useState(() => readVisitorFlag());
  const [sessionExpired, setSessionExpired] = useState(false);
  // Only the online + cached-user path needs async work (token revalidation)
  // before auth is "ready". Offline or signed-out, we know synchronously at
  // mount that we can start ready and trust the lazily-initialized `user`.
  const [authReady, setAuthReady] = useState(
    () => !firebaseBackend.getUser() || !navigator.onLine
  );

  useEffect(() => {
    // Revalidate the cached session only when we have a user AND a network.
    // The authReady initializer already covered the offline/signed-out cases,
    // and `user` already holds the cached value, so neither needs a setState
    // here — which is what keeps this effect free of cascading renders.
    if (firebaseBackend.getUser() && navigator.onLine) {
      firebaseBackend.refreshAuth()
        .then((refreshedUser) => setUser(refreshedUser))
        .catch((err) => {
          if (firebaseBackend.isAbortError(err)) return;
          if (firebaseBackend.isNetworkError?.(err)) return; // keep cached user
          firebaseBackend.signOut();
          setUser(null);
          setSessionExpired(true);
        })
        .finally(() => setAuthReady(true));
    }

    return firebaseBackend.onAuthChange((newUser) => {
      setUser(newUser);
    });
  }, []);

  const enterVisitorMode = useCallback(async () => {
    await wipeAllLocalData();
    try {
      globalThis.localStorage?.setItem(VISITOR_KEY, 'true');
    } catch {
      // ignore
    }
    setIsVisitor(true);
  }, []);

  const exitVisitorModeLogOff = useCallback(async () => {
    await wipeAllLocalData();
    try {
      globalThis.localStorage?.removeItem(VISITOR_KEY);
      globalThis.localStorage?.removeItem('drummate_prior_hours');
      globalThis.localStorage?.removeItem('drummate_sequencer_bpm');
      globalThis.localStorage?.removeItem('drummate_sequencer_sound_type');
      globalThis.localStorage?.removeItem('drummate_sequencer_slots');
      globalThis.localStorage?.removeItem('drummate_sequencer_next_id');
      globalThis.localStorage?.removeItem('drummate_multimeter_bpm');
      globalThis.localStorage?.removeItem('drummate_multimeter_sound_type');
      globalThis.localStorage?.removeItem('drummate_multimeter_slots');
    } catch {
      // ignore
    }
    setIsVisitor(false);
  }, []);

  const signUpAsVisitor = useCallback(async (email, password, name) => {
    const newUser = await firebaseBackend.signUp(email, password, name);
    try {
      await firebaseBackend.pushAllLocal(newUser.id);
    } catch (err) {
      console.error('visitor migration push failed', err);
    }
    try {
      globalThis.localStorage?.removeItem(VISITOR_KEY);
    } catch {
      // ignore
    }
    setIsVisitor(false);
    setUser(newUser);
  }, []);

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    const newUser = await firebaseBackend.signIn(email, password);
    setUser(newUser);
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const newUser = await firebaseBackend.signUp(email, password, name);
    setUser(newUser);
  }, []);

  const signOut = useCallback(async () => {
    firebaseBackend.signOut();
    await wipeAllLocalData();
    try {
      globalThis.localStorage?.removeItem('drummate_prior_hours');
      globalThis.localStorage?.removeItem('drummate_sequencer_bpm');
      globalThis.localStorage?.removeItem('drummate_sequencer_sound_type');
      globalThis.localStorage?.removeItem('drummate_sequencer_slots');
      globalThis.localStorage?.removeItem('drummate_sequencer_next_id');
      globalThis.localStorage?.removeItem('drummate_multimeter_bpm');
      globalThis.localStorage?.removeItem('drummate_multimeter_sound_type');
      globalThis.localStorage?.removeItem('drummate_multimeter_slots');
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        sessionExpired,
        isVisitor,
        signIn,
        signUp,
        signOut,
        enterVisitorMode,
        exitVisitorModeLogOff,
        signUpAsVisitor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
