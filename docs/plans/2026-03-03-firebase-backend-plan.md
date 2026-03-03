# Firebase Backend Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Firebase as a runtime-switchable alternative backend while keeping all PocketBase code intact.

**Architecture:** Create a backend interface that both PocketBase and Firebase implement. A BackendContext provides the active backend (persisted in localStorage). AuthContext and App.jsx consume it instead of importing PB modules directly. A backend selector on AuthScreen lets users switch.

**Tech Stack:** Firebase Auth, Cloud Firestore, React Context, existing Dexie.js local DB

**Design doc:** `docs/plans/2026-03-03-firebase-backend-design.md`

---

### Task 1: Install Firebase dependency

**Files:**
- Modify: `package.json`

**Step 1: Install firebase**

Run: `npm install firebase`
Expected: Package added to dependencies

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add firebase dependency"
```

---

### Task 2: Create backend interface definition

**Files:**
- Create: `src/services/backends/backendInterface.js`

**Step 1: Write the interface definition**

```js
/**
 * Backend Interface — every backend must export an object matching this shape.
 *
 * Auth methods:
 *   signIn(email, password) → { id, email, name }
 *   signUp(email, password, name) → { id, email, name }
 *   signOut() → void
 *   getUser() → { id, email, name } | null
 *   onAuthChange(callback: (user | null) => void) → unsubscribe: () => void
 *   refreshAuth() → { id, email, name } | null  (throws if token invalid)
 *
 * Sync methods:
 *   pushItem(localItem, userId) → void
 *   pushLog(localLog, userId) → void
 *   pushDeleteItem(name, userId) → void
 *   pushRenameItem(oldName, newName, userId) → void
 *   pullAll(userId) → void
 *   pushAllLocal(userId) → void
 *   flushSyncQueue(userId) → void
 *   subscribeToChanges(onDataChanged: () => void) → unsubscribe: () => void
 *
 * The `user` object returned by auth methods must have at minimum:
 *   { id: string, email: string, name: string | null }
 */
export const BACKEND_TYPES = {
  POCKETBASE: 'pocketbase',
  FIREBASE: 'firebase',
};
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/services/backends/backendInterface.js
git commit -m "feat: add backend interface definition"
```

---

### Task 3: Create PocketBase backend wrapper

This wraps the existing `pocketbase.js`, `sync.js`, and auth logic into the backend interface. No existing files are modified.

**Files:**
- Create: `src/services/backends/pocketbaseBackend.js`
- Reference (read-only): `src/services/pocketbase.js`, `src/services/sync.js`, `src/contexts/AuthContext.jsx`

**Step 1: Write the PocketBase backend**

```js
import { pb } from '../pocketbase';
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';

function normalizeUser(record) {
  if (!record) return null;
  return { id: record.id, email: record.email, name: record.name || null };
}

const pocketbaseBackend = {
  name: 'pocketbase',

  // Auth
  async signIn(email, password) {
    await pb.collection('users').authWithPassword(email, password);
    return normalizeUser(pb.authStore.record);
  },

  async signUp(email, password, name) {
    await pb.collection('users').create({
      email, password, passwordConfirm: password, name,
    });
    await pb.collection('users').authWithPassword(email, password);
    return normalizeUser(pb.authStore.record);
  },

  signOut() {
    pb.authStore.clear();
  },

  getUser() {
    return normalizeUser(pb.authStore.record);
  },

  onAuthChange(callback) {
    return pb.authStore.onChange((_token, record) => {
      callback(normalizeUser(record));
    });
  },

  async refreshAuth() {
    await pb.collection('users').authRefresh({ requestKey: 'auth-refresh' });
    return normalizeUser(pb.authStore.record);
  },

  isAbortError(err) {
    return !!err?.isAbort;
  },

  // Sync
  pushItem,
  pushLog,
  pushDeleteItem,
  pushRenameItem,
  pullAll,
  pushAllLocal,
  flushSyncQueue,
  subscribeToChanges,
};

export default pocketbaseBackend;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/services/backends/pocketbaseBackend.js
git commit -m "feat: add PocketBase backend wrapper"
```

---

### Task 4: Create Firebase app initialization

**Files:**
- Create: `src/services/firebase.js`

**Step 1: Write Firebase init**

```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

let app = null;
let auth = null;
let firestore = null;

export function getFirebaseApp() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firestore = getFirestore(app);
  }
  return { app, auth, db: firestore };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (firebase is tree-shaken if not imported elsewhere)

**Step 3: Commit**

```bash
git add src/services/firebase.js
git commit -m "feat: add Firebase app initialization"
```

---

### Task 5: Create Firebase backend implementation

