import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pb } from '../services/pocketbase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pb.authStore.isValid) {
      pb.collection('users').authRefresh()
        .then(() => setUser(pb.authStore.record))
        .catch(() => { pb.authStore.clear(); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email, password) => {
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
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
