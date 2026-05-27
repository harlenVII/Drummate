# Visitor / Anonymous Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users skip Firebase auth and use Drummate with full functionality, data stored only in local Dexie. Provide one-way migration on sign-up, fresh-start on sign-in, and a destructive log-off path.

**Architecture:** Add a single `isVisitor` boolean to `AuthContext`, persisted to `localStorage['drummate_visitor']`. The app gate becomes `!user && !isVisitor`. All existing `if (user)` guards around `firebaseBackend.push*` calls already short-circuit in visitor mode, so no Firestore push sites change. A transient React-state `fromVisitorIntent` ('signIn' | 'signUp' | null) tells `AuthContext.signIn` / `signUp` whether to migrate local Dexie to the new account or wipe and pull from cloud.

**Tech Stack:** React 19, Vite, Dexie.js, Firebase. Tests in Vitest under `tests/`.

**Spec:** [docs/superpowers/specs/2026-05-27-visitor-mode-design.md](../specs/2026-05-27-visitor-mode-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [src/services/database.js](../../../src/services/database.js) | Modify | Add `wipeAllLocalData()` |
| [src/services/priorPracticeService.js](../../../src/services/priorPracticeService.js) | Modify | Make `setPriorHours` skip backend when `userId` is falsy |
| [src/contexts/AuthContext.jsx](../../../src/contexts/AuthContext.jsx) | Modify | Add `isVisitor`, `fromVisitorIntent`, three visitor actions, post-auth branching |
| [src/components/AuthScreen.jsx](../../../src/components/AuthScreen.jsx) | Modify | Add "Continue as guest" button + confirm modal, upgrade banner, initial-mode selection |
| [src/components/SettingsPanel.jsx](../../../src/components/SettingsPanel.jsx) | Modify | Visitor-mode header (Guest badge) + three buttons + log-off confirm modal |
| [src/App.jsx](../../../src/App.jsx) | Modify | Update auth gate `!user && !isVisitor`, pass visitor props to SettingsPanel |
| [src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx) | Modify | Add visitor-mode i18n keys (en + zh) |
| [tests/visitorMode.test.js](../../../tests/visitorMode.test.js) | Create | Unit tests for `wipeAllLocalData` + `setPriorHours` null-userId path |
| [tests/authContext.test.jsx](../../../tests/authContext.test.jsx) | Create | Unit tests for `AuthContext` visitor state transitions |

---

## Task 1: Add `wipeAllLocalData` to database.js

**Files:**
- Modify: [src/services/database.js](../../../src/services/database.js)
- Test: [tests/visitorMode.test.js](../../../tests/visitorMode.test.js) (create)

- [ ] **Step 1: Write failing test**

Create `tests/visitorMode.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, wipeAllLocalData, addItem, addLog } from '../src/services/database';

describe('wipeAllLocalData', () => {
  beforeEach(async () => {
    await db.practiceItems.clear();
    await db.practiceLogs.clear();
    await db.notes.clear();
    await db.metronomePractices.clear();
    await db.syncQueue.clear();
  });

  it('clears all data tables', async () => {
    const item = await addItem('Test Item', 'fundamentals');
    await addLog(item.id, 600);
    await db.notes.add({ uid: 'n1', itemUid: item.uid, date: '2026-05-27', body: 'note' });
    await db.metronomePractices.add({ uid: 'mp1', sortOrder: 0, name: 'practice' });
    await db.syncQueue.add({ action: 'push_item', collection: 'items', payload: {}, localId: 1 });

    expect(await db.practiceItems.count()).toBe(1);
    expect(await db.practiceLogs.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
    expect(await db.metronomePractices.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(1);

    await wipeAllLocalData();

    expect(await db.practiceItems.count()).toBe(0);
    expect(await db.practiceLogs.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.metronomePractices.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run tests/visitorMode.test.js`
Expected: FAIL — `wipeAllLocalData is not a function` or similar import error.

- [ ] **Step 3: Implement `wipeAllLocalData`**

In `src/services/database.js`, add this export (near the other table-level helpers, e.g., right after the `purgeExpiredTrash` function around line 285):

```js
export const wipeAllLocalData = async () => {
  await db.transaction(
    'rw',
    db.practiceItems,
    db.practiceLogs,
    db.notes,
    db.metronomePractices,
    db.syncQueue,
    async () => {
      await db.practiceItems.clear();
      await db.practiceLogs.clear();
      await db.notes.clear();
      await db.metronomePractices.clear();
      await db.syncQueue.clear();
    }
  );
};
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run tests/visitorMode.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/database.js tests/visitorMode.test.js
git commit -m "feat(db): add wipeAllLocalData for visitor mode

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Make `setPriorHours` tolerate null userId

**Files:**
- Modify: [src/services/priorPracticeService.js](../../../src/services/priorPracticeService.js)
- Test: [tests/visitorMode.test.js](../../../tests/visitorMode.test.js)

- [ ] **Step 1: Add failing test**

Append to `tests/visitorMode.test.js`:

```js
import { setPriorHours, getPriorHours } from '../src/services/priorPracticeService';

describe('setPriorHours with null userId', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('writes localStorage without calling backend when userId is null', async () => {
    let backendCalled = false;
    const fakeBackend = {
      setUserSetting: async () => {
        backendCalled = true;
      },
    };

    await setPriorHours(5, fakeBackend, null);

    expect(getPriorHours()).toBe(5);
    expect(backendCalled).toBe(false);
  });

  it('still calls backend when userId is provided', async () => {
    let receivedUserId = null;
    const fakeBackend = {
      setUserSetting: async (uid) => {
        receivedUserId = uid;
      },
    };

    await setPriorHours(3, fakeBackend, 'user-123');

    expect(getPriorHours()).toBe(3);
    expect(receivedUserId).toBe('user-123');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run tests/visitorMode.test.js`
Expected: FAIL — `setPriorHours` calls `backend.setUserSetting(null, ...)` which currently does not short-circuit.

- [ ] **Step 3: Update `setPriorHours`**

In `src/services/priorPracticeService.js`, replace the function:

```js
export async function setPriorHours(hours, backend, userId) {
  const value = Math.floor(Math.max(0, hours));
  globalThis.localStorage.setItem(KEY, String(value));
  if (backend && userId) {
    await backend.setUserSetting(userId, 'priorPracticeHours', value);
  }
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run tests/visitorMode.test.js`
Expected: PASS (both new tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/priorPracticeService.js tests/visitorMode.test.js
git commit -m "fix(priorHours): skip backend write when userId is null

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Add visitor-mode i18n keys

**Files:**
- Modify: [src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx)

- [ ] **Step 1: Locate the `en.auth` and `en.settings` objects (and their `zh` counterparts)**

Open `src/contexts/LanguageContext.jsx` and find the translation tables. Confirm `auth.signIn`, `auth.signUp`, `auth.signOut` already exist.

- [ ] **Step 2: Add the new keys**

Inside the `en` `auth` block, add:

```js
continueAsGuest: 'Continue as guest',
guestWipeWarning:
  'Continue as guest? This will clear any existing local data on this device. Your practice data will not be backed up to the cloud.',
guestConfirmButton: 'Continue as guest',
guestCancel: 'Cancel',
upgradeBannerSignUp:
  'Your local practice data will be saved to your new account when you sign up.',
upgradeBannerSignIn:
  'Signing into an existing account will replace your local data with your account data.',
dividerOr: 'or',
```

Inside the `en` `settings` block (create the block if missing), add:

```js
guestBadge: 'Guest',
guestSignIn: 'Sign in',
guestSignUp: 'Create account',
guestLogOff: 'Log off',
guestLogOffConfirm:
  'Log off? Your local practice data will be deleted. To keep it, sign up instead.',
guestLogOffConfirmButton: 'Log off',
guestLogOffCancel: 'Cancel',
```

Inside the `zh` `auth` block:

```js
continueAsGuest: '以访客身份继续',
guestWipeWarning:
  '以访客身份继续？这将清除此设备上的所有本地数据。您的练习数据不会备份到云端。',
guestConfirmButton: '以访客身份继续',
guestCancel: '取消',
upgradeBannerSignUp: '注册后，您的本地练习数据将保存到新账户。',
upgradeBannerSignIn: '登录现有账户将用账户数据替换本地数据。',
dividerOr: '或',
```

Inside the `zh` `settings` block:

```js
guestBadge: '访客',
guestSignIn: '登录',
guestSignUp: '注册',
guestLogOff: '退出',
guestLogOffConfirm: '退出后将删除本地练习数据。要保留数据请改为注册账户。',
guestLogOffConfirmButton: '退出',
guestLogOffCancel: '取消',
```

- [ ] **Step 3: Build to confirm no syntax errors**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(i18n): add visitor-mode strings (en + zh)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Extend `AuthContext` with visitor state + intent

**Files:**
- Modify: [src/contexts/AuthContext.jsx](../../../src/contexts/AuthContext.jsx)
- Test: [tests/authContext.test.jsx](../../../tests/authContext.test.jsx) (create)

- [ ] **Step 1: Write failing test for visitor state transitions**

Create `tests/authContext.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, act, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

vi.mock('../src/services/backends/firebaseBackend', () => ({
  default: {
    getUser: () => null,
    onAuthChange: () => () => {},
    refreshAuth: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    isAbortError: () => false,
    isNetworkError: () => false,
    pushAllLocal: vi.fn().mockResolvedValue(),
    pushAllLocalLogs: vi.fn().mockResolvedValue(),
    pushAllLocalNotes: vi.fn().mockResolvedValue(),
    pushAllLocalPractices: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('../src/services/database', () => ({
  wipeAllLocalData: vi.fn().mockResolvedValue(),
}));

function Probe() {
  const ctx = useAuth();
  return (
    <div>
      <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
      <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
      <span data-testid="fromVisitorIntent">{String(ctx.fromVisitorIntent)}</span>
      <button onClick={() => ctx.enterVisitorMode()}>enter</button>
      <button onClick={() => ctx.exitVisitorModeForAuth('signUp')}>exitSignUp</button>
      <button onClick={() => ctx.exitVisitorModeForAuth('signIn')}>exitSignIn</button>
      <button onClick={() => ctx.exitVisitorModeLogOff()}>logOff</button>
    </div>
  );
}

describe('AuthContext visitor mode', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('enterVisitorMode sets flag, persists, wipes Dexie', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('enter').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBe('true');
    expect(wipeAllLocalData).toHaveBeenCalledOnce();
  });

  it('exitVisitorModeForAuth("signUp") sets intent without wiping Dexie', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('exitSignUp').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('fromVisitorIntent').textContent).toBe('signUp');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBeNull();
    expect(wipeAllLocalData).not.toHaveBeenCalled();
  });

  it('exitVisitorModeLogOff wipes Dexie and clears flag', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('logOff').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('fromVisitorIntent').textContent).toBe('null');
    expect(wipeAllLocalData).toHaveBeenCalledOnce();
  });

  it('restores isVisitor=true from localStorage on mount', () => {
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run tests/authContext.test.jsx`
Expected: FAIL — `ctx.enterVisitorMode is not a function`.

- [ ] **Step 3: Update `AuthContext.jsx`**

Replace the entire contents of `src/contexts/AuthContext.jsx`:

```jsx
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

  const exitVisitorModeForAuth = useCallback((intent) => {
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
    } catch {
      // ignore
    }
    setIsVisitor(false);
    setFromVisitorIntent(null);
  }, []);

  const signIn = useCallback(async (email, password) => {
    setSessionExpired(false);
    const newUser = await firebaseBackend.signIn(email, password);
    if (fromVisitorIntent === 'signIn') {
      await wipeAllLocalData();
    }
    setFromVisitorIntent(null);
    setUser(newUser);
  }, [fromVisitorIntent]);

  const signUp = useCallback(async (email, password, name) => {
    const newUser = await firebaseBackend.signUp(email, password, name);
    if (fromVisitorIntent === 'signUp') {
      try {
        await firebaseBackend.pushAllLocal(newUser.id);
        await firebaseBackend.pushAllLocalLogs?.(newUser.id);
        await firebaseBackend.pushAllLocalNotes?.(newUser.id);
        await firebaseBackend.pushAllLocalPractices?.(newUser.id);
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
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run tests/authContext.test.jsx`
Expected: PASS (all four tests).

Also run the full test suite to make sure nothing else broke:

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.jsx tests/authContext.test.jsx
git commit -m "feat(auth): add visitor mode state to AuthContext

Adds isVisitor flag (localStorage-persisted), fromVisitorIntent state,
and three transition actions (enterVisitorMode, exitVisitorModeForAuth,
exitVisitorModeLogOff). signUp post-success migrates local Dexie via
existing pushAllLocal* methods; signIn from-visitor wipes local before
setUser so sync init pulls fresh cloud state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Update App.jsx gate + sync effect for visitors

**Files:**
- Modify: [src/App.jsx](../../../src/App.jsx)

- [ ] **Step 1: Update the auth gate**

In `src/App.jsx`, find line 1572 (`if (!user) { return <AuthScreen />; }`). Replace `useAuth` destructure at line 65 to include `isVisitor`:

```jsx
const { user, authReady, signOut, isVisitor } = useAuth();
```

Replace the gate at ~line 1572:

```jsx
if (!user && !isVisitor) {
  return <AuthScreen />;
}
```

- [ ] **Step 2: Manually verify nothing else changes by inspection**

Read [src/App.jsx:441-509](../../../src/App.jsx#L441-L509) (the sync init effect). Confirm the existing `if (!user || !authReady) return;` guard at line 441 will naturally skip the entire effect for visitors (where `user === null`). No change needed in that effect.

Read [src/App.jsx:396-407](../../../src/App.jsx#L396-L407) (the purge effect). Confirm `purgeExpiredTrash()` runs unconditionally and only the cloud push is gated by `if (user)`. No change needed.

- [ ] **Step 3: Run the build to confirm no syntax errors**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Open `http://localhost:5173`. With `localStorage['drummate_visitor']` set manually to `'true'` via DevTools and refresh, the app should bypass AuthScreen and render. Clear the key and refresh — AuthScreen reappears.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): allow rendering for visitor mode

Gate becomes !user && !isVisitor. Sync init and purge effects
already gate their cloud pushes on user, so no further changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Add "Continue as guest" to AuthScreen

**Files:**
- Modify: [src/components/AuthScreen.jsx](../../../src/components/AuthScreen.jsx)

- [ ] **Step 1: Update imports and destructure**

In `src/components/AuthScreen.jsx`, update the imports at the top to include `useEffect`:

```jsx
import { useState, useEffect } from 'react';
```

Replace the `useAuth` destructure:

```jsx
const { signIn, signUp, sessionExpired, enterVisitorMode, fromVisitorIntent } = useAuth();
```

- [ ] **Step 2: Pre-select sign-in vs sign-up based on `fromVisitorIntent`**

Replace the `isSignUp` state init:

```jsx
const [isSignUp, setIsSignUp] = useState(fromVisitorIntent === 'signUp');
```

Add an effect just below the existing `useState` lines to re-sync if `fromVisitorIntent` changes mid-mount:

```jsx
useEffect(() => {
  if (fromVisitorIntent === 'signUp') setIsSignUp(true);
  if (fromVisitorIntent === 'signIn') setIsSignUp(false);
}, [fromVisitorIntent]);
```

- [ ] **Step 3: Add the confirm-modal state and handler**

Just below `const [submitting, setSubmitting] = useState(false);`:

```jsx
const [showGuestConfirm, setShowGuestConfirm] = useState(false);

const handleConfirmGuest = async () => {
  setShowGuestConfirm(false);
  await enterVisitorMode();
};
```

- [ ] **Step 4: Add the upgrade banner above the form card**

Inside the card (just after the existing `<h2>` for sign-in/sign-up heading and before the `<form>`), render the banner when `fromVisitorIntent` is set:

```jsx
{fromVisitorIntent && (
  <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-indigo-900/30 border border-blue-200 dark:border-indigo-700 rounded-xl text-blue-700 dark:text-indigo-200 text-sm">
    {fromVisitorIntent === 'signUp'
      ? t('auth.upgradeBannerSignUp')
      : t('auth.upgradeBannerSignIn')}
  </div>
)}
```

- [ ] **Step 5: Add the divider and "Continue as guest" button below the toggle text**

After the existing `<p>...</p>` that toggles between sign-in / sign-up (around `auth.hasAccount` / `auth.noAccount`), add:

```jsx
<div className="mt-6 flex items-center gap-3">
  <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
  <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500">
    {t('auth.dividerOr')}
  </span>
  <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
</div>

<button
  type="button"
  onClick={() => setShowGuestConfirm(true)}
  className="mt-4 w-full py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
>
  {t('auth.continueAsGuest')}
</button>
```

- [ ] **Step 6: Add the confirm modal at the very bottom of the returned JSX**

Just before the closing `</div>` of the outer wrapper, add:

```jsx
{showGuestConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl">
      <p className="text-sm text-gray-700 dark:text-slate-200 mb-6">
        {t('auth.guestWipeWarning')}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowGuestConfirm(false)}
          className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600"
        >
          {t('auth.guestCancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirmGuest}
          className="flex-1 py-3 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600"
        >
          {t('auth.guestConfirmButton')}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Build + manual smoke test**

Run: `npm run build`
Expected: PASS.

Run: `npm run dev`. On AuthScreen, click "Continue as guest" → confirm modal appears → confirm → app renders past AuthScreen. Refresh → still in app. Open DevTools → `localStorage['drummate_visitor']` is `'true'`.

- [ ] **Step 8: Commit**

```bash
git add src/components/AuthScreen.jsx
git commit -m "feat(auth): add Continue as guest button + upgrade banner

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Visitor UI in SettingsPanel

**Files:**
- Modify: [src/components/SettingsPanel.jsx](../../../src/components/SettingsPanel.jsx)
- Modify: [src/App.jsx](../../../src/App.jsx)

- [ ] **Step 1: Add new props + import `useAuth` in SettingsPanel**

Open `src/components/SettingsPanel.jsx`. Add to the import block:

```jsx
import { useAuth } from '../contexts/AuthContext';
```

Inside the `SettingsPanel` function body (after `const { t } = useLanguage();`):

```jsx
const { isVisitor, exitVisitorModeForAuth, exitVisitorModeLogOff } = useAuth();
const [showLogOffConfirm, setShowLogOffConfirm] = useState(false);
```

Also add `useState` to the existing `react` import at the top of the file if it's not already imported.

- [ ] **Step 2: Replace the sign-out footer with conditional rendering**

Locate the footer block (lines 462-470, the `{/* Sign Out footer */}` div). Replace it with:

```jsx
<div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 text-center">
  {isVisitor ? (
    <div className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500">
        {t('settings.guestBadge')}
      </div>
      <button
        onClick={() => {
          exitVisitorModeForAuth('signIn');
          onClose();
        }}
        className="w-full py-2 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600 transition-colors"
      >
        {t('settings.guestSignIn')}
      </button>
      <button
        onClick={() => {
          exitVisitorModeForAuth('signUp');
          onClose();
        }}
        className="w-full py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
      >
        {t('settings.guestSignUp')}
      </button>
      <button
        onClick={() => setShowLogOffConfirm(true)}
        className="text-sm font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
      >
        {t('settings.guestLogOff')}
      </button>
    </div>
  ) : (
    <button
      onClick={signOut}
      className="text-sm font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
    >
      {t('auth.signOut')}
    </button>
  )}
</div>
```

- [ ] **Step 3: Add log-off confirm modal**

Just before the closing `</>` fragment of the `SettingsPanel` return (after the panel `</div>`), add:

```jsx
{showLogOffConfirm && (
  <div className="fixed inset-[0] z-[60] flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl">
      <p className="text-sm text-gray-700 dark:text-slate-200 mb-6">
        {t('settings.guestLogOffConfirm')}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowLogOffConfirm(false)}
          className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600"
        >
          {t('settings.guestLogOffCancel')}
        </button>
        <button
          type="button"
          onClick={async () => {
            setShowLogOffConfirm(false);
            await exitVisitorModeLogOff();
            onClose();
          }}
          className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600"
        >
          {t('settings.guestLogOffConfirmButton')}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Hide the avatar / name / email region when visitor**

Locate the panel header (it shows `user?.name` / `user?.email` and the avatar initial). Wrap that region with `{!isVisitor && (...)}`. If you find a "user info" block by searching for `user?.name || user?.email` or the avatar initial, wrap it. If unsure, leave as-is — `user` is null in visitor mode and the existing rendering uses `?.` so it will just show empty strings; the new "Guest" badge in the footer is sufficient.

- [ ] **Step 5: Build + manual smoke test**

Run: `npm run build`
Expected: PASS.

Run: `npm run dev`. In visitor mode, open Settings. Confirm three buttons appear (Sign in / Sign up / Log off). Test each:
- **Sign in** closes Settings, lands on AuthScreen in sign-in mode with the blue banner.
- **Sign up** closes Settings, lands on AuthScreen in sign-up mode with the blue banner.
- **Log off** opens confirm modal → cancel keeps modal → confirm wipes Dexie (verify in DevTools IndexedDB tab → all tables empty) and returns to AuthScreen with no banner.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat(settings): visitor-mode buttons (Sign in / Sign up / Log off)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: End-to-end manual verification

**Files:** None modified. Pure verification.

- [ ] **Step 1: Run the full test suite + build**

Run: `npm run lint && npm run build && npm run test`
Expected: all PASS.

- [ ] **Step 2: Manual end-to-end checklist**

Run: `npm run dev`. With DevTools open (Application → IndexedDB / Local Storage):

- [ ] Sign out of any existing account (or clear all site data).
- [ ] AuthScreen shows "Continue as guest" with divider above it.
- [ ] Click "Continue as guest" → confirm modal → confirm.
- [ ] Practice items, logs, notes can be created. Verify in IndexedDB → DrummateDB → tables.
- [ ] Verify `syncQueue` table stays empty during visitor session.
- [ ] Refresh page → app loads directly without AuthScreen.
- [ ] Open Settings → "Guest" badge visible, three buttons visible.
- [ ] Click **Log off** → confirm modal → confirm. IndexedDB tables empty. Back on AuthScreen, no banner.
- [ ] Click "Continue as guest" again, create one practice item.
- [ ] Open Settings → click **Sign up**. AuthScreen shows blue banner with "saved to your new account" copy. Form is in sign-up mode (Name field visible).
- [ ] Complete sign-up with a fresh email. After auth completes, the practice item from visitor session is present (verify in IndexedDB) AND has been pushed to Firestore (verify in Firebase console or by signing in on another device).
- [ ] Sign out of the new account.
- [ ] Click "Continue as guest" → confirm. Create different practice data.
- [ ] Open Settings → click **Sign in**. AuthScreen shows blue banner with "replace your local data" copy. Form is in sign-in mode.
- [ ] Sign in to the account from the earlier step. Local visitor data is wiped; the original migrated data is pulled from cloud.
- [ ] Language toggle, theme toggle, timezone selector all work in visitor mode.
- [ ] Set "prior hours" in visitor mode → value persists across refresh (localStorage only).
- [ ] Metronome and voice features work in visitor mode.
- [ ] Goal banner / goal setup work in visitor mode.

- [ ] **Step 3: Commit any final tweaks discovered during verification**

If any issues were found and fixed:

```bash
git add -A
git commit -m "fix(visitor): adjustments from end-to-end verification

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: [CLAUDE.md](../../../CLAUDE.md)

- [ ] **Step 1: Add a "Visitor mode" subsection under Architecture**

Append a short section to `CLAUDE.md` between the "Backend abstraction" and "Practice goal" sections:

```markdown
**Visitor mode** ([src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx)): users can skip auth via "Continue as guest" on AuthScreen. `isVisitor` flag in `AuthContext` persists to `localStorage['drummate_visitor']`. App gate is `!user && !isVisitor`. Every `firebaseBackend.push*` call in App.jsx is already guarded by `if (user)`, so cloud writes naturally short-circuit — no Firestore push site needed changes. `fromVisitorIntent` (React state, not persisted) tells `signUp` to migrate local Dexie via `pushAllLocal*` (which filters `syncedOnce: false` — exactly visitor rows), or tells `signIn` to wipe local before the normal cloud pull. Three Settings actions for visitors: Sign in / Sign up (preserve Dexie, set intent) / Log off (wipe Dexie, no intent). `wipeAllLocalData()` in [src/services/database.js](src/services/database.js) atomically clears all five Dexie tables; localStorage UI prefs survive.
```

Add the visitor key to the UI preferences table:

```markdown
| `drummate_visitor` | `'true'` \| absent | absent | visitor (anonymous) mode flag |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document visitor mode architecture

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Plan Self-Review Notes

**Spec coverage:**
- Visitor flag + persistence → Task 4 (AuthContext) + Task 5 (App gate)
- "Continue as guest" + confirmation → Task 6 (AuthScreen)
- Three Settings buttons + log-off confirmation → Task 7 (SettingsPanel)
- Sign-up migration → Task 4 (AuthContext.signUp branch)
- Sign-in collision wipe → Task 4 (AuthContext.signIn branch)
- Upgrade banner with intent-specific copy → Task 6 (AuthScreen banner)
- `wipeAllLocalData` → Task 1
- `setPriorHours` null-safe → Task 2
- Timezone for visitors → no task needed; `initTimezone(null, null)` early-returns and module-level cache from localStorage is sufficient
- `purgeExpiredTrash` for visitors → no task needed; runs unconditionally already
- i18n keys → Task 3
- Tests → Tasks 1, 2, 4
- E2E verification → Task 8
- Docs → Task 9

**No placeholders.** Every code step contains full code.

**Type consistency.** `enterVisitorMode`, `exitVisitorModeForAuth`, `exitVisitorModeLogOff`, `fromVisitorIntent`, `isVisitor` used consistently across AuthContext (Task 4), AuthScreen (Task 6), SettingsPanel (Task 7). `wipeAllLocalData` signature is identical across tasks.
