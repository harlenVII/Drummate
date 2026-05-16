# Timezone Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an account-synced "home timezone" setting that drives all date computation in the app, and switch practice logs to UTC-instant storage (`loggedAt`) so dates can be re-derived under any timezone.

**Architecture:** A module-level `timezoneService` holds the current timezone string (synced from Firestore `users/{uid}.timezone`, mirrored to localStorage). All "what date is this?" computations flow through TZ-aware helpers in a new `tzDateHelpers.js` that uses `Intl.DateTimeFormat('en-CA', { timeZone })`. Practice logs gain a `loggedAt` epoch-ms field (indexed); date strings become a denormalized cache derived from `loggedAt + currentTz`. Legacy logs are backfilled with `loggedAt = noon America/Los_Angeles` on their stored date.

**Tech Stack:** React 19, Dexie.js 4 (IndexedDB), Firebase Firestore, Vite 7. Vitest (added in Task 1) for unit tests on pure date functions.

**Spec:** [2026-05-15-timezone-setting-design.md](../specs/2026-05-15-timezone-setting-design.md)

---

## Task 1: Set up Vitest

**[model: claude-haiku-4-5-20251001]**

The repo has no test runner. Pure date helpers in Task 2 need real unit tests. Vitest plugs into the existing Vite config with one dep.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add the `test` script and verify devDependencies updated**

Edit `package.json` `scripts`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Add minimal Vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Add a smoke test to prove the runner works**

Create `tests/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/smoke.test.js
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: TZ-aware date helpers (TDD)

**[model: claude-sonnet-4-6]**

Pure functions only — no module imports beyond standard `Intl`. Test fully before any consumer touches them.

**Files:**
- Create: `src/utils/tzDateHelpers.js`
- Create: `tests/tzDateHelpers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/tzDateHelpers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  formatInTimezone,
  getDateRangeUtc,
  noonInHomeTz,
  legacyDateToLoggedAt,
} from '../src/utils/tzDateHelpers.js';

