# Firebase Backend Provider — Design Document

**Goal:** Add Firebase as a switchable alternative backend to PocketBase, allowing runtime switching via UI while keeping all existing PocketBase code intact.

**Approach:** Backend Provider Pattern — a common interface that both PocketBase and Firebase implement, with a React Context providing the active backend.

---

## Backend Interface Contract

Every backend must implement:

```js
{
  // Auth
  signIn(email, password) → user
  signUp(email, password, name) → user
  signOut()
  getUser() → user | null
  onAuthChange(callback) → unsubscribe
  refreshAuth() → user

  // Sync
  pushItem(localItem, userId)
  pushLog(localLog, userId)
  pushDeleteItem(name, userId)
  pushRenameItem(oldName, newName, userId)
  pullAll(userId)
  pushAllLocal(userId)
  flushSyncQueue(userId)
  subscribeToChanges(onDataChanged) → unsubscribe
}
```

## Firebase Data Model

**Services used (all free tier):**
- Firebase Auth — email/password
- Cloud Firestore — data storage

**Firestore collections:**

```
users/{userId}/practice_items/{docId}
  - name: string
  - created: timestamp

users/{userId}/practice_logs/{docId}
  - item_name: string    (denormalized — avoids cross-collection lookups)
  - date: string         (YYYY-MM-DD)
  - duration: number
  - uid: string          (UUID from Dexie, used for dedup)
  - created: timestamp
```

Data nested under `users/{userId}/` subcollections for automatic security — users can only access their own data via Firestore security rules.

**Dedup strategy (same as PocketBase):** items by `name`, logs by `uid`.

**Real-time sync:** Firestore `onSnapshot` listeners replace PocketBase SSE subscriptions.

## Backend Switching

- Persisted in `localStorage` as `drummate_backend` (`"pocketbase"` | `"firebase"`)
- Default: `"pocketbase"`
- Switching backends signs the user out
- Backend selector shown on AuthScreen (before sign-in)
- No data migration between backends — local Dexie data stays intact, `pushAllLocal` syncs to new backend on sign-in

## File Changes

**New files (5):**
- `src/services/backends/backendInterface.js` — contract documentation
- `src/services/backends/pocketbaseBackend.js` — wraps existing PB code
- `src/services/backends/firebaseBackend.js` — Firebase implementation
- `src/services/firebase.js` — Firebase app init
- `src/contexts/BackendContext.jsx` — provides active backend

**Modified files (3):**
- `src/contexts/AuthContext.jsx` — use `useBackend()` for auth methods
- `src/App.jsx` — use `useBackend()` for sync functions
- `src/components/AuthScreen.jsx` — add backend selector UI

**Unchanged:**
- `src/services/pocketbase.js` — stays as-is
- `src/services/sync.js` — stays as-is (imported by PB backend wrapper)
- `src/services/database.js` — stays as-is (Dexie is local-only, backend-agnostic)

**New dependency:** `firebase`

**New env vars:** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