**Files:**
- Create: `src/services/backends/firebaseBackend.js`
- Reference (read-only): `src/services/backends/backendInterface.js`, `src/services/database.js`, `src/services/sync.js` (for offline queue pattern)

**Step 1: Write the Firebase backend**

```js
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';
import { db } from '../database';

function normalizeUser(fbUser) {
  if (!fbUser) return null;
  return { id: fbUser.uid, email: fbUser.email, name: fbUser.displayName || null };
}

// --- Helpers ---

function itemsRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'practice_items');
}

function logsRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'practice_logs');
}

async function findRemoteItemByName(userId, name) {
  const q = query(itemsRef(userId), where('name', '==', name));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0];
}

async function findRemoteLogByUid(userId, uid) {
  const q = query(logsRef(userId), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0];
}

// --- Offline sync queue (reuses Dexie syncQueue table) ---

async function queueSync(action, payload) {
  await db.syncQueue.add({ action, payload });
}

// --- Backend ---

const firebaseBackend = {
  name: 'firebase',

  // Auth
  async signIn(email, password) {
    const { auth } = getFirebaseApp();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return normalizeUser(cred.user);
  },

  async signUp(email, password, name) {
    const { auth } = getFirebaseApp();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
    return normalizeUser(cred.user);
  },

  signOut() {
    const { auth } = getFirebaseApp();
    firebaseSignOut(auth);
  },

  getUser() {
    const { auth } = getFirebaseApp();
    return normalizeUser(auth.currentUser);
  },

  onAuthChange(callback) {
    const { auth } = getFirebaseApp();
    return onAuthStateChanged(auth, (fbUser) => {
      callback(normalizeUser(fbUser));
    });
  },

  async refreshAuth() {
    const { auth } = getFirebaseApp();
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('No user signed in');
    await fbUser.reload();
    return normalizeUser(auth.currentUser);
  },

  isAbortError() {
    return false; // Firebase doesn't have auto-cancellation like PocketBase
  },

  // Sync — push
  async pushItem(localItem, userId) {
    try {
      const existing = await findRemoteItemByName(userId, localItem.name);
      if (existing) return;
      await addDoc(itemsRef(userId), {
        name: localItem.name,
        created: serverTimestamp(),
      });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('create_item', { name: localItem.name });
      } else {
        throw err;
      }
    }
  },

  async pushLog(localLog, userId) {
    try {
      const item = await db.practiceItems.get(localLog.itemId);
      if (!item) return;

      const existingLog = await findRemoteLogByUid(userId, localLog.uid);
      if (existingLog) return;

      const remoteItem = await findRemoteItemByName(userId, item.name);
      if (!remoteItem) {
        await queueSync('create_log', {
          itemName: item.name, date: localLog.date,
          duration: localLog.duration, uid: localLog.uid,
        });
        return;
      }

      await addDoc(logsRef(userId), {
        item_name: item.name,
        date: localLog.date,
        duration: localLog.duration,
        uid: localLog.uid,
        created: serverTimestamp(),
      });
    } catch (err) {
      if (!navigator.onLine) {
        const item = await db.practiceItems.get(localLog.itemId);
        await queueSync('create_log', {
          itemName: item?.name, date: localLog.date,
          duration: localLog.duration, uid: localLog.uid,
        });
      } else {
        throw err;
      }
    }
  },

  async pushDeleteItem(name, userId) {
    try {
      const remoteItem = await findRemoteItemByName(userId, name);
      if (remoteItem) {
        // Also delete all logs for this item
        const q = query(logsRef(userId), where('item_name', '==', name));
        const snap = await getDocs(q);
        for (const logDoc of snap.docs) {
          await deleteDoc(logDoc.ref);
        }
        await deleteDoc(remoteItem.ref);
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_item', { name });
      } else {
        throw err;
      }
    }
  },

  async pushRenameItem(oldName, newName, userId) {
    try {
      const remoteItem = await findRemoteItemByName(userId, oldName);
      if (remoteItem) {
        await updateDoc(remoteItem.ref, { name: newName });
        // Also update denormalized item_name in logs
        const q = query(logsRef(userId), where('item_name', '==', oldName));
        const snap = await getDocs(q);
        for (const logDoc of snap.docs) {
          await updateDoc(logDoc.ref, { item_name: newName });
        }
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('rename_item', { oldName, newName });
      } else {
        throw err;
      }
    }
  },

  // Sync — pull
  async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    for (const docSnap of itemsSnap.docs) {
      const data = docSnap.data();
      const existing = await db.practiceItems
        .where('name').equals(data.name).first();
      if (!existing) {
        await db.practiceItems.add({ name: data.name });
      }
    }

    const logsSnap = await getDocs(logsRef(userId));
    for (const docSnap of logsSnap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      const existing = await db.practiceLogs
        .where('uid').equals(data.uid).first();
      if (!existing) {
        const localItem = await db.practiceItems
          .where('name').equals(data.item_name).first();
        if (localItem) {
          await db.practiceLogs.add({
            itemId: localItem.id,
            date: data.date,
            duration: data.duration,
            uid: data.uid,
          });
        }
      }
    }
  },

  async pushAllLocal(userId) {
    const items = await db.practiceItems.toArray();
    for (const item of items) {
      await firebaseBackend.pushItem(item, userId);
    }
    const logs = await db.practiceLogs.toArray();
    for (const log of logs) {
      await firebaseBackend.pushLog(log, userId);
    }
  },

  async flushSyncQueue(userId) {
    const pending = await db.syncQueue.toArray();
    for (const entry of pending) {
      try {
        if (entry.action === 'create_item') {
          await firebaseBackend.pushItem({ name: entry.payload.name }, userId);
        } else if (entry.action === 'create_log') {
          const localItem = await db.practiceItems
            .where('name').equals(entry.payload.itemName).first();
          if (localItem) {
            await firebaseBackend.pushLog({
              itemId: localItem.id, date: entry.payload.date,
              duration: entry.payload.duration, uid: entry.payload.uid,
            }, userId);
          }
        } else if (entry.action === 'delete_item') {
          await firebaseBackend.pushDeleteItem(entry.payload.name, userId);
        } else if (entry.action === 'rename_item') {
          await firebaseBackend.pushRenameItem(
            entry.payload.oldName, entry.payload.newName, userId);
        }
        await db.syncQueue.delete(entry.id);
      } catch (err) {
        console.error('Sync queue flush failed for entry:', entry, err);
        break;
      }
    }
  },

  // Real-time subscriptions
  subscribeToChanges(onDataChanged) {
    const { auth } = getFirebaseApp();
    const userId = auth.currentUser?.uid;
    if (!userId) return () => {};

    const unsubItems = onSnapshot(itemsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === 'added') {
          const existing = await db.practiceItems
            .where('name').equals(data.name).first();
          if (!existing) {
            await db.practiceItems.add({ name: data.name });
            onDataChanged();
          }
        } else if (change.type === 'modified') {
          // Handle renames: find local item with old name
          const allLocal = await db.practiceItems.toArray();
          const allRemoteNames = new Set();
          const itemsSnap = await getDocs(itemsRef(userId));
          itemsSnap.forEach(d => allRemoteNames.add(d.data().name));
          const stale = allLocal.find(li => !allRemoteNames.has(li.name));
          if (stale) {
            await db.practiceItems.update(stale.id, { name: data.name });
          }
          onDataChanged();
        } else if (change.type === 'removed') {
          const existing = await db.practiceItems
            .where('name').equals(data.name).first();
          if (existing) {
            await db.practiceLogs.where('itemId').equals(existing.id).delete();
            await db.practiceItems.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    const unsubLogs = onSnapshot(logsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === 'added' && data.uid) {
          const existing = await db.practiceLogs
            .where('uid').equals(data.uid).first();
          if (!existing) {
            const localItem = await db.practiceItems
              .where('name').equals(data.item_name).first();
            if (localItem) {
              await db.practiceLogs.add({
                itemId: localItem.id,
                date: data.date,
                duration: data.duration,
                uid: data.uid,
              });
              onDataChanged();
            }
          }
        } else if (change.type === 'removed' && data.uid) {
          const existing = await db.practiceLogs
            .where('uid').equals(data.uid).first();
          if (existing) {
            await db.practiceLogs.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    return () => {
      unsubItems();
      unsubLogs();
    };
  },
};

export default firebaseBackend;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat: add Firebase backend implementation"
```

