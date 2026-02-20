import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pb } from '../services/pocketbase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);
  const [sessionExpired, setSessionExpired] = useState(false);
  const loading = false;

  useEffect(() => {
    if (pb.authStore.isValid) {
      // Token exists locally — show app immediately, refresh silently
      pb.collection('users').authRefresh({ requestKey: 'auth-refresh' })
        .then(() => setUser(pb.authStore.record))
        .catch((err) => {
          // Ignore auto-cancelled requests (e.g. React StrictMode double-firing)
          if (err?.isAbort) return;
          pb.authStore.clear();
          setUser(null);
          setSessionExpired(true);
        });
    }

    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    await pb.collection('users').authWithPassword(email, password);
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    await pb.collection('users').create({
      email, password, passwordConfirm: password, name,
    });
    await pb.collection('users').authWithPassword(email, password);
  }, []);

  const signOut = useCallback(() => {
    pb.authStore.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
