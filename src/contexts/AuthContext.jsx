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
  const [fromVisitorIntent, setFromVisitorIntent] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const currentUser = firebaseBackend.getUser();
    if (currentUser) {
      if (!navigator.onLine) {
        setUser(currentUser);
        Promise.resolve().then(() => setAuthReady(true));
      } else {
        firebaseBackend.refreshAuth()
          .then((refreshedUser) => {
            setUser(refreshedUser);
          })
          .catch((err) => {
            if (firebaseBackend.isAbortError(err)) return;
            if (firebaseBackend.isNetworkError?.(err)) {
              setUser(currentUser);
              return;
            }
            firebaseBackend.signOut();
            setUser(null);
            setSessionExpired(true);
          })
          .finally(() => setAuthReady(true));
      }
    } else {
      Promise.resolve().then(() => setAuthReady(true));
    }

    const unsubscribe = firebaseBackend.onAuthChange((newUser) => {
      setUser(newUser);
    });

    return unsubscribe;
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

  const exitVisitorModeForAuth = useCallback(async (intent) => {
    // For sign-in: wipe visitor data now, before Firebase auth fires onAuthChange
    // and triggers the sync init effect. Deferring the wipe to after signIn() resolves
    // is too late — onAuthStateChanged can run between signIn() and the wipe.
    if (intent === 'signIn') {
      await wipeAllLocalData();
    }
    try {
      globalThis.localStorage?.removeItem(VISITOR_KEY);
    } catch {
      // ignore
    }
    setIsVisitor(false);
    setFromVisitorIntent(intent);
  }, []);

  const exitVisitorModeLogOff = useCallback(async () => {
    await wipeAllLocalData();
    try {
      globalThis.localStorage?.removeItem(VISITOR_KEY);
      globalThis.localStorage?.removeItem('drummate_prior_hours');
    } catch {
      // ignore
    }
    setIsVisitor(false);
    setFromVisitorIntent(null);
  }, []);

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    const newUser = await firebaseBackend.signIn(email, password);
    setFromVisitorIntent(null);
    setUser(newUser);
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const newUser = await firebaseBackend.signUp(email, password, name);
    if (fromVisitorIntent === 'signUp') {
      try {
        await firebaseBackend.pushAllLocal(newUser.id);
      } catch (err) {
        console.error('visitor migration push failed', err);
      }
    }
    setFromVisitorIntent(null);
    setUser(newUser);
  }, [fromVisitorIntent]);

  const signOut = useCallback(() => {
    firebaseBackend.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        sessionExpired,
        isVisitor,
        fromVisitorIntent,
        signIn,
        signUp,
        signOut,
        enterVisitorMode,
        exitVisitorModeForAuth,
        exitVisitorModeLogOff,
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
