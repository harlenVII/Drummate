import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useBackend } from './BackendContext';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const { backend, backendLoading } = useBackend();
  const [user, setUser] = useState(() => backend.getUser());
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Reset auth state when backend changes
    const currentUser = backend.getUser();
    if (currentUser) {
      backend.refreshAuth()
        .then((refreshedUser) => {
          setUser(refreshedUser);
        })
        .catch((err) => {
          if (backend.isAbortError(err)) return;
          backend.signOut();
          setUser(null);
          setSessionExpired(true);
        })
        .finally(() => setAuthReady(true));
    } else {
      Promise.resolve().then(() => setAuthReady(true));
    }

    const unsubscribe = backend.onAuthChange((newUser) => {
      setUser(newUser);
    });

    return unsubscribe;
  }, [backend]);

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    const user = await backend.signIn(email, password);
    setUser(user);
  }, [backend]);

  const signUp = useCallback(async (email, password, name) => {
    const user = await backend.signUp(email, password, name);
    setUser(user);
  }, [backend]);

  const signOut = useCallback(() => {
    backend.signOut();
    setUser(null);
  }, [backend]);

  const loading = backendLoading;

  return (
    <AuthContext.Provider value={{ user, loading, authReady, sessionExpired, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