---

### Task 6: Create BackendContext

**Files:**
- Create: `src/contexts/BackendContext.jsx`

**Step 1: Write the BackendContext**

```jsx
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import pocketbaseBackend from '../services/backends/pocketbaseBackend';
import { BACKEND_TYPES } from '../services/backends/backendInterface';

const BackendContext = createContext();

function getInitialBackend() {
  try {
    const saved = localStorage.getItem('drummate_backend');
    if (saved === BACKEND_TYPES.FIREBASE) return BACKEND_TYPES.FIREBASE;
  } catch {}
  return BACKEND_TYPES.POCKETBASE;
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/contexts/BackendContext.jsx
git commit -m "feat: add BackendContext for runtime backend switching"
```

---

### Task 7: Update AuthContext to use BackendContext

**Files:**
- Modify: `src/contexts/AuthContext.jsx`

**Step 1: Rewrite AuthContext to use useBackend()**

Replace the entire contents of `src/contexts/AuthContext.jsx` with:

```jsx
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
    setUser(backend.getUser());
    setSessionExpired(false);
    setAuthReady(false);

    // Try to refresh existing auth
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
      setAuthReady(true);
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/contexts/AuthContext.jsx
git commit -m "refactor: update AuthContext to use BackendContext"
```

---

### Task 8: Update App.jsx to use BackendContext for sync