describe('formatInTimezone', () => {
  it('formats a UTC instant as YYYY-MM-DD in PT', () => {
    // 2026-05-15 07:00 UTC = 2026-05-15 00:00 PDT (UTC-7)
    const ms = Date.UTC(2026, 4, 15, 7, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-05-15');
  });

  it('formats a UTC instant as YYYY-MM-DD in JST', () => {
    // 2026-05-15 14:00 UTC = 2026-05-15 23:00 JST (UTC+9)
    const ms = Date.UTC(2026, 4, 15, 14, 0, 0);
    expect(formatInTimezone(ms, 'Asia/Tokyo')).toBe('2026-05-15');
  });

  it('crosses calendar boundaries correctly across zones', () => {
    // 2026-05-16 02:00 UTC = 2026-05-15 19:00 PDT, but already 2026-05-16 11:00 in JST
    const ms = Date.UTC(2026, 4, 16, 2, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-05-15');
    expect(formatInTimezone(ms, 'Asia/Tokyo')).toBe('2026-05-16');
  });

  it('handles DST spring-forward in PT', () => {
    // 2026-03-08 10:00 UTC is after DST starts (02:00 -> 03:00 local)
    const ms = Date.UTC(2026, 2, 8, 10, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-03-08');
  });
});

describe('getDateRangeUtc', () => {
  it('returns the UTC window for a PT calendar date in standard time', () => {
    // 2026-01-15 in PT (UTC-8): midnight PT = 08:00 UTC; next midnight = 2026-01-16 08:00 UTC
    const r = getDateRangeUtc('2026-01-15', 'America/Los_Angeles');
    expect(r.startMs).toBe(Date.UTC(2026, 0, 15, 8, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 0, 16, 8, 0, 0));
  });

  it('returns the UTC window for a PT calendar date in daylight time', () => {
    // 2026-07-15 in PDT (UTC-7): midnight PDT = 07:00 UTC
    const r = getDateRangeUtc('2026-07-15', 'America/Los_Angeles');
    expect(r.startMs).toBe(Date.UTC(2026, 6, 15, 7, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 6, 16, 7, 0, 0));
  });

  it('returns the UTC window for a JST calendar date', () => {
    // 2026-05-15 in JST (UTC+9): midnight JST = 2026-05-14 15:00 UTC
    const r = getDateRangeUtc('2026-05-15', 'Asia/Tokyo');
    expect(r.startMs).toBe(Date.UTC(2026, 4, 14, 15, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 4, 15, 15, 0, 0));
  });
});

describe('noonInHomeTz', () => {
  it('returns noon PDT for a summer date', () => {
    // 2026-07-08 12:00 PDT = 2026-07-08 19:00 UTC
    expect(noonInHomeTz('2026-07-08', 'America/Los_Angeles'))
      .toBe(Date.UTC(2026, 6, 8, 19, 0, 0));
  });

  it('returns noon PST for a winter date', () => {
    // 2026-01-08 12:00 PST = 2026-01-08 20:00 UTC
    expect(noonInHomeTz('2026-01-08', 'America/Los_Angeles'))
      .toBe(Date.UTC(2026, 0, 8, 20, 0, 0));
  });
});

describe('legacyDateToLoggedAt', () => {
  it('always anchors to noon America/Los_Angeles regardless of caller tz', () => {
    expect(legacyDateToLoggedAt('2026-05-08'))
      .toBe(Date.UTC(2026, 4, 8, 19, 0, 0));
    expect(legacyDateToLoggedAt('2026-01-08'))
      .toBe(Date.UTC(2026, 0, 8, 20, 0, 0));
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test`
Expected: All tests fail with "module not found" or "function not defined".

- [ ] **Step 3: Implement the helpers**

Create `src/utils/tzDateHelpers.js`:

```js
const LEGACY_BACKFILL_TZ = 'America/Los_Angeles';

const cachedFormatters = new Map();

function getYmdFormatter(tz) {
  let f = cachedFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    cachedFormatters.set(tz, f);
  }
  return f;
}

export function formatInTimezone(epochMs, tz) {
  return getYmdFormatter(tz).format(new Date(epochMs));
}

// Returns the UTC offset (ms) for a given UTC instant when viewed in `tz`.
// Positive when tz is east of UTC (e.g. JST = +9h => +9*3600*1000).
function getTzOffsetMs(epochMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - epochMs;
}

// Converts "YYYY-MM-DD HH:mm:ss in tz" to the matching UTC epoch ms.
// Two-pass offset resolution handles DST transitions correctly.
function tzLocalToUtcMs(year, month, day, hour, minute, second, tz) {
  // First guess: pretend the local time is UTC, then subtract the offset at that instant.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getTzOffsetMs(guess, tz);
  const candidate = guess - offset1;
  // Re-check the offset at the candidate; if it differs (DST boundary), use the second offset.
  const offset2 = getTzOffsetMs(candidate, tz);
  return guess - offset2;
}

export function getDateRangeUtc(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startMs = tzLocalToUtcMs(y, m, d, 0, 0, 0, tz);
  // Next-day midnight via Date math on the source numbers (UTC arithmetic on the y/m/d triple).
  const nextMidnightUtc = Date.UTC(y, m - 1, d + 1);
  const nextY = new Date(nextMidnightUtc).getUTCFullYear();
  const nextM = new Date(nextMidnightUtc).getUTCMonth() + 1;
  const nextD = new Date(nextMidnightUtc).getUTCDate();
  const endMsExclusive = tzLocalToUtcMs(nextY, nextM, nextD, 0, 0, 0, tz);
  return { startMs, endMsExclusive };
}

export function noonInHomeTz(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return tzLocalToUtcMs(y, m, d, 12, 0, 0, tz);
}

export function legacyDateToLoggedAt(dateStr) {
  return noonInHomeTz(dateStr, LEGACY_BACKFILL_TZ);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: All tests in `tzDateHelpers.test.js` pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tzDateHelpers.js tests/tzDateHelpers.test.js
git commit -m "feat: add tz-aware date helpers"
```

---

## Task 3: Timezone service module

**[model: claude-sonnet-4-6]**

Holds the current TZ in a module-level variable, mirrors to localStorage, syncs from Firestore on auth. No React — pure module state so date helpers can read synchronously.

**Files:**
- Create: `src/services/timezoneService.js`
- Create: `tests/timezoneService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/timezoneService.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('timezoneService', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.localStorage = (() => {
      const store = new Map();
      return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
    })();
  });

  it('defaults to America/Los_Angeles when no cache and no userId', async () => {
    const m = await import('../src/services/timezoneService.js');
    expect(m.getTimezone()).toBe('America/Los_Angeles');
  });

  it('reads from localStorage cache when present', async () => {
    localStorage.setItem('drummate_timezone', 'Asia/Tokyo');
    const m = await import('../src/services/timezoneService.js');
    expect(m.getTimezone()).toBe('Asia/Tokyo');
  });

  it('setTimezone updates module state and localStorage', async () => {
    const m = await import('../src/services/timezoneService.js');
    await m.setTimezone('Europe/London');
    expect(m.getTimezone()).toBe('Europe/London');
    expect(localStorage.getItem('drummate_timezone')).toBe('Europe/London');
  });

  it('setTimezone rejects an invalid tz and keeps prior value', async () => {
    const m = await import('../src/services/timezoneService.js');
    const before = m.getTimezone();
    await expect(m.setTimezone('Not/A_Real_Zone')).rejects.toThrow();
    expect(m.getTimezone()).toBe(before);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm test -- timezoneService`
Expected: import fails or tests fail.

- [ ] **Step 3: Implement the service**

Create `src/services/timezoneService.js`:

```js
const STORAGE_KEY = 'drummate_timezone';
const DEFAULT_TZ = 'America/Los_Angeles';

function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function readCache() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v && isValidTz(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
}

let currentTz = readCache() ?? DEFAULT_TZ;

export function getTimezone() {
  return currentTz;
}

export async function setTimezone(tz, backend = null, userId = null) {
  if (!isValidTz(tz)) {
    throw new Error(`Invalid timezone: ${tz}`);
  }
  currentTz = tz;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, tz);
  } catch {
    // ignore
  }
  if (backend && userId) {
    backend.setUserSetting(userId, 'timezone', tz).catch(console.error);
  }
}

export async function initTimezone(backend, userId) {
  if (!backend || !userId) return;
  try {
    const settings = await backend.getUserSettings(userId);
    if (settings?.timezone && isValidTz(settings.timezone)) {
      currentTz = settings.timezone;
      try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch {}
      return;
    }
    // No remote value yet — write the backfill default for this user.
    await backend.setUserSetting(userId, 'timezone', DEFAULT_TZ);
    currentTz = DEFAULT_TZ;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch {}
  } catch (err) {
    console.error('initTimezone failed; keeping cached value', err);
  }
}

export function detectDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- timezoneService`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/timezoneService.js tests/timezoneService.test.js
git commit -m "feat: add timezone service with localStorage cache"
```

---

## Task 4: User-settings methods on Firebase backend

**[model: claude-haiku-4-5-20251001]**

Generic read/write on `users/{uid}` document. No new collection, no migration.

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Read existing import block to confirm `doc` is already imported**

Check `firebaseBackend.js` line 9 area: `doc`, `setDoc`, `getDocs`, `getDoc` should be imported. If `getDoc` is not imported, add it.

- [ ] **Step 2: Add the two methods**

In `firebaseBackend.js`, find the export object (search for `export const firebaseBackend` or the closing `};` of the main backend object) and add:

```js
async getUserSettings(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
},

async setUserSetting(userId, key, value) {
  const ref = doc(db, 'users', userId);
  await setDoc(ref, { [key]: value }, { merge: true });
},
```

If `db` is not in scope at the call sites of other methods, use whatever the file already uses (e.g. `getFirestore()`); follow the existing pattern in the file.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat: add user-settings get/set on firebase backend"
```

---

## Task 5: Persist `logged_at` on log push/pull

**[model: claude-sonnet-4-6]**

Wire format change: every log gains a `logged_at` (epoch ms) field. Read-side prefers `logged_at`; falls back to deriving from `date` for old-client writes.

**Files:**
- Modify: `src/services/backends/firebaseBackend.js`

- [ ] **Step 1: Add a helper at the top of the file**

After the imports, add:

```js
import { legacyDateToLoggedAt } from '../../utils/tzDateHelpers.js';

function resolveLoggedAt(remote) {
  if (typeof remote.logged_at === 'number') return remote.logged_at;
  if (remote.date) return legacyDateToLoggedAt(remote.date);
  return Date.now();
}
```

- [ ] **Step 2: Update every `setDoc` call that writes a log**

Find each `setDoc(logDocRef, { ... })` or `setDoc(doc(logsRef(userId), ...), { ... })` (around lines 142 and other log-write sites). Each payload currently contains `date`, `duration`, `item_uid`, etc. Add `logged_at: log.loggedAt ?? legacyDateToLoggedAt(log.date)` to every log payload.

Example transformation:

Before:
```js
await setDoc(logDocRef, {
  uid: localLog.uid,
  item_uid: localLog.itemUid,
  date: localLog.date,
  duration: localLog.duration,
});
```

After:
```js
await setDoc(logDocRef, {
  uid: localLog.uid,
  item_uid: localLog.itemUid,
  date: localLog.date,
  duration: localLog.duration,
  logged_at: localLog.loggedAt ?? legacyDateToLoggedAt(localLog.date),
});
```

Apply this transformation to every log-write site in the file. Search for `setDoc` near `logsRef` or `logDocRef` to find them all.

- [ ] **Step 3: Update every log read path**

Find every place a Firestore log doc's `data()` is read (in `pullAll`, `subscribeToChanges` log handlers, and any `pullSince`-type method). When mapping remote data into a local log row, add `loggedAt: resolveLoggedAt(data)` so locals always have it. For `subscribeToChanges` `modified` log handler that currently remaps `itemUid`/`itemId`, also update `loggedAt: resolveLoggedAt(data)`.

Example:

Before:
```js
const local = {
  uid: data.uid,
  itemUid: data.item_uid,
  date: data.date,
  duration: data.duration,
};
```

After:
```js
const local = {
  uid: data.uid,
  itemUid: data.item_uid,
  date: data.date,
  duration: data.duration,
  loggedAt: resolveLoggedAt(data),
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/backends/firebaseBackend.js
git commit -m "feat: persist logged_at on log push/pull"
```

---

## Task 6: Dexie schema v13 + log migration

**[model: claude-sonnet-4-6]**

Add `loggedAt` to the `practiceLogs` index, backfill every existing row.

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Add the import**

At the top of `database.js`, add:

```js
import { legacyDateToLoggedAt } from '../utils/tzDateHelpers.js';
```

- [ ] **Step 2: Append the v13 stores block**

Immediately after the existing `db.version(12).stores({ ... });` block, add:

```js
// v13 adds loggedAt (UTC epoch ms) to practiceLogs as the source of truth for
// date grouping. Legacy rows are backfilled to noon America/Los_Angeles on
// their stored date. The `date` field stays as a denormalized read-cache.
db.version(13).stores({
  practiceItems: '++id, &uid, name, sortOrder, archived, trashed, category',
  practiceLogs:  '++id, itemId, itemUid, date, duration, uid, loggedAt',
  notes:         '++id, &uid, itemUid, date, trashed',
  metronomePractices: '++id, &uid, sortOrder',
  syncQueue:     '++id, action, collection, localId',
}).upgrade(tx => {
  return tx.table('practiceLogs').toCollection().modify(log => {
    if (typeof log.loggedAt !== 'number' && log.date) {
      log.loggedAt = legacyDateToLoggedAt(log.date);
    }
  });
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual smoke test (dev server)**

Run: `npm run dev`
Open the app in the browser. In DevTools → Application → IndexedDB → DrummateDB → practiceLogs, confirm every row has a `loggedAt` number. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/services/database.js
git commit -m "feat(db): bump to v13 with loggedAt on practiceLogs"
```

---

## Task 7: Split `addLog` into real-time vs adjustment paths

**[model: claude-sonnet-4-6]**

`addLog(itemId, duration, dateOrOpts)` is currently overloaded across four call sites with different intents. Split it.

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Replace the current `addLog`**

Locate `export const addLog = async (itemId, duration, date) => { ... }` (around line 253) and replace it with:

```js
import { getTimezone } from './timezoneService.js';
import { formatInTimezone, noonInHomeTz } from '../utils/tzDateHelpers.js';

export const addLog = async (itemId, duration, opts = {}) => {
  const loggedAt = typeof opts.loggedAt === 'number' ? opts.loggedAt : Date.now();
  const date = formatInTimezone(loggedAt, getTimezone());
  const uid = crypto.randomUUID();
  const item = await db.practiceItems.get(itemId);
  const itemUid = item?.uid || null;
  return await db.practiceLogs.add({ itemId, itemUid, date, duration, uid, loggedAt });
};

export const addAdjustmentLog = async (itemId, duration, dateStr) => {
  const tz = getTimezone();
  const loggedAt = noonInHomeTz(dateStr, tz);
  const uid = crypto.randomUUID();
  const item = await db.practiceItems.get(itemId);
  const itemUid = item?.uid || null;
  return await db.practiceLogs.add({
    itemId, itemUid, date: dateStr, duration, uid, loggedAt,
  });
};
```

Note: the imports at the top of the function should be hoisted to the top of `database.js` (next to the existing imports), not left mid-file. Move them up.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds (consumers still call the old `addLog(itemId, duration, date)` signature but pass a string in the third arg — that becomes `opts = "YYYY-MM-DD"`, which is wrong. We fix consumers in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/services/database.js
git commit -m "feat(db): split addLog into addLog + addAdjustmentLog"
```

---

## Task 8: Rewrite log range queries against `loggedAt`

**[model: claude-sonnet-4-6]**

`getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange` switch from `where('date').equals(...)` to UTC range queries on `loggedAt`.

**Files:**
- Modify: `src/services/database.js`

- [ ] **Step 1: Add the import (if not already there from Task 7)**

At the top of `database.js`:

```js
import { getDateRangeUtc } from '../utils/tzDateHelpers.js';
import { getTimezone } from './timezoneService.js';
```

- [ ] **Step 2: Replace the three query functions**

Locate `getTodaysLogs`, `getLogsByDate`, and `getLogsByDateRange` (around lines 261-280) and replace:

```js
export const getTodaysLogs = async () => {
  const tz = getTimezone();
  const today = formatInTimezone(Date.now(), tz);
  const { startMs, endMsExclusive } = getDateRangeUtc(today, tz);
  return await db.practiceLogs
    .where('loggedAt')
    .between(startMs, endMsExclusive, true, false)
    .toArray();
};

export const getLogsByDate = async (dateString) => {
  const tz = getTimezone();
  const { startMs, endMsExclusive } = getDateRangeUtc(dateString, tz);
  return await db.practiceLogs
    .where('loggedAt')
    .between(startMs, endMsExclusive, true, false)
    .toArray();
};

export const getLogsByDateRange = async (startDate, endDate) => {
  const tz = getTimezone();
  const startMs = getDateRangeUtc(startDate, tz).startMs;
  const endMsExclusive = getDateRangeUtc(endDate, tz).endMsExclusive;
  return await db.practiceLogs
    .where('loggedAt')
    .between(startMs, endMsExclusive, true, false)
    .toArray();
};
```

Make sure `formatInTimezone` is in the import list.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/services/database.js
git commit -m "feat(db): query logs by loggedAt range instead of date equality"
```

---

## Task 9: Wire `dateHelpers.toDateString` through `tzDateHelpers`

**[model: claude-haiku-4-5-20251001]**

`toDateString(date)` and `getTodayString()` currently use device-local `getFullYear()/getMonth()/getDate()`. Switch them to the TZ-aware formatter.

**Files:**
- Modify: `src/utils/dateHelpers.js`

- [ ] **Step 1: Update the file**

In `src/utils/dateHelpers.js`, replace the top section:

```js
import { formatInTimezone } from './tzDateHelpers.js';
import { getTimezone } from '../services/timezoneService.js';

/**
 * Returns "YYYY-MM-DD" for a Date object, in the configured home timezone.
 */
export function toDateString(date) {
  return formatInTimezone(date.getTime(), getTimezone());
}

/**
 * Returns today's date string in the configured home timezone.
 */
export function getTodayString() {
  return formatInTimezone(Date.now(), getTimezone());
}
```

Leave `shiftDate`, `getWeekStart/End`, `getMonthStart/End`, `getYearStart/End`, and `formatDateLabel` untouched — they operate on already-resolved date strings.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/dateHelpers.js
git commit -m "feat: route dateHelpers through tz-aware formatter"
```

---

## Task 10: App.jsx wiring — initTimezone, addAdjustmentLog swap, pending-log

**[model: claude-sonnet-4-6]**

Three changes in `App.jsx`:
1. Call `initTimezone(backend, userId)` once auth resolves.
2. Swap the manual-adjust call from `addLog(itemId, delta, reportDate)` to `addAdjustmentLog(itemId, delta, reportDate)`.
3. Update pending-log to store `loggedAt` (epoch ms) instead of `date` (string).

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import additions**

Near the existing imports in `App.jsx`, add:

```js
import { addAdjustmentLog } from './services/database';
import { initTimezone } from './services/timezoneService';
import { firebaseBackend } from './services/backends/firebaseBackend';
```

(Adjust paths to match how other imports in the file are written. `firebaseBackend` is probably already imported — check first and reuse the existing symbol if so.)

- [ ] **Step 2: Init timezone on auth**

Find the effect or block in `App.jsx` that runs after `user` resolves (search for `user?.id` or similar). Add a one-shot effect:

```js
useEffect(() => {
  if (user?.id) {
    initTimezone(firebaseBackend, user.id).then(() => {
      loadData();
    });
  }
}, [user?.id]);
```

If a similar auth-resolved effect already exists that calls `loadData()`, append the `initTimezone(...)` call inside it (before `loadData()`) instead of adding a new effect.

- [ ] **Step 3: Swap to `addAdjustmentLog` in `handleManualTimeAdjust`**

Locate `handleManualTimeAdjust` (around line 835):

Before:
```js
const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
  const logId = await addLog(itemId, deltaSeconds, date);
  ...
}, [...]);
```

After:
```js
const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
  const logId = await addAdjustmentLog(itemId, deltaSeconds, date);
  ...
}, [...]);
```

Leave everything else in the callback identical.

- [ ] **Step 4: Update pending-log save (the page-kill path)**

Locate `App.jsx` lines 476-479 (the `localStorage.setItem('drummate_pending_log', ...)` call):

Before:
```js
localStorage.setItem(
  'drummate_pending_log',
  JSON.stringify({ itemId, duration: elapsed, date: getTodayString() }),
);
```

After:
```js
localStorage.setItem(
  'drummate_pending_log',
  JSON.stringify({ itemId, duration: elapsed, loggedAt: Date.now() }),
);
```

- [ ] **Step 5: Update pending-log recovery**

Locate `App.jsx` lines 451-463 (the recovery effect):

Before:
```js
const { itemId, duration, date } = JSON.parse(pending);
if (itemId != null && duration > 0) {
  addLog(itemId, duration, date).then(() => loadData());
}
```

After:
```js
const parsed = JSON.parse(pending);
const { itemId, duration } = parsed;
// Older format used `date`; convert to loggedAt for backward compat.
const loggedAt = typeof parsed.loggedAt === 'number'
  ? parsed.loggedAt
  : (parsed.date ? Date.parse(parsed.date + 'T12:00:00') : Date.now());
if (itemId != null && duration > 0) {
  addLog(itemId, duration, { loggedAt }).then(() => loadData());
}
```

- [ ] **Step 6: Verify the two other `addLog` call sites use the new signature**

Lines 514 and 537 currently call `addLog(itemId, elapsed)` / `addLog(activeItemId, elapsedTime)` — these are the timer-stop paths. They have no third argument, so the new signature (`(itemId, duration, opts = {})`) handles them unchanged. No edit needed; just verify the file builds.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): init timezone on auth, use addAdjustmentLog for edits"
```

---

## Task 11: Settings panel — timezone picker + translations

**[model: claude-sonnet-4-6]**

Add a Timezone row to `SettingsPanel.jsx` with a full IANA dropdown.

**Files:**
- Modify: `src/components/SettingsPanel.jsx`
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add translation keys**

In `LanguageContext.jsx`, find the `en` and `zh` dictionaries. Add:

```js
// en
timezone: 'Timezone',

// zh
timezone: '时区',
```

Place them next to existing setting labels (`language`, `timeUnit`).

- [ ] **Step 2: Add imports to SettingsPanel.jsx**

```js
import { useMemo } from 'react';
import { getTimezone, setTimezone } from '../services/timezoneService';
import { firebaseBackend } from '../services/backends/firebaseBackend';
```

- [ ] **Step 3: Accept `userId` prop**

Update the component signature in `SettingsPanel.jsx` to accept `userId`:

```js
function SettingsPanel({
  language,
  toggleLanguage,
  timeUnit,
  onToggleTimeUnit,
  userId,
  onTimezoneChange,
  // ...other existing props
}) {
```

- [ ] **Step 4: Build the timezone list and current value**

Inside the component body, after the existing hooks:

```js
const timezones = useMemo(() => {
  if (typeof Intl.supportedValuesOf === 'function') {
    try { return Intl.supportedValuesOf('timeZone'); } catch {}
  }
  return ['America/Los_Angeles', 'America/New_York', 'UTC', 'Europe/London', 'Asia/Tokyo'];
}, []);

const currentTz = getTimezone();

const handleTimezoneChange = async (e) => {
  const newTz = e.target.value;
  try {
    await setTimezone(newTz, firebaseBackend, userId);
    if (onTimezoneChange) onTimezoneChange();
  } catch (err) {
    console.error('Failed to set timezone', err);
  }
};
```

- [ ] **Step 5: Render the timezone row in the JSX**

Place this row between the Language row and the Time Unit row in the existing settings list:

```jsx
<div className="flex items-center justify-between py-3">
  <span className="text-sm font-medium text-gray-700">{t('timezone')}</span>
  <select
    value={currentTz}
    onChange={handleTimezoneChange}
    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
  >
    {timezones.map(tz => (
      <option key={tz} value={tz}>{tz}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 6: Pass `userId` and `onTimezoneChange` from `App.jsx`**

Find the `<SettingsPanel ...>` JSX in `App.jsx` and add:

```jsx
<SettingsPanel
  // ...existing props
  userId={user?.id}
  onTimezoneChange={loadData}
/>
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/SettingsPanel.jsx src/contexts/LanguageContext.jsx src/App.jsx
git commit -m "feat(ui): add timezone setting to settings panel"
```

---

## Task 12: Update CLAUDE.md and run end-to-end manual verification

**[model: claude-sonnet-4-6]**

Documentation and final smoke test.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md DB version**

In `CLAUDE.md`, find "Database name: `DrummateDB`, current version: **10**." and update to:

```
Database name: `DrummateDB`, current version: **13**.
```

- [ ] **Step 2: Add `loggedAt` to the `practiceLogs` schema description**

In the `practiceLogs` bullet of CLAUDE.md, update the schema and add a description for `loggedAt`:

```
- `practiceLogs` — Schema: `'++id, itemId, itemUid, date, duration, uid, loggedAt'`
  - `loggedAt`: UTC epoch ms. Source of truth for date grouping. New logs stamp `Date.now()` at timer-stop; adjustment logs (from Daily report Edit) stamp noon in the configured home TZ on the edited date; legacy rows were backfilled by the v13 migration to noon America/Los_Angeles on their stored `date`.
  - `date`: denormalized `YYYY-MM-DD` cache derived from `loggedAt + currentTimezone`. Kept for wire-format backward compat; not used for queries.
```

- [ ] **Step 3: Add a "Timezone setting" subsection under Architecture Overview**

Add a paragraph after the "Notes Tab" section in CLAUDE.md:

```
### Timezone Setting

A single account-synced home timezone determines how all dates are computed. Stored on `users/{uid}.timezone` in Firestore, mirrored to `localStorage['drummate_timezone']`. The current value lives in a module-level variable in [src/services/timezoneService.js](src/services/timezoneService.js); `getTimezone()` is a synchronous getter consumed by [src/utils/tzDateHelpers.js](src/utils/tzDateHelpers.js) and `dateHelpers.toDateString`. `initTimezone(backend, userId)` is called from `App.jsx` once auth resolves and reconciles localStorage against Firestore.

All log-grouping reads (`getTodaysLogs`, `getLogsByDate`, `getLogsByDateRange`) use `loggedAt` range queries derived from the current timezone — switching the setting at runtime makes every report re-bucket without touching stored data.
```

- [ ] **Step 4: Manual verification (the full checklist)**

Run: `npm run dev`. In the browser:

- [ ] On first load with an existing account, DevTools → IndexedDB → DrummateDB → practiceLogs: every row has a `loggedAt` number.
- [ ] DevTools → IndexedDB → DrummateDB (or Firestore console) → users/<uid>: `timezone` field is `"America/Los_Angeles"`.
- [ ] Daily report header shows today's PT date.
- [ ] Switch language toggle — works.
- [ ] Open settings, change Timezone to `Asia/Tokyo`. Daily report header should update to today's Tokyo date; an existing log made in the PT-evening hours should now appear under the next day.
- [ ] Switch Timezone back to `America/Los_Angeles`. Reports return to original layout.
- [ ] Practice tab: start a timer for 10 seconds, stop. DevTools → practiceLogs: new row has `loggedAt` = the stop instant, `date` = today in current TZ.
- [ ] Daily report → Edit on a past date → adjust time → confirm a new row appears with `loggedAt` near noon-PT on that date.
- [ ] Reload the page — all state persists.
- [ ] `npm run build` succeeds.
- [ ] `npm test` — all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for DB v13 and timezone setting"
```

---

## Self-review notes (already applied)

- **Spec coverage:** every spec section maps to a task. Timezone service (Task 3), TZ-aware helpers (Task 2), backend user-settings (Task 4), log wire-format (Task 5), schema + migration (Task 6), addLog split (Task 7), range queries (Task 8), dateHelpers wiring (Task 9), App.jsx wiring + pending-log (Task 10), settings UI + i18n (Task 11), docs + verification (Task 12).
- **Pending-log path** (called out by the planner during research) is handled in Task 10 steps 4-5.
- **Placeholders:** none. Every step has either complete code or an exact command.
- **Type consistency:** `loggedAt` (camelCase in Dexie, snake_case `logged_at` in Firestore), `date`, `formatInTimezone`, `getDateRangeUtc`, `noonInHomeTz`, `legacyDateToLoggedAt`, `getTimezone`, `setTimezone`, `initTimezone`, `addAdjustmentLog` — all referenced consistently across tasks.
