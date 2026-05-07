# Drop PocketBase Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all PocketBase code and the backend-switching abstraction layer; wire Firebase directly as the sole backend.

**Architecture:** Delete 5 files entirely (PocketBase impl, sync.js, BackendContext, backendInterface, pocketbase.js). Update 6 files to import `firebaseBackend` directly and strip backend-switcher UI. No new logic is introduced — this is a deletion and rewiring task.

**Tech Stack:** React 19, Vite 7, Dexie.js, Firebase (Firestore + Firebase Auth via `src/services/backends/firebaseBackend.js`)

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Delete | `src/services/pocketbase.js` | PocketBase SDK init |
| Delete | `src/services/backends/pocketbaseBackend.js` | PocketBase backend impl |
| Delete | `src/services/backends/backendInterface.js` | Backend contract |
| Delete | `src/services/sync.js` | PocketBase-only sync functions |
| Delete | `src/contexts/BackendContext.jsx` | Backend switching layer |
| Modify | `src/main.jsx` | Remove `BackendProvider` wrapper |
| Modify | `src/contexts/AuthContext.jsx` | Use `firebaseBackend` directly, remove `loading` |
| Modify | `src/App.jsx` | Use `firebaseBackend` directly, remove `loading` block |
| Modify | `src/components/AuthScreen.jsx` | Remove backend-switcher UI |
| Modify | `src/contexts/LanguageContext.jsx` | Remove `backend.*` i18n keys |
| Modify | `package.json` | Remove `pocketbase` dependency |
| Modify | `CLAUDE.md` | Remove PocketBase references from docs |

---

## Task 1: Delete PocketBase-only files

**Files:**
- Delete: `src/services/pocketbase.js`
- Delete: `src/services/backends/pocketbaseBackend.js`
- Delete: `src/services/backends/backendInterface.js`
- Delete: `src/services/sync.js`
- Delete: `src/contexts/BackendContext.jsx`

- [ ] **Step 1: Delete the five files**

```bash
rm src/services/pocketbase.js \
   src/services/backends/pocketbaseBackend.js \
   src/services/backends/backendInterface.js \
   src/services/sync.js \
   src/contexts/BackendContext.jsx
```

- [ ] **Step 2: Confirm they are gone**

```bash
ls src/services/pocketbase.js src/services/sync.js src/contexts/BackendContext.jsx 2>&1
```

Expected: `No such file or directory` for all three paths.

---

## Task 2: Update `src/main.jsx`

**Files:**
- Modify: `src/main.jsx`

Remove `BackendProvider` import and its wrapper element. The provider hierarchy becomes `LanguageProvider → AuthProvider → App`.

- [ ] **Step 1: Replace the full file content**

Write `src/main.jsx` as:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './contexts/LanguageContext'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Commit**

```bash
git add src/main.jsx
git commit -m "refactor: remove BackendProvider from provider hierarchy"
```

---

## Task 3: Update `src/contexts/AuthContext.jsx`

**Files:**
- Modify: `src/contexts/AuthContext.jsx`

Replace `useBackend()` with a direct static import of `firebaseBackend`. Remove `loading` (was `backendLoading`) — Firebase is statically imported so there is no async loading phase. Remove `loading` from the context value. The `useEffect` dependency array changes from `[backend]` to `[]` since `firebaseBackend` is a module-level constant.

- [ ] **Step 1: Replace the full file content**

Write `src/contexts/AuthContext.jsx` as:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import firebaseBackend from '../services/backends/firebaseBackend';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => firebaseBackend.getUser());
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

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    const newUser = await firebaseBackend.signIn(email, password);
    setUser(newUser);
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const newUser = await firebaseBackend.signUp(email, password, name);
    setUser(newUser);
  }, []);

  const signOut = useCallback(() => {
    firebaseBackend.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authReady, sessionExpired, signIn, signUp, signOut }}>
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

- [ ] **Step 2: Commit**

```bash
git add src/contexts/AuthContext.jsx
git commit -m "refactor: wire firebaseBackend directly in AuthContext, remove loading state"
```

---

