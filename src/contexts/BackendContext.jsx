import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import pocketbaseBackend from '../services/backends/pocketbaseBackend';
import { BACKEND_TYPES } from '../services/backends/backendInterface';

const BackendContext = createContext();

function getInitialBackend() {
  return BACKEND_TYPES.FIREBASE;
}

// Lazy-load firebase backend to avoid loading the Firebase SDK when using PocketBase
let firebaseBackendModule = null;
async function getFirebaseBackend() {
  if (!firebaseBackendModule) {
    const mod = await import('../services/backends/firebaseBackend');
    firebaseBackendModule = mod.default;
  }
  return firebaseBackendModule;
}

export function BackendProvider({ children }) {
  const [backendType, setBackendType] = useState(getInitialBackend);
  const [firebaseBackend, setFirebaseBackend] = useState(null);
  const [loading, setLoading] = useState(
    () => getInitialBackend() === BACKEND_TYPES.FIREBASE
  );

  // Load Firebase backend on mount if needed
  useState(() => {
    if (getInitialBackend() === BACKEND_TYPES.FIREBASE) {
      getFirebaseBackend().then((fb) => {
        setFirebaseBackend(fb);
        setLoading(false);
      });
    }
  });

  const backend = useMemo(() => {
    if (backendType === BACKEND_TYPES.FIREBASE && firebaseBackend) {
      return firebaseBackend;
    }
    return pocketbaseBackend;
  }, [backendType, firebaseBackend]);

  const switchBackend = useCallback(async (type) => {
    if (type === backendType) return;

    // Sign out from current backend
    backend.signOut();

    if (type === BACKEND_TYPES.FIREBASE) {
      setLoading(true);
      const fb = await getFirebaseBackend();
      setFirebaseBackend(fb);
      setLoading(false);
    }

    setBackendType(type);
    localStorage.setItem('drummate_backend', type);
  }, [backendType, backend]);

  return (
    <BackendContext.Provider value={{ backend, backendType, switchBackend, backendLoading: loading }}>
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend() {
  const context = useContext(BackendContext);
  if (!context) throw new Error('useBackend must be used within BackendProvider');
  return context;
}
