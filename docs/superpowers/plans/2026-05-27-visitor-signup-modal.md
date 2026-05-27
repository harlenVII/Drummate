# Visitor Sign-Up Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-screen AuthScreen redirect for visitor sign-up with an in-app modal that keeps visitor state intact until Firebase sign-up succeeds.

**Architecture:** Add a `signUpAsVisitor` function to `AuthContext` that handles sign-up + data migration atomically, then remove `exitVisitorModeForAuth` and `fromVisitorIntent` (now dead). A new `VisitorSignUpModal` component owns the form and success state; `SettingsPanel` opens it via local state instead of redirecting.

**Tech Stack:** React 19, Vitest + @testing-library/react, Tailwind v4, Firebase (via `firebaseBackend`)

---

## Files

| Action | Path |
|--------|------|
| Create | `src/components/VisitorSignUpModal.jsx` |
| Modify | `src/contexts/AuthContext.jsx` |
| Modify | `src/components/SettingsPanel.jsx` |
| Modify | `src/components/AuthScreen.jsx` |
| Modify | `src/contexts/LanguageContext.jsx` |
| Modify | `tests/authContext.test.jsx` |

---

### Task 1: Add `signUpAsVisitor` to AuthContext + tests

**Files:**
- Modify: `src/contexts/AuthContext.jsx`
- Modify: `tests/authContext.test.jsx`

- [ ] **Step 1: Write two failing tests**

Add to `tests/authContext.test.jsx` — place after the existing `describe` block. Add the React import at the top.

```js
// add to top imports
import { useState } from 'react';
```

Append these two `describe` blocks at the bottom of the file:

```js
describe('signUpAsVisitor — success', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('transitions visitor→authenticated, migrates data, clears VISITOR_KEY', async () => {
    const firebaseBackend = (await import('../src/services/backends/firebaseBackend')).default;
    firebaseBackend.signUp.mockResolvedValue({ id: 'user-1', email: 'a@b.com', name: 'Alice' });
    globalThis.localStorage.setItem('drummate_visitor', 'true');

    function T() {
      const ctx = useAuth();
      return (
        <div>
          <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
          <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
          <button onClick={() => ctx.signUpAsVisitor('a@b.com', 'pass', 'Alice')}>go</button>
        </div>
      );
    }
    render(<AuthProvider><T /></AuthProvider>);

    await act(async () => { screen.getByText('go').click(); });

    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('user-1');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBeNull();
    expect(firebaseBackend.pushAllLocal).toHaveBeenCalledWith('user-1');
  });
});

describe('signUpAsVisitor — failure', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps visitor state intact when Firebase signUp throws', async () => {
    const firebaseBackend = (await import('../src/services/backends/firebaseBackend')).default;
    firebaseBackend.signUp.mockRejectedValue(new Error('Email already in use'));
    globalThis.localStorage.setItem('drummate_visitor', 'true');

    function T() {
      const ctx = useAuth();
      const [err, setErr] = useState('');
      return (
        <div>
          <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
          <button onClick={() => ctx.signUpAsVisitor('a@b.com', 'pass', 'Alice').catch(e => setErr(e.message))}>go</button>
          <span data-testid="error">{err}</span>
        </div>
      );
    }
    render(<AuthProvider><T /></AuthProvider>);

    await act(async () => { screen.getByText('go').click(); });

    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBe('true');
    expect(screen.getByTestId('error').textContent).toBe('Email already in use');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/authContext.test.jsx
```

Expected: FAIL — `ctx.signUpAsVisitor is not a function`

- [ ] **Step 3: Add `signUpAsVisitor` to AuthContext**

In `src/contexts/AuthContext.jsx`, add after the `exitVisitorModeLogOff` callback (around line 94):

```js
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
```

Add `signUpAsVisitor` to the `AuthContext.Provider` value object:

```js
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
  signUpAsVisitor,
}}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/authContext.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.jsx tests/authContext.test.jsx
git commit -m "feat(visitor): add signUpAsVisitor — migrates data without leaving app"
```

---

### Task 2: Remove dead code from AuthContext + AuthScreen + update tests

**Files:**
- Modify: `src/contexts/AuthContext.jsx`
- Modify: `src/components/AuthScreen.jsx`
- Modify: `tests/authContext.test.jsx`

- [ ] **Step 1: Remove `exitVisitorModeForAuth` and `fromVisitorIntent` from AuthContext**

In `src/contexts/AuthContext.jsx`:

1. Delete the `fromVisitorIntent` state declaration (line 19):
```js
// DELETE this line:
const [fromVisitorIntent, setFromVisitorIntent] = useState(null);
```

2. Delete the entire `exitVisitorModeForAuth` callback (lines 67–75):
```js
// DELETE this block:
const exitVisitorModeForAuth = useCallback(async () => {
  try {
    globalThis.localStorage?.removeItem(VISITOR_KEY);
  } catch {
    // ignore
  }
  setIsVisitor(false);
  setFromVisitorIntent('signUp');
}, []);
```