## Task 4: Update `src/App.jsx`

**Files:**
- Modify: `src/App.jsx`

Four changes:
1. Remove `import { useBackend }` line (line 15).
2. Add `import firebaseBackend from './services/backends/firebaseBackend';` after the `useAuth` import.
3. On the `useAuth()` destructure (line 46), remove `loading` from the destructure.
4. Remove `const { backend } = useBackend();` (line 47).
5. Replace all `backend.` occurrences with `firebaseBackend.`.
6. Remove the `// Sync with PocketBase on sign-in` comment (line 297).
7. Remove the `if (loading)` early-return block (lines 1147–1153).

- [ ] **Step 1: Remove `useBackend` import and add `firebaseBackend` import**

Find and remove:
```js
import { useBackend } from './contexts/BackendContext';
```

Add directly below `import { useAuth } from './contexts/AuthContext';`:
```js
import firebaseBackend from './services/backends/firebaseBackend';
```

- [ ] **Step 2: Update the `useAuth` destructure and remove `useBackend()` call**

Find:
```js
  const { user, loading, authReady, signOut } = useAuth();
  const { backend } = useBackend();
```

Replace with:
```js
  const { user, authReady, signOut } = useAuth();
```

- [ ] **Step 3: Replace all `backend.` with `firebaseBackend.`**

There are 16 occurrences. Run a global find-and-replace in the file:
- Find: `backend.`
- Replace: `firebaseBackend.`

Affected lines (for verification): 260, 309, 310, 311, 318, 424, 444, 490, 502, 519, 531, 548, 565, 577, 603, 661.

- [ ] **Step 4: Remove the stale PocketBase comment**

Find and remove the comment line:
```js
  // Sync with PocketBase on sign-in (wait for token refresh to complete)
```

- [ ] **Step 5: Remove the `if (loading)` spinner block**

Find and remove:
```jsx
  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-lg">{t('auth.syncing')}</div>
      </div>
    );
  }
```

- [ ] **Step 6: Verify no remaining `backend` references**

```bash
grep -n "\bbackend\b" src/App.jsx
```

