# Architectural Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve robustness, readability, and extendability of Drummate across six independently-shippable phases without changing any user-visible behavior.

**Architecture:** (1) Pin current sync behavior with characterization tests; (2) extract i18n strings to locale files; (3) add an error boundary + surface sync errors; (4) introduce an injected backend provider replacing 11 direct singleton imports; (5) collapse the 5×-duplicated reconciliation in `firebaseBackend` into per-collection codecs + a generic reconciler; (6) migrate reads to `Dexie.liveQuery`, deleting `goalRefreshKey`, the resetters bag, and the nav/reports wiring-cycle ref.

**Tech Stack:** React 19, Vite 7, Dexie.js (IndexedDB), Firebase/Firestore, Vitest + fake-indexeddb + @testing-library/react, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-06-01-architectural-refactor-design.md](../specs/2026-06-01-architectural-refactor-design.md)

**Conventions for every phase:**
- Commit messages use conventional-commit prefixes and end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- After each phase: `npm run build` and `npm run lint` must pass before the phase's final commit.
- Run a single test file with `npx vitest run tests/<file>`.

---

## Phase 1 — Sync characterization tests (safety net)

**Phase goal:** Lock down current `firebaseBackend` pull/subscribe/flush behavior so Phases 4–5 are provably behavior-preserving. Adds a minimal seam so tests can inject a fake Firestore.

### Task 1.1: Add a Firestore-access seam to firebaseBackend [model: claude-opus-4-8]

**Why Opus:** requires understanding which Firestore calls the load-bearing logic depends on and introducing a seam without altering behavior.

**Files:**
- Modify: [src/services/backends/firebaseBackend.js:33-58](../../../src/services/backends/firebaseBackend.js) (the `*Ref` helpers + `getDocs`/`onSnapshot` usage)

The five `*Ref` helpers and the `getDocs`/`onSnapshot`/`setDoc`/`updateDoc`/`deleteDoc`/`getDoc` calls currently bind directly to the imported Firestore SDK. Introduce a single indirection object so tests can substitute a fake. **Do not change any call site's semantics** — only route through the indirection.

- [ ] **Step 1: Introduce a `firestore` indirection module**

Create `src/services/backends/firestoreAccess.js`:

```js
// Single indirection point for Firestore SDK access so tests can inject a fake.
// Production code uses the real SDK; tests call setFirestoreImpl() with a fake.
import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';

let impl = {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
  getDb: () => getFirebaseApp().db,
};

export function getFirestore() {
  return impl;
}

// Test-only: replace the Firestore implementation. Pass no arg to reset.
export function setFirestoreImpl(next) {
  impl = next ?? impl;
}
```

- [ ] **Step 2: Route firebaseBackend's Firestore calls through the indirection**

In [src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js), replace the top-level `firebase/firestore` import (lines 8-11) with `import { getFirestore } from './firestoreAccess';` and rewrite the `*Ref` helpers + every direct SDK call to read from `getFirestore()`. Example for `itemsRef`:

```js
function itemsRef(userId) {
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'practice_items');
}
```

Apply the same pattern (`const fs = getFirestore();` then `fs.getDocs(...)`, `fs.setDoc(...)`, `fs.doc(...)`, `fs.onSnapshot(...)`, `fs.serverTimestamp()`, etc.) throughout the file. `legacyDateToLoggedAt`, `getOfflineMode`, `runWithOfflineQueue`, and `db` (Dexie) imports stay as-is.

- [ ] **Step 3: Verify nothing broke**

Run: `npm run build && npm run lint && npx vitest run`
Expected: build passes, lint passes, all existing tests pass (behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/services/backends/firestoreAccess.js src/services/backends/firebaseBackend.js
git commit -m "refactor: route firebaseBackend Firestore access through injectable seam

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 1.2: Build a fake-Firestore test harness [model: claude-sonnet-4-6]

**Files:**
- Create: `tests/helpers/fakeFirestore.js`

- [ ] **Step 1: Write the fake**

Create `tests/helpers/fakeFirestore.js`. It models Firestore as an in-memory map of `path -> Map<docId, data>` and produces snapshots with the `.docs`, `.metadata.fromCache`, `.data()`, and `.docChanges()` shape the backend reads.

```js
// In-memory Firestore double matching the surface firebaseBackend.js uses.
export function createFakeFirestore({ fromCache = false } = {}) {
  // store: Map<collectionPath, Map<docId, data>>
  const store = new Map();
  const listeners = []; // { path, cb }

  const colPath = (segments) => segments.join('/');
  const getCol = (path) => {
    if (!store.has(path)) store.set(path, new Map());
    return store.get(path);
  };

  const makeSnap = (path) => {
    const col = getCol(path);
    const docs = [...col.entries()].map(([id, data]) => ({
      id,
      ref: { _path: path, _id: id },
      data: () => ({ ...data }),
    }));
    return {
      docs,
      metadata: { fromCache },
      docChanges: () => docs.map((d) => ({ type: 'added', doc: d })),
    };
  };

  const impl = {
    getDb: () => ({}),
    collection: (_db, ...segments) => ({ _path: colPath(segments) }),
    doc: (colOrDb, ...rest) => {
      // doc(colRef, id) OR doc(db, ...segments)
      if (colOrDb && colOrDb._path) return { _path: colOrDb._path, _id: rest[0] };
      const segments = rest;
      const id = segments.pop();
      return { _path: colPath(segments), _id: id };
    },
    query: (colRef, ...constraints) => ({ ...colRef, _constraints: constraints }),
    where: (field, op, value) => ({ _where: [field, op, value] }),
    serverTimestamp: () => '__SERVER_TS__',
    getDocs: async (ref) => {
      const path = ref._path;
      const col = getCol(path);
      const wheres = (ref._constraints || []).filter((c) => c._where).map((c) => c._where);
      let entries = [...col.entries()];
      for (const [field, , value] of wheres) {
        entries = entries.filter(([, d]) => d[field] === value);
      }
      const docs = entries.map(([id, data]) => ({
        id, ref: { _path: path, _id: id }, data: () => ({ ...data }),
      }));
      return { docs, metadata: { fromCache }, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
    },
    getDoc: async (ref) => {
      const col = getCol(ref._path);
      const data = col.get(ref._id);
      return { exists: () => data !== undefined, data: () => ({ ...data }) };
    },
    setDoc: async (ref, data, opts) => {
      const col = getCol(ref._path);
      const prev = opts?.merge ? (col.get(ref._id) || {}) : {};
      col.set(ref._id, { ...prev, ...data });
    },
    updateDoc: async (ref, data) => {
      const col = getCol(ref._path);
      col.set(ref._id, { ...(col.get(ref._id) || {}), ...data });
    },
    deleteDoc: async (ref) => { getCol(ref._path).delete(ref._id); },
    onSnapshot: (ref, cb) => {
      listeners.push({ path: ref._path, cb });
      cb(makeSnap(ref._path)); // initial snapshot, all 'added'
      return () => {};
    },
  };

  // Test helpers (not part of the SDK surface):
  impl.__seed = (path, id, data) => getCol(path).set(id, data);
  impl.__get = (path, id) => getCol(path).get(id);
  impl.__all = (path) => [...getCol(path).values()];
  impl.__emit = (path, changes) => {
    // changes: [{ type, id, data }]
    for (const { id, data } of changes) {
      if (data === undefined) getCol(path).delete(id);
      else getCol(path).set(id, data);
    }
    for (const l of listeners.filter((x) => x.path === path)) {
      const docs = changes.map((c) => ({
        type: c.type,
        doc: { id: c.id, ref: { _path: path, _id: c.id }, data: () => ({ ...c.data }) },
      }));
      l.cb({ docs, metadata: { fromCache }, docChanges: () => docs });
    }
  };

  return impl;
}
```

- [ ] **Step 2: Verify the harness imports cleanly**

Run: `node --input-type=module -e "import('./tests/helpers/fakeFirestore.js').then(m=>console.log(typeof m.createFakeFirestore))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/fakeFirestore.js
git commit -m "test: add in-memory fake Firestore harness

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 1.3: Characterize pullAll (items + logs) [model: claude-opus-4-8]

**Why Opus:** the cases (legacy migration, merge remap, fromCache bail, deletion reconciliation ordering) require reasoning about the load-bearing comments.

**Files:**
- Create: `tests/firebaseBackend.sync.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { setFirestoreImpl } from '../src/services/backends/firestoreAccess';
import { createFakeFirestore } from './helpers/fakeFirestore';
import { db } from '../src/services/database';
import firebaseBackend from '../src/services/backends/firebaseBackend';

const UID = 'user1';
const itemsPath = `users/${UID}/practice_items`;
const logsPath = `users/${UID}/practice_logs`;

let fs;
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  fs = createFakeFirestore();
  setFirestoreImpl(fs);
});
afterEach(() => setFirestoreImpl(createFakeFirestore())); // reset