3. Simplify `exitVisitorModeLogOff` — remove the `setFromVisitorIntent(null)` call:
```js
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
```

4. Simplify `signIn` — remove `setFromVisitorIntent(null)`:
```js
const signIn = useCallback(async (email, password) => {
  setSessionExpired(false);
  const newUser = await firebaseBackend.signIn(email, password);
  setUser(newUser);
}, []);
```

5. Simplify `signUp` — remove `fromVisitorIntent` check and dep:
```js
const signUp = useCallback(async (email, password, name) => {
  const newUser = await firebaseBackend.signUp(email, password, name);
  setUser(newUser);
}, []);
```

6. Update the `AuthContext.Provider` value — remove `fromVisitorIntent` and `exitVisitorModeForAuth`:
```js
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
```

- [ ] **Step 2: Clean up App.jsx**

In `src/App.jsx`:

1. Remove `fromVisitorIntent` from the `useAuth()` destructure (line 70):
```js
const { user, authReady, signOut, isVisitor } = useAuth();
```

2. Remove `fromVisitorIntent` from the visitor log-off effect condition and deps (around line 461):
```js
const prevIsVisitorRef = useRef(isVisitor);
useEffect(() => {
  const wasVisitor = prevIsVisitorRef.current;
  prevIsVisitorRef.current = isVisitor;
  // Visitor logged off: isVisitor went true→false, no user
  if (wasVisitor && !isVisitor && !user) {
    setActiveTab('practice');
    setItems([]);
    setTotals({});
    setMetronomePractices([]);
    setSequencerBpm(120);
    setSequencerSoundType('click');
    setSequencerSlots([]);
    sequencerNextIdRef.current = 1;
    setMultiMeterBpm(120);
    setMultiMeterSoundType('click');
    setMultiMeterSlots([]);
  }
}, [isVisitor, user]);
```

- [ ] **Step 4: Clean up AuthScreen**

In `src/components/AuthScreen.jsx`:

1. Remove `fromVisitorIntent` from the `useAuth` destructure:
```js
const { signIn, signUp, sessionExpired, enterVisitorMode } = useAuth();
```

2. Remove the `isSignUp` initializer that used `fromVisitorIntent`:
```js
// Change from:
const [isSignUp, setIsSignUp] = useState(fromVisitorIntent === 'signUp');
// To:
const [isSignUp, setIsSignUp] = useState(false);
```

3. Remove the `useEffect` that watched `fromVisitorIntent` (lines 16–19):
```js
// DELETE this block:
useEffect(() => {
  if (fromVisitorIntent === 'signUp') setIsSignUp(true);
}, [fromVisitorIntent]);
```

4. Remove the upgrade banner JSX (lines 70–76):
```jsx
// DELETE this block:
{fromVisitorIntent && (
  <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-indigo-900/30 border border-blue-200 dark:border-indigo-700 rounded-xl text-blue-700 dark:text-indigo-200 text-sm">
    {fromVisitorIntent === 'signUp'
      ? t('auth.upgradeBannerSignUp')
      : t('auth.upgradeBannerSignIn')}
  </div>
)}
```

- [ ] **Step 5: Update tests — remove dead test cases and update Probe**

In `tests/authContext.test.jsx`:

1. Update the `Probe` component — remove `fromVisitorIntent` display and dead buttons:
```jsx
function Probe() {
  const ctx = useAuth();
  return (
    <div>
      <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
      <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
      <button onClick={() => ctx.enterVisitorMode()}>enter</button>
      <button onClick={() => ctx.exitVisitorModeLogOff()}>logOff</button>
    </div>
  );
}
```

2. Remove these two dead test cases entirely:
- `'exitVisitorModeForAuth("signUp") sets intent without wiping Dexie'`
- `'exitVisitorModeForAuth("signIn") wipes Dexie immediately (before Firebase auth fires)'`

3. Update the `'exitVisitorModeLogOff wipes Dexie and clears flag'` test — remove the `fromVisitorIntent` assertion:
```js
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
  expect(wipeAllLocalData).toHaveBeenCalledOnce();
});
```

- [ ] **Step 6: Run all tests to confirm they pass**

```bash
npx vitest run tests/authContext.test.jsx
```

Expected: all tests PASS (dead tests removed, remaining tests green)

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.jsx src/components/AuthScreen.jsx src/App.jsx tests/authContext.test.jsx
git commit -m "refactor(visitor): remove exitVisitorModeForAuth and fromVisitorIntent"
```

---

### Task 3: Add i18n keys + remove dead keys

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add new keys and remove dead keys — English section**

In `src/contexts/LanguageContext.jsx`, in the English `settings` object (around line 222), replace the current block:

```js
settings: {
  title: 'Settings',
  guestBadge: 'Guest',
  guestSignUp: 'Create account',
  guestLogOff: 'Log off',
  guestLogOffConfirm:
    'Log off? Your local practice data will be deleted. To keep it, sign up instead.',
  guestLogOffConfirmButton: 'Log off',
  guestLogOffCancel: 'Cancel',
},
```

with:

```js
settings: {
  title: 'Settings',
  guestBadge: 'Guest',
  guestSignUp: 'Create account',
  guestLogOff: 'Log off',
  guestLogOffConfirm:
    'Log off? Your local practice data will be deleted. To keep it, sign up instead.',
  guestLogOffConfirmButton: 'Log off',
  guestLogOffCancel: 'Cancel',
  visitorSignUpNotice:
    'Your local practice data will be saved to your new account when you sign up.',
  visitorSignUpSuccess: 'Welcome, {name}! Your data is now synced across devices.',
},
```

Also remove the two dead `auth` keys (lines 175–178):
```js
// DELETE these two lines:
upgradeBannerSignUp:
  'Your local practice data will be saved to your new account when you sign up.',