**Files:**
- Modify: `src/App.jsx`

**Step 1: Replace sync imports with useBackend()**

In `src/App.jsx`, remove line 33:
```js
import { pushItem, pushLog, pushDeleteItem, pushRenameItem, pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges } from './services/sync';
```

**Step 2: Add useBackend() import and hook call**

Add to the imports (around line 12):
```js
import { useBackend } from './contexts/BackendContext';
```

Inside the `App()` function, after the `useAuth()` line (line 38), add:
```js
const { backend } = useBackend();
```

**Step 3: Replace all sync function calls**

Replace every direct sync function call with `backend.<method>`:

| Find | Replace with |
|------|-------------|
| `flushSyncQueue(` | `backend.flushSyncQueue(` |
| `pushAllLocal(` | `backend.pushAllLocal(` |
| `pullAll(` | `backend.pullAll(` |
| `subscribeToChanges(` | `backend.subscribeToChanges(` |
| `pushLog(` | `backend.pushLog(` |
| `pushItem(` | `backend.pushItem(` |
| `pushRenameItem(` | `backend.pushRenameItem(` |
| `pushDeleteItem(` | `backend.pushDeleteItem(` |

Also add `backend` to the dependency arrays of:
- The sync useEffect (line ~235): add `backend` to `[user, authReady, loadData]`
- `saveAndStop` (line ~340): add `backend`
- `handleStart` (line ~366): add `backend`
- `handleAddItem` (line ~411): add `backend`
- `handleRenameItem` (line ~430): add `backend`
- `handleDeleteItem` (line ~442): add `backend`

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: update App.jsx to use BackendContext for sync"
```

---

### Task 9: Update main.jsx to wrap with BackendProvider

**Files:**
- Modify: `src/main.jsx`

**Step 1: Add BackendProvider wrapping AuthProvider**

Replace `src/main.jsx` contents with:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './contexts/LanguageContext'
import { BackendProvider } from './contexts/BackendContext'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <BackendProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BackendProvider>
    </LanguageProvider>
  </StrictMode>,
)
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/main.jsx
git commit -m "feat: wrap app with BackendProvider"
```

---

### Task 10: Add i18n keys for backend selector

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

**Step 1: Add backend translation keys**

In the `en` translations object, add after the `auth` block (after line 72):

```js
backend: {
  label: 'Sync Service',
  pocketbase: 'PocketBase',
  firebase: 'Firebase',
},
```

In the `zh` translations object, add after the `auth` block (after line 202):

```js
backend: {
  label: '同步服务',
  pocketbase: 'PocketBase',
  firebase: 'Firebase',
},
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add i18n keys for backend selector"
```

---

### Task 11: Add backend selector to AuthScreen

**Files:**
- Modify: `src/components/AuthScreen.jsx`

**Step 1: Add backend selector UI**

Add the import at the top:
```js
import { useBackend } from '../contexts/BackendContext';
import { BACKEND_TYPES } from '../services/backends/backendInterface';
```

Inside the component, add after the existing destructuring:
```js
const { backendType, switchBackend } = useBackend();
```

Add the backend selector UI between the brand header `</div>` and the `{sessionExpired && (` block. Insert:

```jsx
{/* Backend selector */}
<div className="flex items-center justify-between mb-4 px-1">
  <span className="text-sm text-gray-500">{t('backend.label')}</span>
  <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
    {[BACKEND_TYPES.POCKETBASE, BACKEND_TYPES.FIREBASE].map((type) => (
      <button
        key={type}
        onClick={() => switchBackend(type)}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
          backendType === type
            ? 'bg-white text-gray-800 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {t(`backend.${type}`)}
      </button>
    ))}
  </div>
</div>
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/AuthScreen.jsx
git commit -m "feat: add backend selector to AuthScreen"
```

---

### Task 12: Final build verification and cleanup

**Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no warnings about unused imports

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors

**Step 3: Verify PocketBase still works**

Run: `npm run dev`
Manual check:
- App loads with PocketBase selected by default
- Sign in works as before
- Practice items sync
- Switching to Firebase shows Firebase auth screen

**Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: final cleanup for backend provider feature"
```

---

## Firebase Project Setup (Manual — Not Code)

After implementing all tasks, you'll need to:

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Email/Password auth in Authentication > Sign-in method
3. Create a Firestore database (start in test mode, then add security rules)
4. Copy the Firebase config values to your `.env`:
   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   ```
5. Add Firestore security rules:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