describe('pullAll', () => {
  it('adds a new remote item locally', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('uid').equals('a').first();
    expect(local.name).toBe('Rudiments');
    expect(local.syncedOnce).toBe(true);
  });

  it('bails without deleting when snapshot is fromCache', async () => {
    await db.practiceItems.add({ uid: 'a', name: 'Local', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs = createFakeFirestore({ fromCache: true });
    setFirestoreImpl(fs);
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('a').first()).toBeTruthy();
  });

  it('deletes a locally-synced item missing from cloud (and cascades logs)', async () => {
    const id = await db.practiceItems.add({ uid: 'gone', name: 'Old', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId: id, itemUid: 'gone', date: '2026-01-01', duration: 60, uid: 'l1', loggedAt: 1, syncedOnce: true });
    await firebaseBackend.pullAll(UID); // no remote items
    expect(await db.practiceItems.where('uid').equals('gone').first()).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
  });

  it('preserves a local-only (unsynced) item when cloud is empty', async () => {
    await db.practiceItems.add({ uid: 'new', name: 'Draft', category: 'fundamentals', sortOrder: 0, syncedOnce: false });
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('new').first()).toBeTruthy();
  });

  it('adds a remote log resolving its parent by item_uid', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'Rudiments', date: '2026-05-01', duration: 120, logged_at: 1700000000000 });
    await firebaseBackend.pullAll(UID);
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(120);
    expect(log.loggedAt).toBe(1700000000000);
  });

  it('migrates a legacy remote item with no uid', async () => {
    fs.__seed(itemsPath, 'Legacy%20Name', { name: 'Legacy Name', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('name').equals('Legacy Name').first();
    expect(local).toBeTruthy();
    expect(local.uid).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they PASS against current code**

Run: `npx vitest run tests/firebaseBackend.sync.test.js`
Expected: PASS. (These are characterization tests of *existing* behavior — they pass now and must keep passing after Phase 5. If any fails, the fake harness or seam is wrong — fix the harness, not the backend.)

- [ ] **Step 3: Commit**

```bash
git add tests/firebaseBackend.sync.test.js
git commit -m "test: characterize pullAll items+logs reconciliation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 1.4: Characterize pullAllNotes/Practices/Goals + subscribeToChanges + flushSyncQueue [model: claude-opus-4-8]

**Files:**
- Modify: `tests/firebaseBackend.sync.test.js`

- [ ] **Step 1: Add the remaining characterization tests**

Append `describe` blocks covering:
- `pullAllNotes`: add new; update changed body; `fromCache` bail; delete-reconcile a synced-but-missing note.
- `pullAllPractices`: add new with nested `timeSignature`; update one scalar field; delete-reconcile.
- `pullAllGoals`: add new; update `archived`; delete-reconcile.
- `subscribeToChanges`: seed an item, call `subscribeToChanges(onChange)`, assert the initial `'added'` snapshot reconciles into Dexie; then `fs.__emit(itemsPath, [{ type:'modified', id:'a', data:{ uid:'a', name:'Renamed', sort_order:0 } }])` and assert the local name updates and `onChange` fired. Add a logs `modified` case that remaps `item_uid` to a different local parent.
- `flushSyncQueue`: seed a `db.syncQueue` entry `{ action:'push_goal', payload:{ uid, startDate, endDate, targetHours, ... } }`, run `flushSyncQueue(UID)`, assert the cloud doc exists AND local Dexie row matches the payload AND the queue entry is deleted. Add one legacy/minimal `push_note` payload (missing `body`) and assert it falls back to re-reading local (seed the local note first).

Use the same `beforeEach`/fake patterns as Task 1.3. Each assertion targets observable Dexie state or `fs.__get(path, id)`.

- [ ] **Step 2: Run to verify they PASS against current code**

Run: `npx vitest run tests/firebaseBackend.sync.test.js`
Expected: PASS (characterizing existing behavior).

- [ ] **Step 3: Commit**

```bash
git add tests/firebaseBackend.sync.test.js
git commit -m "test: characterize notes/practices/goals pull, subscribe, and flush

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 2 — Locale extraction

**Phase goal:** Move ~870 lines of translation tables out of `LanguageContext.jsx` into JSON locale files; adding a language becomes "add a file + one map entry."

### Task 2.1: Extract en/zh tables to JSON [model: claude-haiku-4-5-20251001]

**Why Haiku:** purely mechanical copy of object literals into JSON files.

**Files:**
- Read: [src/contexts/LanguageContext.jsx:5-876](../../../src/contexts/LanguageContext.jsx)
- Create: `src/locales/en.json`, `src/locales/zh.json`

- [ ] **Step 1: Copy the `en` object literal (lines 5-440) into `src/locales/en.json`**

The `en` table is a nested object of string values. Convert the JS object literal to strict JSON: double-quote every key, remove trailing commas, keep `{param}` placeholders verbatim. The top-level JSON object IS the contents of `en` (do not wrap in `{ en: ... }`).

- [ ] **Step 2: Copy the `zh` object literal (lines 441-876) into `src/locales/zh.json`** using the same conversion.

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/zh.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 4: Verify key parity between locales**

Run: `node -e "const f=p=>Object.keys(require('./'+p)).sort();const a=require('./src/locales/en.json'),b=require('./src/locales/zh.json');const flat=(o,pre='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,pre+k+'.'):[pre+k]);const ea=flat(a).sort(),eb=flat(b).sort();console.log('en keys',ea.length,'zh keys',eb.length,'equal',JSON.stringify(ea)===JSON.stringify(eb))"`
Expected: `en` and `zh` key counts equal, `equal true`. If not, a key was dropped in conversion — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/zh.json
git commit -m "refactor: extract i18n tables to locale JSON files

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.2: Slim LanguageContext to load from locale map [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx)

- [ ] **Step 1: Replace the inline tables with imports + a map**

New file contents (the `t()` interpolation and the localStorage read/persist logic are preserved exactly — only the data source changes):

```jsx
import { createContext, useContext, useState, useCallback } from 'react';
import en from '../locales/en.json';
import zh from '../locales/zh.json';
import { getItem, setItem } from '../utils/safeStorage';

const locales = { en, zh };
const translations = locales; // back-compat alias if referenced elsewhere

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => getItem('drummate_language') || 'en');

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'zh' : 'en';
      setItem('drummate_language', next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key, params = {}) => {
      const table = locales[language] || locales.en;
      let value = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), table);
      if (value == null) return key;
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
```

> **Note:** Verify against the current file (lines 877-916) that the localStorage key is `drummate_language`, the persistence method matches (the current code may set directly via `localStorage`/`safeStorage` — match whichever it uses), and there is no `setLanguage` consumer outside this file. If the current `toggleLanguage`/`t` differ, preserve the current logic and only swap the data source to `locales`.

- [ ] **Step 2: Build + lint + smoke**

Run: `npm run build && npm run lint && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Manual check**

Start `npm run dev`, toggle language EN↔ZH (key `E`/`C`), confirm every tab still renders translated text. Spot-check an interpolated string (e.g. a report total with `{count}`).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "refactor: load translations from locale map, slim LanguageContext

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 3 — Error boundary + sync-error surfacing

**Phase goal:** A render throw no longer blanks the PWA; a failed initial sync is visible instead of silently showing stale data.

### Task 3.1: Add ErrorBoundary component + test [model: claude-sonnet-4-6]

**Files:**
- Create: `src/components/ErrorBoundary.jsx`, `tests/errorBoundary.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../src/components/ErrorBoundary';

function Boom() { throw new Error('kaboom'); }

describe('ErrorBoundary', () => {
  it('renders fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders children when no error', () => {
    render(<ErrorBoundary><div>safe</div></ErrorBoundary>);
    expect(screen.getByText('safe')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/errorBoundary.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement ErrorBoundary**

```jsx
import { Component } from 'react';

// Class component because React error boundaries require lifecycle methods.
// Text is intentionally English-only fallback strings: a render crash may
// have broken the LanguageProvider tree, so we cannot rely on t() here.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-gray-100 dark:bg-slate-900 p-6 text-center">
          <p className="text-gray-700 dark:text-slate-200 font-medium">
            Something went wrong.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-indigo-600 rounded-lg hover:bg-blue-700 dark:hover:bg-indigo-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/errorBoundary.test.jsx`
Expected: PASS.

- [ ] **Step 5: Wrap the app**

In [src/main.jsx](../../../src/main.jsx), import `ErrorBoundary` and wrap `<App />` (innermost, inside the providers so a provider crash still shows the fallback — place it directly around `<App />`):

```jsx
import ErrorBoundary from './components/ErrorBoundary'
// ...
<LanguageProvider>
  <AuthProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </AuthProvider>
</LanguageProvider>
```

- [ ] **Step 6: Build + commit**

Run: `npm run build`

```bash
git add src/components/ErrorBoundary.jsx tests/errorBoundary.test.jsx src/main.jsx
git commit -m "feat: add ErrorBoundary around App with recoverable fallback

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3.2: Surface sync init errors [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/hooks/useSync.js](../../../src/hooks/useSync.js)
- Modify: [src/App.jsx](../../../src/App.jsx)
- Read for styling: [src/components/OfflineBanner.jsx](../../../src/components/OfflineBanner.jsx)

- [ ] **Step 1: Add `syncError` state to useSync**

In [src/hooks/useSync.js](../../../src/hooks/useSync.js): add `const [syncError, setSyncError] = useState(null);` near the other state. Clear it at the start of `init` (`setSyncError(null);` right after `setIsSyncing(true)`), and set it in the existing catch block (currently [line 159-160](../../../src/hooks/useSync.js)):

```js
      } catch (err) {
        console.error('Sync init failed:', err);
        if (!cancelled) setSyncError(err?.message || 'sync_failed');
      } finally {
```

Add `syncError, setSyncError` to the hook's return object (lines 219-224).

- [ ] **Step 2: Render a dismissible banner in App**

In [src/App.jsx](../../../src/App.jsx): destructure `syncError, setSyncError` from `sync` (line 144-147). Add, just below the `offlineMode && <OfflineBanner .../>` block (after line 178):

```jsx
      {syncError && (
        <div
          className="flex items-center justify-between gap-3 bg-red-600 text-white text-sm px-4 py-2"
          role="alert"
        >
          <span>{t('sync.error')}</span>
          <button
            onClick={() => setSyncError(null)}
            className="font-medium underline underline-offset-2"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}
```

- [ ] **Step 3: Add the two i18n keys**

Add to `src/locales/en.json`: `"sync": { "error": "Sync failed — showing local data." }` and `"common": { ..., "dismiss": "Dismiss" }`. Add the matching `zh` translations (e.g. `"同步失败 — 显示本地数据。"` / `"关闭"`). Re-run the key-parity check from Task 2.1 Step 4.

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSync.js src/App.jsx src/locales/en.json src/locales/zh.json
git commit -m "feat: surface sync init failures with a dismissible banner

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 4 — Backend interface injection

**Phase goal:** Replace 11 direct `firebaseBackend` singleton imports with an injected provider + `useBackend()` hook. Behavior unchanged; call sites only. Guarded by Phase 1 tests + build.

### Task 4.1: Document the backend contract [model: claude-haiku-4-5-20251001]

**Files:**
- Create: `src/services/backends/backendInterface.js`

- [ ] **Step 1: Write the JSDoc typedef**

Enumerate every method on the `firebaseBackend` object (auth: `name`, `signIn`, `signUp`, `signOut`, `getUser`, `onAuthChange`, `refreshAuth`, `isAbortError`, `isNetworkError`; push: `pushItem`, `pushLog`, `pushNote`, `deleteNoteRemote`, `pushPractice`, `pushGoal`, `deleteGoalRemote`, `pushDeletePractice`, `pushPracticeReorder`, `pushDeleteItem`, `pushRenameItem`, `pushReorder`, `pushArchiveItem`, `pushTrashItem`, `pushSetCategory`, `mergeItems`; settings: `getUserSettings`, `setUserSetting`; pull/sync: `pullAll`, `pullAllNotes`, `pullAllPractices`, `pullAllGoals`, `pushAllLocal`, `pushAllLocalNotes`, `pushAllLocalPractices`, `pushAllLocalGoals`, `flushSyncQueue`, `subscribeToChanges`).

```js
/**
 * @typedef {Object} Backend
 * @property {string} name
 * @property {(email:string,password:string)=>Promise<object>} signIn
 * @property {(email:string,password:string,name?:string)=>Promise<object>} signUp
 * @property {()=>void} signOut
 * @property {()=>object|null} getUser
 * @property {(cb:(user:object|null)=>void)=>()=>void} onAuthChange
 * @property {()=>Promise<object>} refreshAuth
 * @property {(err:unknown)=>boolean} isAbortError
 * @property {(err:unknown)=>boolean} isNetworkError
 * @property {(item:object,userId:string)=>Promise<void>} pushItem
 * ... (one line per method above)
 * @property {(onDataChanged:()=>void)=>()=>void} subscribeToChanges
 */
export {}; // types only
```

Fill in every method with its real signature (read them off [firebaseBackend.js](../../../src/services/backends/firebaseBackend.js)). No runtime code.

- [ ] **Step 2: Commit**

```bash
git add src/services/backends/backendInterface.js
git commit -m "docs: declare Backend interface typedef

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4.2: Create BackendProvider + useBackend [model: claude-sonnet-4-6]

**Files:**
- Create: `src/contexts/BackendContext.jsx`
- Modify: [src/main.jsx](../../../src/main.jsx)

- [ ] **Step 1: Write the provider**

```jsx
import { createContext, useContext } from 'react';
import firebaseBackend from '../services/backends/firebaseBackend';

const BackendContext = createContext(firebaseBackend);

/** @param {{ backend?: import('../services/backends/backendInterface').Backend, children: React.ReactNode }} props */
export function BackendProvider({ backend = firebaseBackend, children }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function useBackend() {
  return useContext(BackendContext);
}
```

- [ ] **Step 2: Wrap AuthProvider in main.jsx**

```jsx
import { BackendProvider } from './contexts/BackendContext'
// ...
<LanguageProvider>
  <BackendProvider>
    <AuthProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AuthProvider>
  </BackendProvider>
</LanguageProvider>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: pass (nothing consumes it yet).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/BackendContext.jsx src/main.jsx
git commit -m "feat: add BackendProvider and useBackend hook

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4.3: Migrate AuthContext to consume the backend via context [model: claude-opus-4-8]

**Why Opus:** AuthContext sits above App and currently imports the singleton at module scope (used in `useState` initializers); moving it to `useBackend()` requires care that initializer-time access still works.

**Files:**
- Modify: [src/contexts/AuthContext.jsx](../../../src/contexts/AuthContext.jsx)

- [ ] **Step 1: Consume `useBackend()` inside the provider**

`AuthContext` uses `firebaseBackend.getUser()` in a `useState` initializer (line 17, 24) and in effects. Inside `AuthProvider`, call `const backend = useBackend();` at the top, then replace every `firebaseBackend.*` with `backend.*`. Because `BackendProvider` wraps `AuthProvider` (Task 4.2), the context value is available during render including the lazy `useState(() => backend.getUser())` initializer. Remove the top-level `import firebaseBackend` line.

- [ ] **Step 2: Build + run auth tests**

Run: `npm run build && npx vitest run tests/authContext.test.jsx tests/visitorMode.test.js`
Expected: pass. If the auth test mounts `AuthProvider` without `BackendProvider`, wrap it (the `createContext(firebaseBackend)` default means it still works unwrapped, but prefer wrapping for clarity).

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.jsx tests/authContext.test.jsx
git commit -m "refactor: AuthContext consumes injected backend

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4.4: Migrate hooks to receive/consume the backend [model: claude-sonnet-4-6]

**Files (each currently `import firebaseBackend`):**
- Modify: [src/hooks/useSync.js](../../../src/hooks/useSync.js), [src/hooks/useAppData.js](../../../src/hooks/useAppData.js), [src/hooks/usePracticeItems.js](../../../src/hooks/usePracticeItems.js), [src/hooks/useReports.js](../../../src/hooks/useReports.js), [src/hooks/useMetronomePractices.js](../../../src/hooks/useMetronomePractices.js), [src/hooks/usePracticeTimer.js](../../../src/hooks/usePracticeTimer.js)

- [ ] **Step 1: Replace singleton imports with `useBackend()`**

In each hook, remove `import firebaseBackend from '../services/backends/firebaseBackend';`, add `import { useBackend } from '../contexts/BackendContext';`, and call `const backend = useBackend();` at the top of the hook body. Replace every `firebaseBackend.` with `backend.`. For callbacks wrapped in `useCallback`, add `backend` to the dependency array (it's a stable context value, so this is safe).

- [ ] **Step 2: Build + lint + full test suite**

Run: `npm run build && npm run lint && npx vitest run`
Expected: pass. Pay attention to `tests/useReports.test.js` — if it imports/uses the singleton, update it to pass a fake backend or wrap with `BackendProvider`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/
git commit -m "refactor: hooks consume injected backend via useBackend

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4.5: Migrate components + drop App's direct import [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/components/NotesPage.jsx](../../../src/components/NotesPage.jsx), [src/components/ReportTab.jsx](../../../src/components/ReportTab.jsx), [src/components/GoalsPage.jsx](../../../src/components/GoalsPage.jsx), [src/components/SettingsPanel.jsx](../../../src/components/SettingsPanel.jsx)
- Modify: [src/App.jsx](../../../src/App.jsx) (lines 11, 248, 256 pass `firebaseBackend` as a prop)

- [ ] **Step 1: Components consume `useBackend()` instead of importing the singleton**

In each component, remove the singleton import and the `firebaseBackend` prop where it's passed only to satisfy the old pattern; call `const backend = useBackend();` and use it. For [App.jsx](../../../src/App.jsx): remove `import firebaseBackend` (line 11) and stop passing `firebaseBackend={firebaseBackend}` to `ReportTab` (line 248) and `NotesPage` (line 256) — those components now pull it from context. `GoalsPage`/`GoalCard` currently receive `user` + `firebaseBackend` as props (per CLAUDE.md); switch `GoalsPage` to `useBackend()` and keep `user` as a prop.

> **Note:** Confirm with `grep -rn "firebaseBackend" src` that the only remaining direct import is in `BackendContext.jsx` (the default value) and `firestoreAccess.js` is unaffected. Every other site should use `useBackend()`.

- [ ] **Step 2: Build + lint + full suite + manual**

Run: `npm run build && npm run lint && npx vitest run`
Expected: pass. Manual: sign in, verify Practice/Report/Notes/Goals all load and a write (add item, add note, edit goal) still syncs.

- [ ] **Step 3: Verify the migration is complete**

Run: `grep -rn "from '.*backends/firebaseBackend'" src`
Expected: only `src/contexts/BackendContext.jsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ src/App.jsx
git commit -m "refactor: components consume injected backend; drop direct singleton imports

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 5 — Codec + reconciler refactor

**Phase goal:** Collapse the 5×-duplicated field-mapping + diff logic into per-collection codecs and a generic reconciler, so `pullAll*` and `subscribeToChanges` share one code path. Phase 1 tests stay green throughout.

### Task 5.1: Define the codec shape + item/log/note/practice/goal codecs [model: claude-opus-4-8]

**Why Opus:** the codecs must exactly reproduce the existing `??` defaults, `|| ''` vs `|| null` distinctions, and nested `timeSignature` handling, or characterization tests break.

**Files:**
- Create: `src/services/backends/codecs/itemCodec.js`, `logCodec.js`, `noteCodec.js`, `practiceCodec.js`, `goalCodec.js`, and `codecs/index.js`

Each codec exports `{ table, toRemote, toLocal, diff }`. `table` is the Dexie table name string (e.g. `'notes'`). `toLocal(data)` maps a remote doc → Dexie row (mirrors the existing `fields`/`buildFields()` objects). `diff(remoteData, local)` returns `{ action, fields }` reproducing that collection's existing conditional-update logic (the practice/goal codecs may keep an internal key-list inside `diff`, mirroring the current `for (const k of [...])` loops — it is private to the codec, not part of the exported shape).

- [ ] **Step 1: Write `noteCodec.js`** (simplest — mirrors [pullAllNotes lines 809-837](../../../src/services/backends/firebaseBackend.js))

```js
// Notes codec. Mirrors the field mapping in pullAllNotes / subscribe notes handler.
export const noteCodec = {
  table: 'notes',
  toRemote(local) {
    return {
      uid: local.uid,
      item_uid: local.itemUid,
      date: local.date,
      body: local.body ?? '',
      trashed: !!local.trashed,
      trashed_at: local.trashedAt || '',
      created_at: local.createdAt || '',
    };
  },
  toLocal(data) {
    return {
      uid: data.uid,
      itemUid: data.item_uid,
      date: data.date,
      body: data.body ?? '',
      trashed: !!data.trashed,
      trashedAt: data.trashed_at || null,
      createdAt: data.created_at || '',
      syncedOnce: true,
    };
  },
  // Returns { action: 'add'|'update'|'skip', fields }. Mirrors the exact
  // conditional set in pullAllNotes so characterization tests stay green.
  diff(data, local) {
    if (!local) return { action: 'add', fields: this.toLocal(data) };
    const updates = {};
    if (data.item_uid && local.itemUid !== data.item_uid) updates.itemUid = data.item_uid;
    if (data.date != null && local.date !== data.date) updates.date = data.date;
    if (data.body != null && local.body !== data.body) updates.body = data.body;
    if (data.trashed != null && local.trashed !== !!data.trashed) {
      updates.trashed = !!data.trashed;
      updates.trashedAt = data.trashed_at || null;
    }
    if (data.created_at && !local.createdAt) updates.createdAt = data.created_at;
    if (!local.syncedOnce) updates.syncedOnce = true;
    return { action: Object.keys(updates).length ? 'update' : 'skip', fields: updates };
  },
};
```

- [ ] **Step 2: Write `practiceCodec.js` and `goalCodec.js`** mirroring [pullAllPractices 863-900](../../../src/services/backends/firebaseBackend.js) and [pullAllGoals 926-953](../../../src/services/backends/firebaseBackend.js). Use the existing `for (const k of [...])` key lists for `diff`, plus the nested `timeSignature` comparison for practices. `toRemote` mirrors `pushPractice`/`pushGoal` snake_case bodies (excluding `serverTimestamp()`/`created` which the reconciler doesn't write).

- [ ] **Step 3: Write `itemCodec.js`** mirroring [pullAll items 671-698](../../../src/services/backends/firebaseBackend.js) and the subscribe items handler. `diff` reproduces the name/sort_order/archived/trashed/category conditionals exactly.

- [ ] **Step 4: Write `logCodec.js`** — logs are special (parent resolution + `resolveLoggedAt`). The codec exposes `toLocal(data, localItem)` taking the resolved parent, and `diff(data, existing, localItem)` reproducing [pullAll logs 742-768](../../../src/services/backends/firebaseBackend.js). Keep `resolveLoggedAt` importable (export it from firebaseBackend or move it to a shared util `src/services/backends/resolveLoggedAt.js` and re-import in firebaseBackend).

- [ ] **Step 5: Write `codecs/index.js`** re-exporting all five.

- [ ] **Step 6: Add codec unit tests** `tests/codecs.test.js`: for each codec, assert `toLocal(toRemoteRoundtrip)` field mapping and a couple `diff` cases (add / no-op / single-field update). Run `npx vitest run tests/codecs.test.js` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/backends/codecs/ src/services/backends/resolveLoggedAt.js tests/codecs.test.js
git commit -m "feat: add per-collection sync codecs (field map + diff)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5.2: Write the generic reconciler [model: claude-opus-4-8]

**Files:**
- Create: `src/services/backends/reconcile.js`
- Modify: `tests/codecs.test.js` (or new `tests/reconcile.test.js`)

- [ ] **Step 1: Implement `reconcileCollection`**

```js
import { db } from '../database';

// Drives BOTH pullAll* and the subscribeToChanges listener for the simple
// collections (notes/practices/goals; items/logs use specialized wrappers).
// `onChange` is the optional liveQuery/loadData poke fired after a write.
export async function applyRemoteDoc(codec, data, { onChange } = {}) {
  if (!data.uid) return;
  const local = await db[codec.table].where('uid').equals(data.uid).first();
  const { action, fields } = codec.diff(data, local);
  if (action === 'add') {
    await db[codec.table].add(fields);
    onChange?.();
  } else if (action === 'update') {
    await db[codec.table].update(local.id, fields);
    onChange?.();
  }
}

// Full-snapshot pull: apply every doc, then delete locally-synced rows that
// vanished remotely (cross-device delete reconciliation).
export async function reconcileSnapshot(codec, snap) {
  if (snap.metadata.fromCache) return; // offline-cache guard — never delete
  const remoteUids = new Set();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data.uid) continue;
    remoteUids.add(data.uid);
    await applyRemoteDoc(codec, data);
  }
  const allLocal = await db[codec.table].toArray();
  for (const local of allLocal) {
    if (local.syncedOnce && !remoteUids.has(local.uid)) {
      await db[codec.table].delete(local.id);
    }
  }
}

// Live-listener change handler for a single docChange.
export async function applyChange(codec, change, { onChange } = {}) {
  const data = change.doc.data();
  if (!data.uid) return;
  if (change.type === 'added' || change.type === 'modified') {
    await applyRemoteDoc(codec, data, { onChange });
  } else if (change.type === 'removed') {
    const existing = await db[codec.table].where('uid').equals(data.uid).first();
    if (existing) { await db[codec.table].delete(existing.id); onChange?.(); }
  }
}
```

- [ ] **Step 2: Add reconciler tests** covering add/update/skip/fromCache-bail/delete-reconcile against `db.goals` (use `fake-indexeddb/auto`). Run `npx vitest run tests/reconcile.test.js` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/backends/reconcile.js tests/reconcile.test.js
git commit -m "feat: generic reconciler shared by pull and live-listener paths

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5.3: Rewrite pullAllNotes/Practices/Goals + their listeners via the reconciler [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js)

- [ ] **Step 1: Replace the three simple pull functions**

```js
async pullAllNotes(userId) {
  return reconcileSnapshot(noteCodec, await getFirestore().getDocs(notesRef(userId)));
},
async pullAllPractices(userId) {
  return reconcileSnapshot(practiceCodec, await getFirestore().getDocs(practicesRef(userId)));
},
async pullAllGoals(userId) {
  return reconcileSnapshot(goalCodec, await getFirestore().getDocs(goalsRef(userId)));
},
```

- [ ] **Step 2: Replace the three simple listeners in `subscribeToChanges`**

For notes/practices/goals, replace each `onSnapshot(...)` body with:

```js
const unsubNotes = getFirestore().onSnapshot(notesRef(userId), async (snap) => {
  for (const change of snap.docChanges()) {
    await applyChange(noteCodec, change, { onChange: onDataChanged });
  }
});
```

(and the equivalent for practices/goals).

- [ ] **Step 3: Run characterization + codec + reconciler tests**

Run: `npx vitest run tests/firebaseBackend.sync.test.js tests/codecs.test.js tests/reconcile.test.js`
Expected: PASS — the notes/practices/goals characterization cases now exercise the reconciler path.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/services/backends/firebaseBackend.js
git commit -m "refactor: notes/practices/goals pull+listen via shared reconciler

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5.4: Route items + logs through codecs (keep specialized orchestration) [model: claude-opus-4-8]

**Why Opus:** items (legacy migration, name-fallback adoption) and logs (parent resolution, remap-before-delete ordering) have cross-cutting steps that must stay explicit; only the per-field map/diff moves into the codec.

**Files:**
- Modify: [src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js)

- [ ] **Step 1: Use `itemCodec.diff`/`toLocal` inside the existing pullAll items loop**

Keep the legacy-migration block (627-656) and the name-fallback adoption (658-669) verbatim. Replace the add/update branch (671-698) with `itemCodec.diff(data, local)` + add/update. Keep the deletion-reconciliation loop (787-793) verbatim. Replace the items listener's add/update branch with `applyChange(itemCodec, change, ...)` — BUT preserve the `removed` cascade that also deletes child logs (the generic `applyChange` only deletes the row). Do this by keeping a specialized items listener that calls `itemCodec.diff` for added/modified and keeps the existing cascade for `removed`.

- [ ] **Step 2: Use `logCodec` inside the logs loop + listener**

Keep the parent-resolution (`itemsByUid`/`itemsByName`), the `resolveLoggedAt` calls, and the remap-before-delete ordering verbatim. Replace only the field-construction (`logsToAdd.push({...})` at 759-767) with `logCodec.toLocal(data, localItem)` and the update-fields construction (744-755) with `logCodec.diff(data, existing, localItem)`. The logs listener's `added`/`modified`/`removed` branches keep their structure; swap the inline field objects for codec calls.

- [ ] **Step 3: Run the full characterization suite**

Run: `npx vitest run tests/firebaseBackend.sync.test.js`
Expected: PASS — every item/log case (legacy migration, merge remap, fromCache bail, deletion cascade) still green.

- [ ] **Step 4: Build + lint + commit**

```bash
npm run build && npm run lint
git add src/services/backends/firebaseBackend.js
git commit -m "refactor: items+logs use codecs for field map/diff, keep orchestration

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5.5: Reuse codecs in flushSyncQueue replay helpers [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/services/backends/firebaseBackend.js:78-173](../../../src/services/backends/firebaseBackend.js) (`replayNotePayload`/`replayPracticePayload`/`replayGoalPayload`)

- [ ] **Step 1: Build the local-write half of each replay from the codec**

The replay helpers write cloud (snake_case `setDoc`) AND local Dexie. The local write currently hand-maps fields; route it through the codec's `toLocal` shape where the payload provides the values. Keep the cloud `setDoc` body and the legacy-payload guard (the `if (!(...)) return false;` lines) exactly as-is — only the `db.<table>.update(...)` field object changes to reuse the codec's camelCase keys. **Do not change the guard conditions** (they gate legacy fallback).

- [ ] **Step 2: Run flush characterization tests**

Run: `npx vitest run tests/firebaseBackend.sync.test.js`
Expected: PASS (the `flushSyncQueue` enriched + legacy-fallback cases stay green).

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/services/backends/firebaseBackend.js
git commit -m "refactor: flushSyncQueue replay reuses codec local-write mapping

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 6 — liveQuery migration + delete the seams

**Phase goal:** Reads become reactive `Dexie.liveQuery` subscriptions. Delete `goalRefreshKey`, the 16-setter resetters bag, and the nav/reports wiring-cycle ref. `loadData` shrinks to sync orchestration.

### Task 6.1: Add a useLiveQuery helper + live data hooks [model: claude-sonnet-4-6]

**Files:**
- Create: `src/hooks/useLiveQuery.js`, `src/hooks/useLiveData.js`
- Read for pattern: [src/components/GoalsPage.jsx](../../../src/components/GoalsPage.jsx) (existing liveQuery usage)

- [ ] **Step 1: Write a `useLiveQuery` hook wrapping `Dexie.liveQuery`**

```js
import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';

// Subscribe a React component to a Dexie liveQuery. `querier` is an async fn
// returning the value; `deps` re-subscribes when they change.
export function useLiveQuery(querier, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: setValue,
      error: (err) => console.error('liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
```

- [ ] **Step 2: Write `useLiveData` providing items/totals/notes/practices reactively**

Mirror the current [useAppData.loadData](../../../src/hooks/useAppData.js) computation (items via `getItems`, today's logs → totals excluding trashed, practices via `getPractices`, notes via `getAllNotes`) but each as a `useLiveQuery`. Compute `totals` from a live query over today's logs + items.

```js
import { useLiveQuery } from './useLiveQuery';
import { db } from '../services/database';
import { getItems, getPractices, getAllNotes, getTodaysLogs } from '../services/database';

export function useLiveData() {
  const items = useLiveQuery(() => getItems(), [], []);
  const practices = useLiveQuery(() => getPractices(), [], []);
  const notes = useLiveQuery(() => getAllNotes(), [], []);
  const totals = useLiveQuery(async () => {
    const [allItems, logs] = await Promise.all([getItems(), getTodaysLogs()]);
    const trashed = new Set(allItems.filter((i) => i.trashed).map((i) => i.id));
    const map = {};
    for (const l of logs) if (!trashed.has(l.itemId)) map[l.itemId] = (map[l.itemId] || 0) + l.duration;
    return map;
  }, [], {});
  return { items: items ?? [], practices: practices ?? [], notes: notes ?? [], totals: totals ?? {} };
}
```

> **Note:** `getTodaysLogs` is TZ-relative; for the day-rollover case keep the existing visibility/interval re-trigger from `useAppData` but have it bump a dep passed into the totals `useLiveQuery` so it re-queries at the new day boundary.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: pass (not wired in yet).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLiveQuery.js src/hooks/useLiveData.js
git commit -m "feat: add useLiveQuery + useLiveData reactive read hooks

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6.2: Switch App to live reads; delete goalRefreshKey [model: claude-opus-4-8]

**Why Opus:** rewiring the central data flow in App.jsx + collapsing useAppData touches many consumers; must verify nothing reads stale `loadData`-pushed state.

**Files:**
- Modify: [src/App.jsx](../../../src/App.jsx), [src/hooks/useAppData.js](../../../src/hooks/useAppData.js), [src/components/PracticeItemList.jsx](../../../src/components/PracticeItemList.jsx) (consumes `goalRefreshKey`)

- [ ] **Step 1: Replace `useAppData` data state with `useLiveData` in App**

In [App.jsx](../../../src/App.jsx): replace the `useAppData()` destructure (lines 47-51) with `const { items, totals, metronomePractices, notes } = useLiveData();`. Keep `refreshNotes`/`loadData` only if still needed by sync orchestration (see Task 6.4). Remove `goalRefreshKey` and the `goalRefreshKey={goalRefreshKey}` prop on `PracticeItemList` (line 220). In `PracticeItemList`, the `GoalBanner` already uses its own liveQuery, so delete the `goalRefreshKey` prop and any effect keyed on it.

- [ ] **Step 2: Reduce `useAppData` to the day-change/purge effects only**

Keep the `purgeExpiredTrash` effect and the day-change checker, but they no longer call `loadData` to refresh React state (liveQuery handles that) — purge mutates Dexie and liveQuery re-emits. Keep the remote-delete propagation. Export only what's still consumed.

- [ ] **Step 3: Build + lint + full suite**

Run: `npm run build && npm run lint && npx vitest run`
Expected: pass. Manual: add/rename/delete an item and confirm the list + totals update without a manual refresh; confirm the goal banner reflects a new log.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/hooks/useAppData.js src/components/PracticeItemList.jsx
git commit -m "refactor: App reads via liveQuery; remove goalRefreshKey

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6.3: Make report log reads reactive [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/hooks/useReports.js](../../../src/hooks/useReports.js)

- [ ] **Step 1: Convert reportLogs/weekLogs/monthLogs/yearLogs to liveQuery range subscriptions keyed by reportDate**

Replace the imperative fetch-on-`loadData` for each range with `useLiveQuery(() => getLogsByDateRange(start, end), [start, end], [])`. Derive `start`/`end` from `reportDate` + the subpage span as the code does today. Remove the corresponding `setReportLogs`/`setWeekLogs`/etc. setters from the hook's API (and from the `useSync` resetters bag in Task 6.4).

- [ ] **Step 2: Build + run report tests**

Run: `npm run build && npx vitest run tests/useReports.test.js tests/reportBreakdown.test.js`
Expected: pass. Manual: step report date with `←`/`→` and confirm each report (daily/weekly/monthly/yearly) updates and reflects a freshly-added log immediately.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReports.js
git commit -m "refactor: report log reads via liveQuery range subscriptions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6.4: Delete the resetters bag; simplify logout/visitor reset [model: claude-opus-4-8]

**Why Opus:** the reset logic guards against repopulating the previous user's data; removing it requires confirming liveQuery + `wipeAllLocalData` fully cover every cleared field.

**Files:**
- Modify: [src/hooks/useSync.js](../../../src/hooks/useSync.js), [src/App.jsx](../../../src/App.jsx)

- [ ] **Step 1: Remove the 16-setter `resetters` object**

In [App.jsx](../../../src/App.jsx) (lines 125-143) stop passing `resetters`. In [useSync.js](../../../src/hooks/useSync.js): the two reset effects (lines 40-63 for `!user`, 65-85 for visitor-logoff) no longer clear data state — liveQuery sourced from Dexie clears automatically once `wipeAllLocalData()` runs. Keep ONLY the ephemeral-UI resets that are NOT Dexie-derived: `setActiveTab('practice')`, `setSettingsOpen(false)`, and the metronome/sequencer in-memory state (which is not in Dexie — confirm via `useMetronomeState`; if it persists to Dexie it can also be dropped, otherwise keep its resetters). Pass only those few setters.

> **Note:** Confirm the logout path actually calls `wipeAllLocalData()` (sign-in/visitor-logoff per CLAUDE.md). If `!user` (normal sign-out) does NOT wipe Dexie, liveQuery would still show the prior user's rows — in that case keep clearing by calling `wipeAllLocalData()` on sign-out OR retain the data resetters. Verify before deleting.

- [ ] **Step 2: Build + lint + auth/visitor tests + manual**

Run: `npm run build && npm run lint && npx vitest run tests/authContext.test.jsx tests/visitorMode.test.js`
Expected: pass. Manual: sign out → confirm no data leaks into the next session; visitor log-off → confirm clean state.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSync.js src/App.jsx
git commit -m "refactor: drop resetters bag; reset relies on liveQuery + Dexie wipe

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6.5: Remove the nav/reports wiring-cycle ref [model: claude-sonnet-4-6]

**Files:**
- Modify: [src/App.jsx:85-114](../../../src/App.jsx), [src/hooks/useReports.js](../../../src/hooks/useReports.js), [src/hooks/useNavigation.js](../../../src/hooks/useNavigation.js)

- [ ] **Step 1: Create nav before reports and pass `setReportSubpage` directly**

The `reportSubpageNavRef` hack exists because `useReports` needs `onNavigateToSubpage` but `useNavigation` owns `setReportSubpage`. With reports no longer owning fetched data, reorder: call `useNavigation` first (it doesn't depend on `reports` for subpage state — verify its current `{ reports, metronome, practices }` deps; the `reports` dep is likely only for date-stepping handlers). If `useNavigation` genuinely needs `reports`, instead lift `reportSubpage` state into `useNavigation` and pass `setReportSubpage` into `useReports({ onNavigateToSubpage: setReportSubpage })` directly, deleting the ref + the `eslint-disable react-hooks/refs` line.

> **Note:** Inspect the actual cross-dependency first. If `useNavigation` needs report date handlers AND `useReports` needs nav, break the smaller dependency: pass a stable `setReportSubpage` setter (from `useState` lifted to App) into both, removing the ref indirection.

- [ ] **Step 2: Build + lint + full suite + manual**

Run: `npm run build && npm run lint && npx vitest run`
Expected: pass. Manual: trigger a report drill-down that navigates subpages (e.g. yearly→month) and confirm navigation still works.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/hooks/useReports.js src/hooks/useNavigation.js
git commit -m "refactor: remove nav/reports wiring-cycle ref

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6.6: Update CLAUDE.md [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: [CLAUDE.md](../../../CLAUDE.md)

- [ ] **Step 1: Correct the docs**

Update: (a) provider hierarchy now `LanguageProvider → BackendProvider → AuthProvider → ErrorBoundary → App`; (b) document `useBackend()` and that components/hooks no longer import the singleton; (c) document the codec + reconciler layer in `src/services/backends/codecs/` + `reconcile.js`; (d) document the liveQuery read path (`useLiveData`/`useLiveQuery`) replacing `loadData`/`goalRefreshKey`/resetters; (e) note the locale JSON files; (f) note the ErrorBoundary + sync-error banner.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for backend injection, codecs, and liveQuery reads

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final verification (after all phases)

- [ ] `npm run build` — passes
- [ ] `npm run lint` — passes
- [ ] `npx vitest run` — all suites green (incl. new sync/codec/reconcile/errorBoundary)
- [ ] Manual checklist from [CLAUDE.md](../../../CLAUDE.md): all tabs/subpages; DB persists after refresh; metronome plays through tab switches; language toggle; offline refresh (DevTools offline + reload — data intact, banner shows); offline edits (pending count ticks); go-online round-trip; go online while still offline (3.5s toast); notes local + remote sync; cross-device merge sanity.
- [ ] `grep -rn "from '.*backends/firebaseBackend'" src` → only `BackendContext.jsx`.
- [ ] `grep -rn "goalRefreshKey\|resetters\|reportSubpageNavRef" src` → no matches.