Expected: zero results (or only string literals like `'drummate_backend'` in localStorage — those are fine, they're just key names).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: use firebaseBackend directly in App, remove loading spinner"
```

---

## Task 5: Update `src/components/AuthScreen.jsx`

**Files:**
- Modify: `src/components/AuthScreen.jsx`

Remove the `BACKEND_TYPES` import (line 4) and the entire backend-selector block (lines 50–66).

- [ ] **Step 1: Remove the `BACKEND_TYPES` import**

Find and remove:
```js
import { BACKEND_TYPES } from '../services/backends/backendInterface';
```

- [ ] **Step 2: Remove the backend-selector UI block**

Find and remove the entire block from the JSX:
```jsx
        {/* Backend selector */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-sm text-gray-500">{t('backend.label')}</span>
          <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
            <button
              disabled
              className="px-3 py-1 rounded-md text-sm font-medium text-gray-400 cursor-not-allowed opacity-50 line-through"
            >
              {t(`backend.${BACKEND_TYPES.POCKETBASE}`)}
            </button>
            <button
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors bg-white text-gray-800 shadow-sm"
            >
              {t(`backend.${BACKEND_TYPES.FIREBASE}`)}
            </button>
          </div>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthScreen.jsx
git commit -m "refactor: remove backend-switcher UI from AuthScreen"
```

---

## Task 6: Update `src/contexts/LanguageContext.jsx`

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

Remove the `backend` key from both the `en` and `zh` translation objects.

- [ ] **Step 1: Remove the `backend` block from the `en` translations**

Find and remove (around line 106):
```js
    backend: {
      label: 'Sync Service',
      pocketbase: 'PocketBase',
      firebase: 'Firebase',
    },
```

- [ ] **Step 2: Remove the `backend` block from the `zh` translations**

Find and remove (around line 306):
```js
    backend: {
      label: '同步服务',
      pocketbase: 'PocketBase',
      firebase: 'Firebase',
    },
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "refactor: remove backend i18n keys from LanguageContext"
```

---

## Task 7: Remove the `pocketbase` npm package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall the package**

```bash
npm uninstall pocketbase
```

Expected output: confirms `pocketbase` removed and `package.json` / `package-lock.json` updated.

- [ ] **Step 2: Verify it is gone**

```bash
grep "pocketbase" package.json
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove pocketbase npm dependency"
```

---

## Task 8: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

Remove all PocketBase references from the architecture documentation.

- [ ] **Step 1: Update the Provider Hierarchy comment**

Find:
```
`BackendProvider` lazy-loads Firebase SDK only when Firebase backend is selected. `AuthProvider` delegates to the active backend from `useBackend()`.
```

Replace with:
```
`AuthProvider` uses `firebaseBackend` directly. Firebase is the sole backend.
```

- [ ] **Step 2: Remove the Pluggable Backend System section**

Find and remove the entire section:
```markdown
### Pluggable Backend System

Backend abstraction layer allows switching between Firebase and PocketBase:

- `src/services/backends/backendInterface.js` — Contract that all backends must implement (auth + sync methods)
- `src/services/backends/firebaseBackend.js` — Firebase implementation (Firestore + Firebase Auth)
- `src/services/backends/pocketbaseBackend.js` — PocketBase implementation (REST API + SSE)
- `src/contexts/BackendContext.jsx` — `useBackend()` hook returns `{ backend, backendType, switchBackend }`

**Backend interface contract** (every backend must implement):
- **Auth:** `signIn`, `signUp`, `signOut`, `getUser`, `onAuthChange`, `refreshAuth`
- **Sync:** `pushItem`, `pushLog`, `pushDeleteItem`, `pushRenameItem`, `pushReorder`, `pushArchiveItem`, `pushTrashItem`, `pushSetCategory`, `pullAll`, `pushAllLocal`, `flushSyncQueue`, `subscribeToChanges`
```

- [ ] **Step 3: Remove the PocketBase env var section**

Find and remove:
```markdown
# PocketBase (alternative backend)
VITE_POCKETBASE_URL         # PocketBase server URL
```

- [ ] **Step 4: Remove PocketBase-specific gotchas**

Remove gotcha #9:
```markdown
9. **PocketBase auto-cancellation** — always use `requestKey: null` on API calls to prevent the SDK from cancelling concurrent requests
```

Remove gotcha #16:
```markdown
16. **PocketBase uid-migration** — `pushDeleteItem`, `pushRenameItem`, `pushReorder`, `pushArchiveItem`, `pushTrashItem`, and `pushSetCategory` in `sync.js` are `console.warn` stubs pending a uid-based schema migration for PocketBase. Firebase has full implementations. New category-related sync ops must follow the same stub pattern until the migration lands.
```

- [ ] **Step 5: Update gotcha #12 (Firebase SDK lazy-loaded)**

Find:
```markdown
12. **Firebase SDK lazy-loaded** — `BackendContext` dynamically imports `firebaseBackend.js` to avoid bundling Firebase when using PocketBase
```

Replace with:
```markdown
12. **Firebase SDK** — `firebaseBackend.js` is imported statically; it is always bundled
```

- [ ] **Step 6: Renumber gotchas if needed**

After removing #9 and #16, renumber the remaining gotchas so they are sequential (10 → 9, 11 → 10, etc.).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: remove PocketBase references from CLAUDE.md"
```

---

## Task 9: Build verification

- [ ] **Step 1: Run the production build**

```bash
npm run build
```

Expected: exits with code 0, no errors, no warnings referencing `pocketbase`, `BackendContext`, `backendInterface`, or `sync.js`.

- [ ] **Step 2: Confirm no PocketBase imports remain**

```bash
grep -r "pocketbase\|PocketBase\|BackendContext\|backendInterface\|useBackend" src/ --include="*.js" --include="*.jsx"
```

Expected: zero results.

- [ ] **Step 3: Confirm no stale console.warn stubs**

```bash
grep -r "uid-migration\|PocketBase uid" src/ --include="*.js" --include="*.jsx"
```

Expected: zero results.