upgradeBannerSignIn:
  'Signing into an existing account will replace your local data with your account data.',
```

- [ ] **Step 2: Add new keys and remove dead keys — Chinese section**

In the Chinese `settings` object (around line 636):

```js
settings: {
  title: '设置',
  guestBadge: '访客',
  guestSignUp: '注册',
  guestLogOff: '退出',
  guestLogOffConfirm: '退出后将删除本地练习数据。要保留数据请改为注册账户。',
  guestLogOffConfirmButton: '退出',
  guestLogOffCancel: '取消',
  visitorSignUpNotice: '注册后，您的本地练习数据将保存到新账户。',
  visitorSignUpSuccess: '欢迎，{name}！您的数据已同步到所有设备。',
},
```

Also remove the two dead Chinese `auth` keys (around line 591–592):
```js
// DELETE these two lines:
upgradeBannerSignUp: '注册后，您的本地练习数据将保存到新账户。',
upgradeBannerSignIn: '登录现有账户将用账户数据替换本地数据。',
```

- [ ] **Step 3: Run build to confirm no broken key references**

```bash
npm run build 2>&1 | grep -i error
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "refactor(i18n): add visitorSignUpNotice/Success, remove dead upgrade banner keys"
```

---

### Task 4: Create `VisitorSignUpModal` component

**Files:**
- Create: `src/components/VisitorSignUpModal.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/VisitorSignUpModal.jsx` with this content:

```jsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function VisitorSignUpModal({ onClose }) {
  const { signUpAsVisitor } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successName, setSuccessName] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signUpAsVisitor(email, password, name);
      setSuccessName(name || t('auth.name'));
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err.message || t('auth.syncing'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {successName ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-3">🎉</div>
            <p className="text-gray-800 dark:text-slate-100 font-medium text-sm">
              {t('settings.visitorSignUpSuccess', { name: successName })}
            </p>
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-indigo-900/30 border border-blue-200 dark:border-indigo-700 rounded-xl text-blue-700 dark:text-indigo-200 text-sm">
              {t('settings.visitorSignUpNotice')}
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-4">
              {t('auth.signUp')}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.name')}
                autoComplete="name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email')}
                required
                inputMode="email"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.password')}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
              />
              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                {submitting ? t('auth.syncing') : t('auth.signUp')}
              </button>
            </form>
            <p className="mt-4 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-500 dark:text-slate-400 hover:underline"
              >
                {t('auth.guestCancel')}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run build to confirm no syntax errors**

```bash
npm run build 2>&1 | grep -i error
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/VisitorSignUpModal.jsx
git commit -m "feat(visitor): add VisitorSignUpModal component"
```

---

### Task 5: Update SettingsPanel to use the modal

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add import and update useAuth destructure**

At the top of `src/components/SettingsPanel.jsx`, add the import:

```js
import VisitorSignUpModal from './VisitorSignUpModal';
```

Change the `useAuth` destructure (line 143) to remove `exitVisitorModeForAuth`:

```js
const { isVisitor, exitVisitorModeLogOff } = useAuth();
```

- [ ] **Step 2: Add `showSignUpModal` state**

After the `showLogOffConfirm` state declaration (line 144), add:

```js
const [showSignUpModal, setShowSignUpModal] = useState(false);
```

- [ ] **Step 3: Replace the "Create account" button behaviour**

Find the "Create account" button in the visitor footer section and change its `onClick` from calling `exitVisitorModeForAuth()` + `onClose()` to opening the modal:

```jsx
<button
  onClick={() => setShowSignUpModal(true)}
  className="w-full py-2 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600 transition-colors"
>
  {t('settings.guestSignUp')}
</button>
```

- [ ] **Step 4: Render VisitorSignUpModal**

Find the `showLogOffConfirm` modal block near the end of the JSX return (around line 509). Add the `VisitorSignUpModal` render directly above it:

```jsx
{showSignUpModal && (
  <VisitorSignUpModal
    onClose={() => {
      setShowSignUpModal(false);
      onClose();
    }}
  />
)}
{showLogOffConfirm && (
  /* existing log-off confirm modal — unchanged */
```

- [ ] **Step 5: Run full test suite and build**

```bash
npx vitest run && npm run build 2>&1 | tail -8
```

Expected: all tests pass, build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat(visitor): wire VisitorSignUpModal into SettingsPanel"
```
