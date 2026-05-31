# Code Quality Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code and production debug noise, de-duplicate repeated logic into shared helpers, and harden two unguarded promise chains — all behavior-neutral, with the test suite and build green throughout.

**Architecture:** Pure cleanup of an existing React 19 + Vite + Dexie PWA. No new features, no schema changes, no UI changes. Work proceeds safest-first: deletions → small extractions → robustness → larger optional refactor. Each task is independently committable and leaves `npm run lint`, `npm run build`, and `npm test` passing.

**Tech Stack:** React 19, Vite 7, Vitest, ESLint 9 (flat config), Dexie.js. Tests live in `tests/` (not `src/`).

---

## Important conventions for the executor

- **Commit style:** Conventional commits (`feat:`/`fix:`/`refactor:`/`chore:`/`docs:`). Every commit message ends with:
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- **Line numbers in this plan are anchors, not guarantees.** Earlier tasks shift later line numbers. Every edit step gives a unique string to search for — locate by that string, not the line number. Each task starts with a grep to re-confirm the current location.
- **Verification after every task:** `npm run lint` (must exit 0), `npm run build` (must succeed), `npm test` (must show all passing). The task steps spell this out.
- **No browser automation** for verification (project rule). Behavior-neutral changes are verified by the existing test suite + build; manual UI steps are listed where relevant.
- **This is a quality-only plan.** If any task surfaces what looks like a real behavior bug, STOP and report it rather than "fixing" it silently inside a cleanup commit.

---

## File Structure

Files created:
- `src/constants/trash.js` — dependency-free home for `TRASH_RETENTION_DAYS` (Task 4; separate file avoids a `dateHelpers ↔ database` import cycle).
- `tests/formatTime.test.js` — new unit test locking `formatDuration`/`formatTime` behavior before the dead-export deletion (currently `formatTime.js` has no test).
- `tests/trashRetention.test.js` — new unit test for the extracted `daysUntilPurge` helper and `TRASH_RETENTION_DAYS` constant.
- `tests/reportBreakdown.test.js` — new unit test for the extracted `buildBreakdown` helper (Task 8, optional).

Files modified:
- `src/audio/metronomeEngine.js` — delete 12 `console.log` debug calls (Task 1).
- `src/utils/formatTime.js` — delete unused `formatMinutes` export (Task 3).
- `src/utils/dateHelpers.js` — delete unused `toDateString` export (Task 3); add `daysUntilPurge` helper (Task 5).
- `src/services/timezoneService.js` — delete unused `detectDeviceTimezone` export (Task 3).
- `src/services/intentParser.js` — drop `export` keyword from internally-used `levenshtein` (Task 3).
- `src/services/database.js` — import `TRASH_RETENTION_DAYS` from `constants/trash.js`, use as purge default (Task 4).
- `src/components/NotesPage.jsx` — use `daysUntilPurge`, drop the `eslint-disable` (Task 6); add `.catch` to `getTrashedNotes()` (Task 7).
- `src/components/PracticeItemList.jsx` — use `daysUntilPurge(trashedAt, now)` (Task 6).
- `src/App.jsx` — add `.catch` to the `addLog().then()` chain (Task 7).
- `src/components/{Daily,Weekly,Monthly,Yearly}Report.jsx` — use shared `buildBreakdown` (Task 8, optional).
- `CLAUDE.md` — document the new helpers/constant (Task 9).

---

## TIER A — Dead code & debug noise (safe deletions)

### Task 1: Remove production debug logging from the metronome audio engine

**Why:** [src/audio/metronomeEngine.js](../../../src/audio/metronomeEngine.js) contains 12 `console.log` calls (not gated by any debug flag) that fire in production — including per-scheduler-tick and per-note logs during playback. They are leftover diagnostics. `console.error`/`console.warn` calls are legitimate error reporting and MUST be kept.

**Files:**
- Modify: `src/audio/metronomeEngine.js`

- [ ] **Step 1: Inventory the exact debug lines**

Run:
```bash
cd /Users/harlen/Desktop/myCODE/Drummate
grep -n "console.log" src/audio/metronomeEngine.js
```
Expected: 12 results. (Approx. lines 110, 266, 284, 295, 302, 316, 345, 367, 379, 510, 555, 572 — re-confirm; each `console.log(...)` may span multiple physical lines until its closing `);`.)

- [ ] **Step 2: Confirm none are load-bearing**

`console.log` is output-only; removing it cannot change engine behavior. Confirm each is a `[Metronome] ...` diagnostic and not, e.g., a function call with side effects passed as an argument. Run:
```bash
grep -n "console.log" src/audio/metronomeEngine.js | grep -v "\[Metronome\]"
```
Expected: no output (every `console.log` is a `[Metronome]` diagnostic). If any line prints here, inspect it manually before deleting.

- [ ] **Step 3: Delete each `console.log(...)` statement (including its continuation lines up to and including the closing `);`)**

Edit `src/audio/metronomeEngine.js` and remove all 12 `console.log` statements. Do NOT touch `console.error` or `console.warn`. Work from the bottom of the file upward so earlier line numbers stay valid. Each statement looks like:
```js
      console.log('[Metronome] AudioContext statechange →', this.audioCtx.state,
        /* ...continuation args... */);
```
Remove the whole statement, leaving surrounding logic intact.

- [ ] **Step 4: Verify all debug logs are gone and error logging survives**

Run:
```bash
grep -c "console.log" src/audio/metronomeEngine.js   # expect 0
grep -c "console.error\|console.warn" src/audio/metronomeEngine.js  # expect 2 (unchanged)
```
Expected: `0`, then `2`.

- [ ] **Step 5: Build (engine is not unit-tested; build is the guard)**

Run:
```bash
npm run build
```
Expected: `✓ built` with no errors.

- [ ] **Step 6: Lint + tests**

Run:
```bash
npm run lint && npm test
```
Expected: lint exits 0; all tests pass (count unchanged from baseline, 117).

- [ ] **Step 7: Manual smoke (no automation available)**

Start `npm run dev`, open the Metronome tab, press play, switch tabs and back, stop. Confirm audio still plays and no errors appear in console. (This is a sanity check; the change is output-only.)

- [ ] **Step 8: Commit**

```bash
git add src/audio/metronomeEngine.js
git commit -m "chore(metronome): remove production debug console.log calls

12 ungated [Metronome] console.log diagnostics fired in production on every
play (including per-scheduler-tick and per-note logs). Removed; console.error
and console.warn error reporting kept. Output-only change, no behavior impact.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Lock `formatTime` behavior with a test before deleting its dead sibling

**Why:** Task 3 deletes the unused `formatMinutes` export from `formatTime.js`, which currently has **no test**. Add a characterization test first so the surviving exports (`formatDuration`, `formatTime`) are protected.

**Files:**
- Create: `tests/formatTime.test.js`

- [ ] **Step 1: Write the test**

Create `tests/formatTime.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { formatDuration, formatTime } from '../src/utils/formatTime';

describe('formatDuration', () => {
  it('returns whole minutes when unit is minutes', () => {
    expect(formatDuration(90, 'minutes')).toBe(2);   // 90s -> 1.5min -> rounds to 2
    expect(formatDuration(0, 'minutes')).toBe(0);
    expect(formatDuration(59, 'minutes')).toBe(1);
  });

  it('returns one-decimal hours when unit is hours', () => {
    expect(formatDuration(3600, 'hours')).toBe('1.0');
    expect(formatDuration(5400, 'hours')).toBe('1.5');
    expect(formatDuration(0, 'hours')).toBe('0.0');
  });
});

describe('formatTime', () => {
  it('formats seconds as zero-padded HH:MM:SS', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(61)).toBe('00:01:01');
    expect(formatTime(3661)).toBe('01:01:01');
  });
});
```

- [ ] **Step 2: Run it — must pass against current code**

Run:
```bash
npx vitest run tests/formatTime.test.js
```
Expected: PASS (this is characterization of existing behavior, so it passes immediately).

- [ ] **Step 3: Commit**

```bash
git add tests/formatTime.test.js
git commit -m "test(formatTime): characterize formatDuration and formatTime

Locks behavior of the surviving exports before removing the unused
formatMinutes export in the next commit. formatTime.js previously had no test.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Remove four unused exports

**Why:** Verified zero external references (across `src` + `tests`):
- `formatMinutes` — `src/utils/formatTime.js` (all callers removed in an earlier lint cleanup).
- `toDateString` — `src/utils/dateHelpers.js` (never imported; `getTodayString` duplicates its body inline).
- `detectDeviceTimezone` — `src/services/timezoneService.js` (no callers; JSDoc says "reserved for a future flow").
- `levenshtein` — `src/services/intentParser.js` (used INTERNALLY at the fuzzy-match site, so only the `export` keyword is removed — the function stays).

**Files:**
- Modify: `src/utils/formatTime.js`
- Modify: `src/utils/dateHelpers.js`
- Modify: `src/services/timezoneService.js`
- Modify: `src/services/intentParser.js`

- [ ] **Step 1: Re-confirm zero external references for the three fully-dead exports**

Run:
```bash
cd /Users/harlen/Desktop/myCODE/Drummate
for fn in formatMinutes toDateString detectDeviceTimezone; do
  echo "--- $fn ---"
  grep -rn "\b$fn\b" src tests --include='*.js' --include='*.jsx' | grep -v "export function $fn\|export const $fn"
done
```
Expected: no output under any of the three (only their definitions exist). If a reference appears, STOP — that export is not dead; report it.

- [ ] **Step 2: Re-confirm `levenshtein` is used internally only**

Run:
```bash
grep -n "levenshtein" src/services/intentParser.js
grep -rn "levenshtein" src tests --include='*.js' --include='*.jsx' | grep -v "intentParser.js"
```
Expected: two hits inside `intentParser.js` (the `export function levenshtein` definition and one call site); no hits outside the file.

- [ ] **Step 3: Delete `formatMinutes` from `src/utils/formatTime.js`**

Remove this block (it is the top of the file):
```js
export function formatMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

```
Leave `formatDuration` and `formatTime` intact.

- [ ] **Step 4: Delete `toDateString` from `src/utils/dateHelpers.js`**

Remove this block:
```js
/**
 * Returns "YYYY-MM-DD" for a Date object, in the user's configured timezone.
 */
export function toDateString(date) {
  return formatInTimezone(date.getTime(), getTimezone());
}

```
Keep `getTodayString` (which uses `formatInTimezone`/`getTimezone` directly) and the `formatInTimezone`/`getTimezone` imports — confirm they are still referenced by `getTodayString` after deletion (they are).

- [ ] **Step 5: Delete `detectDeviceTimezone` from `src/services/timezoneService.js`**

Remove the JSDoc block and function:
```js
/**
 * Returns the device's OS-level IANA timezone. Reserved for a future
 * new-account flow (currently every user gets the America/Los_Angeles
 * backfill default). Kept here so the consumer site can be wired up
 * later without touching this module.
 */
export function detectDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}
```

- [ ] **Step 6: Drop the `export` keyword on `levenshtein` in `src/services/intentParser.js`**

Change:
```js
export function levenshtein(a, b) {
```
to:
```js
function levenshtein(a, b) {
```

- [ ] **Step 7: Lint, build, test**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: lint exits 0 (no `no-unused-vars` for the now-internal `levenshtein`, since it is called at the fuzzy-match site); build succeeds; all tests pass including the new `tests/formatTime.test.js`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/formatTime.js src/utils/dateHelpers.js src/services/timezoneService.js src/services/intentParser.js
git commit -m "refactor: remove unused exports (formatMinutes, toDateString, detectDeviceTimezone; unexport levenshtein)

All four verified to have zero external references. levenshtein is used
internally in intentParser, so only its export keyword is dropped; the other
three functions are deleted entirely.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## TIER B — De-duplication (small extractions)

### Task 4: Introduce a shared `TRASH_RETENTION_DAYS` constant

**Why:** The 30-day soft-delete window lives as a bare literal in three places that must agree: the actual purge (`purgeExpiredTrash(daysOld = 30)` in `database.js`) and two UI "days until purge" countdowns (Tasks 5–6). A single shared constant makes them provably consistent and removes magic numbers.

**Where the constant lives — and WHY a new file:** It would be natural to export this from `database.js`, but `database.js` already imports from `dateHelpers.js` (`import { getTodayString } from '../utils/dateHelpers'`). Task 5 needs `dateHelpers.js` to read this constant — if it imported from `database.js`, that would create a `dateHelpers → database → dateHelpers` cycle. So the constant goes in a tiny dependency-free module, `src/constants/trash.js`, which both `database.js` and `dateHelpers.js` import. (`src/constants/` already exists — see `subdivisions.js`.)

**Files:**
- Create: `src/constants/trash.js`
- Modify: `src/services/database.js`

- [ ] **Step 1: Confirm the cycle risk is real (justifies the separate file)**

Run:
```bash
grep -n "dateHelpers" src/services/database.js
```
Expected: a hit (`import { getTodayString } from '../utils/dateHelpers';`). This is exactly why the constant must NOT live in `database.js`. If this ever returns nothing, the constant could move into `database.js` — but as of this plan, it cannot.

- [ ] **Step 2: Create `src/constants/trash.js`**

```js
/**
 * Days a soft-deleted (trashed) item or note is retained before
 * purgeExpiredTrash() (database.js) hard-deletes it. Shared with the UI
 * "days until purge" countdown (daysUntilPurge in dateHelpers) so the two
 * cannot drift. Kept in a dependency-free module to avoid a
 * dateHelpers <-> database import cycle.
 */
export const TRASH_RETENTION_DAYS = 30;
```

- [ ] **Step 3: Import and use it in `database.js`**

Add to the imports at the top of `src/services/database.js` (next to the other `../constants` import — there is already `import { SUBDIVISIONS } from '../constants/subdivisions';`):
```js
import { TRASH_RETENTION_DAYS } from '../constants/trash.js';
```
Then change:
```js
export const purgeExpiredTrash = async (daysOld = 30) => {
```
to:
```js
export const purgeExpiredTrash = async (daysOld = TRASH_RETENTION_DAYS) => {
```

- [ ] **Step 4: Lint, build, test**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all green. (No behavior change — the default value is still 30.)

- [ ] **Step 5: Commit**

```bash
git add src/constants/trash.js src/services/database.js
git commit -m "refactor(db): extract TRASH_RETENTION_DAYS constant

Replaces the bare 30-day purge-window literal so the actual purge and the UI
countdowns can share one source of truth (used by upcoming daysUntilPurge).
Lives in src/constants/trash.js to avoid a dateHelpers<->database import cycle.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Add a `daysUntilPurge` helper (TDD)

**Why:** NotesPage and PracticeItemList each inline the identical countdown math
(`Math.max(0, 30 - Math.floor((now - trashedAt) / 86400000))`) with raw magic numbers. Extract one tested pure helper. NotesPage's version also needed an `eslint-disable react-hooks/purity` for an inline `Date.now()`; moving the impurity into a helper that takes `now` as a parameter lets us drop that suppression in Task 6.

**Files:**
- Create: `tests/trashRetention.test.js`
- Modify: `src/utils/dateHelpers.js`

- [ ] **Step 1: Write the failing test**

Create `tests/trashRetention.test.js`. Import the constant from `src/constants/trash.js` (NOT `database.js`) — this keeps the test free of the Dexie module-load dependency, so no `fake-indexeddb` shim is needed:
```js
import { describe, it, expect } from 'vitest';
import { daysUntilPurge } from '../src/utils/dateHelpers';
import { TRASH_RETENTION_DAYS } from '../src/constants/trash';

const DAY = 1000 * 60 * 60 * 24;

describe('daysUntilPurge', () => {
  it('returns the full retention window for an item trashed just now', () => {
    const now = Date.now();
    expect(daysUntilPurge(new Date(now).toISOString(), now)).toBe(TRASH_RETENTION_DAYS);
  });

  it('counts down as time passes', () => {
    const now = Date.now();
    const trashedAt = new Date(now - 10 * DAY).toISOString();
    expect(daysUntilPurge(trashedAt, now)).toBe(TRASH_RETENTION_DAYS - 10);
  });

  it('never goes below zero past the window', () => {
    const now = Date.now();
    const trashedAt = new Date(now - 100 * DAY).toISOString();
    expect(daysUntilPurge(trashedAt, now)).toBe(0);
  });

  it('returns 0 when trashedAt is missing', () => {
    expect(daysUntilPurge(null, Date.now())).toBe(0);
    expect(daysUntilPurge(undefined, Date.now())).toBe(0);
  });

  it('defaults now to the current time when omitted', () => {
    const trashedAt = new Date(Date.now() - 5 * DAY).toISOString();
    // Allow either 25 (exactly) given rounding within the same ms window
    expect(daysUntilPurge(trashedAt)).toBe(TRASH_RETENTION_DAYS - 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
npx vitest run tests/trashRetention.test.js
```
Expected: FAIL with `daysUntilPurge is not a function` (or an import error).

- [ ] **Step 3: Implement the helper in `src/utils/dateHelpers.js`**

Add at the bottom of the file. Note the import of the shared constant — place the import line at the TOP of the file with the other imports. It MUST come from `constants/trash.js`, not `database.js`, to avoid the cycle:
```js
import { TRASH_RETENTION_DAYS } from '../constants/trash.js';
```
And the helper at the bottom:
```js
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Whole days remaining before a soft-deleted record is hard-purged.
 * Pure: callers pass `now` (epoch ms) so the function has no hidden Date.now()
 * impurity. Returns 0 when `trashedAt` is missing or the window has elapsed.
 * @param {string|null|undefined} trashedAt ISO timestamp the record was trashed.
 * @param {number} now epoch ms (defaults to Date.now()).
 */
export function daysUntilPurge(trashedAt, now = Date.now()) {
  if (!trashedAt) return 0;
  const elapsedDays = Math.floor((now - new Date(trashedAt).getTime()) / MS_PER_DAY);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}
```

**Circular imports — handled by Task 4's file choice.** `dateHelpers.js` imports `TRASH_RETENTION_DAYS` from `src/constants/trash.js` (a dependency-free module), NOT from `database.js`. This matters because `database.js` already imports `getTodayString` from `dateHelpers.js`; importing the constant from `database.js` would form a `dateHelpers → database → dateHelpers` cycle. Importing from `constants/trash.js` keeps the graph acyclic (`dateHelpers → constants/trash`, `database → constants/trash`). Do not "simplify" by importing from `database.js`.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/trashRetention.test.js
```
Expected: PASS (all 5 cases).

- [ ] **Step 5: Full suite + build + lint**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add tests/trashRetention.test.js src/utils/dateHelpers.js
git commit -m "feat(dateHelpers): add tested daysUntilPurge helper

Pure helper (now passed in) computing days left before a trashed record is
purged, using the shared TRASH_RETENTION_DAYS. Replaces inline magic-number
math in NotesPage and PracticeItemList (next commit) and removes the need for
the react-hooks/purity eslint-disable there.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Use `daysUntilPurge` in NotesPage and PracticeItemList

**Why:** Replace the two inline countdowns with the tested helper; drop the now-unnecessary `eslint-disable react-hooks/purity` in NotesPage.

**Files:**
- Modify: `src/components/NotesPage.jsx`
- Modify: `src/components/PracticeItemList.jsx`

- [ ] **Step 1: Locate both call sites**

Run:
```bash
grep -n "daysLeft" src/components/NotesPage.jsx src/components/PracticeItemList.jsx
grep -n "react-hooks/purity" src/components/NotesPage.jsx
```
Expected: one `daysLeft` assignment in each file; one `react-hooks/purity` disable in NotesPage.

- [ ] **Step 2: Update the import in `NotesPage.jsx`**

NotesPage currently imports from `../services/database` and `../contexts/LanguageContext` but not from `dateHelpers`. Add:
```js
import { daysUntilPurge } from '../utils/dateHelpers';
```

- [ ] **Step 3: Replace the NotesPage countdown**

Find (the hoisted `now` + inline math):
```js
              {trashedNotes.map((note) => {
                const now = Date.now(); // eslint-disable-line react-hooks/purity -- live "days until purge" countdown
                const daysLeft = note.trashedAt
                  ? Math.max(0, 30 - Math.floor((now - new Date(note.trashedAt).getTime()) / (1000 * 60 * 60 * 24)))
                  : 0;
```
Replace with:
```js
              {trashedNotes.map((note) => {
                const daysLeft = daysUntilPurge(note.trashedAt);
```
(The `daysUntilPurge` default `now = Date.now()` is fine here; the eslint-disable is no longer needed because the impurity now lives in the helper, not in render.)

- [ ] **Step 4: Update the import in `PracticeItemList.jsx`**

Add to the existing imports:
```js
import { daysUntilPurge } from '../utils/dateHelpers';
```
(Check whether PracticeItemList already imports anything from `dateHelpers`; if so, add `daysUntilPurge` to that existing import instead of duplicating.)

- [ ] **Step 5: Replace the PracticeItemList countdown — pass the existing `now`**

PracticeItemList holds a frozen-at-mount timestamp: `const [now] = useState(Date.now)` (near the top, ~line 119), used ONLY in this countdown. Pass it into the helper to (a) preserve the exact frozen-at-mount behavior and (b) keep `now` referenced so it does not become an unused-var lint error.

Find:
```js
                {trashedItems.map((item) => {
                  const daysLeft = item.trashedAt
                    ? Math.max(0, 30 - Math.floor((now - new Date(item.trashedAt).getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;
```
Replace with:
```js
                {trashedItems.map((item) => {
                  const daysLeft = daysUntilPurge(item.trashedAt, now);
```

After this edit, confirm `now` is still referenced (so the `const [now] = useState(Date.now)` line stays valid):
```bash
grep -n "\bnow\b" src/components/PracticeItemList.jsx
```
Expected: the `useState(Date.now)` declaration AND the `daysUntilPurge(item.trashedAt, now)` call. If `now` shows only the declaration, it is now unused — in that case also delete the `const [now] = useState(Date.now);` line and its `useState` stays imported (used elsewhere).

- [ ] **Step 6: Confirm the magic numbers and the suppression are gone**

Run:
```bash
grep -n "1000 \* 60 \* 60 \* 24" src/components/NotesPage.jsx src/components/PracticeItemList.jsx   # expect no output
grep -n "react-hooks/purity" src/components/NotesPage.jsx   # expect no output
```
Expected: both empty.

- [ ] **Step 7: Lint, build, test**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all green.

- [ ] **Step 8: Manual smoke**

`npm run dev` → trash a note and a practice item → open each "Trash" section → confirm the "X days left" text shows 30 (or the correct remaining count). Restore both.

- [ ] **Step 9: Commit**

```bash
git add src/components/NotesPage.jsx src/components/PracticeItemList.jsx
git commit -m "refactor: use daysUntilPurge helper in trash countdowns

Replaces duplicated inline magic-number math in NotesPage and PracticeItemList
with the shared tested helper, and drops the now-unnecessary
react-hooks/purity eslint-disable in NotesPage.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## TIER C — Robustness (your-call hardening)

### Task 7: Add `.catch` to two unguarded promise chains

**Why:** Two `.then()` chains have no `.catch`, inconsistent with the codebase's usual await-in-try/catch style. On rejection they produce a silent unhandled rejection and leave UI stale:
- `src/App.jsx`: `addLog(itemId, duration, { loggedAt }).then(() => loadData())` — a failed write never refreshes and is swallowed.
- `src/components/NotesPage.jsx`: `getTrashedNotes().then(setTrashedNotes)` — a failed read silently keeps stale trash.

Both are low-probability (IndexedDB rarely rejects), so this is defensive consistency, not a known bug.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/NotesPage.jsx`

- [ ] **Step 1: Locate both chains**

Run:
```bash
grep -n "addLog(itemId, duration" src/App.jsx
grep -n "getTrashedNotes().then" src/components/NotesPage.jsx
```
Expected: one hit each.

- [ ] **Step 2: Guard the App.jsx chain**

Find:
```js
          addLog(itemId, duration, { loggedAt }).then(() => loadData());
```
Replace with:
```js
          addLog(itemId, duration, { loggedAt })
            .then(() => loadData())
            .catch((err) => console.error('addLog failed:', err));
```

- [ ] **Step 3: Guard the NotesPage chain**

Find:
```js
    getTrashedNotes().then(setTrashedNotes);
```
Replace with:
```js
    getTrashedNotes()
      .then(setTrashedNotes)
      .catch((err) => console.error('getTrashedNotes failed:', err));
```

- [ ] **Step 4: Lint, build, test**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/NotesPage.jsx
git commit -m "fix: add .catch to two unguarded promise chains

addLog().then(loadData) and getTrashedNotes().then(setTrashedNotes) had no
rejection handler, producing silent unhandled rejections and stale UI on
failure. Add console.error catches to match the codebase's error-handling
convention.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## TIER B (large, OPTIONAL) — Report breakdown extraction

### Task 8: Extract the shared report "breakdown" pipeline

**Why:** `DailyReport`, `WeeklyReport`, `MonthlyReport`, and `YearlyReport` each repeat the same pipeline: accumulate per-item totals from logs → map to `{id, name, category, duration}` → `filter(duration > 0)` → `sort` by duration desc → split into `fundamentals`/`songs` → derive `grandTotal`. Extracting one tested helper removes ~12 duplicated lines × 4.

**This task is OPTIONAL and the riskiest in the plan** (touches 4 report files, each with subtle variation). Do it only if the user opted in. There are known per-file differences to preserve:
- `DailyReport` clamps duration with `Math.max(0, itemTotals[item.id] || 0)`; the others use `itemTotals[item.id] || 0`. The helper must clamp (clamping a non-negative value is a no-op, so this is safe for all four).
- Each report builds `itemTotals` from a different log array (`reportLogs`, `weekLogs`/`activeLogs`, `monthLogs`/`activeLogs`, `yearLogs`/`activeLogs`). The helper takes the already-filtered logs + items as inputs and does NOT do the active/trashed filtering — that stays in each component.

**Files:**
- Create: `tests/reportBreakdown.test.js`
- Modify: `src/utils/practiceStats.js` (add helper here — it is the existing stats util) OR create `src/utils/reportBreakdown.js`. Default: add to `practiceStats.js`.
- Modify: `src/components/DailyReport.jsx`, `WeeklyReport.jsx`, `MonthlyReport.jsx`, `YearlyReport.jsx`

- [ ] **Step 1: Read all four current breakdown blocks verbatim**

Run:
```bash
for f in Daily Weekly Monthly Yearly; do
  echo "===== ${f}Report ====="
  grep -n "itemTotals\|const breakdown\|const fundamentals\|const songs\|const grandTotal" "src/components/${f}Report.jsx"
done
```
Read each block fully (use the Read tool on the reported line ranges). Confirm the shape matches the description above before proceeding. If any report diverges in a way the helper below would not capture, STOP and report — do not force-fit.

- [ ] **Step 2: Write the failing test**

Create `tests/reportBreakdown.test.js`. The `fake-indexeddb/auto` import is REQUIRED — `practiceStats.js` imports `getLogsByDateRange` from `database.js`, which instantiates Dexie at module load:
```js
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildBreakdown } from '../src/utils/practiceStats';

const items = [
  { id: 1, name: 'Singles', category: 'fundamentals' },
  { id: 2, name: 'Song A',  category: 'songs' },
  { id: 3, name: 'Paradiddle', category: 'fundamentals' },
  { id: 4, name: 'Legacy', category: undefined }, // legacy item w/o category
];
const logs = [
  { itemId: 1, duration: 600 },
  { itemId: 1, duration: 300 },  // Singles total 900
  { itemId: 2, duration: 1200 }, // Song A total 1200
  { itemId: 3, duration: 0 },    // dropped (0 duration)
  { itemId: 4, duration: 120 },  // Legacy total 120 -> treated as fundamentals
];

describe('buildBreakdown', () => {
  it('totals per item, drops zero-duration, sorts by duration desc', () => {
    const { breakdown } = buildBreakdown(items, logs);
    expect(breakdown.map((e) => [e.name, e.duration])).toEqual([
      ['Song A', 1200],
      ['Singles', 900],
      ['Legacy', 120],
    ]);
  });

  it('splits fundamentals (incl. missing category) and songs', () => {
    const { fundamentals, songs } = buildBreakdown(items, logs);
    expect(fundamentals.map((e) => e.name)).toEqual(['Singles', 'Legacy']);
    expect(songs.map((e) => e.name)).toEqual(['Song A']);
  });

  it('derives grandTotal from the breakdown only', () => {
    const { grandTotal } = buildBreakdown(items, logs);
    expect(grandTotal).toBe(2220); // 1200 + 900 + 120
  });

  it('clamps negative item totals to zero', () => {
    const { grandTotal } = buildBreakdown(
      [{ id: 1, name: 'X', category: 'songs' }],
      [{ itemId: 1, duration: -50 }],
    );
    expect(grandTotal).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
npx vitest run tests/reportBreakdown.test.js
```
Expected: FAIL (`buildBreakdown is not a function`).

- [ ] **Step 4: Implement the helper in `src/utils/practiceStats.js`**

Add:
```js
/**
 * Build the per-item practice breakdown shared by all four report tabs.
 * Pure. Caller passes the already-filtered logs (active/non-trashed) and the
 * item list. Returns sorted breakdown + fundamentals/songs split + grandTotal.
 * grandTotal is derived from breakdown so trashed items' logs cannot inflate it.
 *
 * @param {Array<{id:number,name:string,category?:string}>} items
 * @param {Array<{itemId:number,duration:number}>} logs
 */
export function buildBreakdown(items, logs) {
  const itemTotals = {};
  for (const log of logs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      duration: Math.max(0, itemTotals[item.id] || 0),
    }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');
  const grandTotal = breakdown.reduce((sum, e) => sum + e.duration, 0);

  return { breakdown, fundamentals, songs, grandTotal };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/reportBreakdown.test.js
```
Expected: PASS (all 4 cases).

- [ ] **Step 6: Refactor DailyReport to use the helper**

In `src/components/DailyReport.jsx`, add to imports:
```js
import { buildBreakdown } from '../utils/practiceStats';
```
Replace the block that builds `itemTotals`, `breakdown`, `fundamentals`, `songs`, and `grandTotal` with:
```js
  const { breakdown, fundamentals, songs, grandTotal } = buildBreakdown(items, reportLogs);
```
(Use the SAME log variable the file currently feeds into `itemTotals` — for DailyReport that is `reportLogs`. Keep everything downstream, including `itemIdsWithLogs`/`availableItems`, unchanged.)

- [ ] **Step 7: Run the daily-report test + build**

Run:
```bash
npx vitest run tests/practicePage.test.js
npm run build
```
Expected: pass / build OK. Then manually open the Daily report (`npm run dev`) and confirm totals and the fundamentals/songs split match what they showed before.

- [ ] **Step 8: Repeat the refactor for Weekly, Monthly, Yearly — one commit-free edit each, verifying build between**

For each of `WeeklyReport.jsx`, `MonthlyReport.jsx`, `YearlyReport.jsx`:
  1. Add the `buildBreakdown` import.
  2. Replace its `itemTotals`+`breakdown`+`fundamentals`+`songs`+`grandTotal` block with:
     ```js
     const { breakdown, fundamentals, songs, grandTotal } = buildBreakdown(items, <thatFilesLogVar>);
     ```
     where `<thatFilesLogVar>` is the active-filtered log array that file already computed (`activeLogs` in Weekly/Monthly/Yearly — confirm via the Step 1 grep).
  3. Run `npm run build` after each file.

Note: the secondary `.reduce((s, e) => s + e.duration, 0)` calls used for the per-section footer totals in the JSX may remain — they operate on the returned `fundamentals`/`songs`. Do not remove them unless replacing with a clearer local; keeping them is fine.

- [ ] **Step 9: Full verification**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all green.

- [ ] **Step 10: Manual cross-check of all four reports**

`npm run dev` → with some practice logs present, open Daily / Weekly / Monthly / Yearly. Confirm each shows the same grand total and fundamentals/songs breakdown as before the refactor. Toggle time unit (M/H) to confirm formatting unaffected.

- [ ] **Step 11: Commit**

```bash
git add src/utils/practiceStats.js tests/reportBreakdown.test.js src/components/DailyReport.jsx src/components/WeeklyReport.jsx src/components/MonthlyReport.jsx src/components/YearlyReport.jsx
git commit -m "refactor(reports): extract shared buildBreakdown helper

Daily/Weekly/Monthly/Yearly reports duplicated the per-item totals ->
filter(>0) -> sort -> fundamentals/songs split -> grandTotal pipeline.
Extracted to a tested pure helper in practiceStats. Each report still does its
own active/trashed log filtering and feeds the result in. Behavior-neutral
(grandTotal still derived from breakdown so trashed logs can't inflate it).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## TIER D — Documentation

### Task 9: Document the new shared helpers in CLAUDE.md

**Why:** CLAUDE.md is the project's load-bearing context file. New shared primitives (`TRASH_RETENTION_DAYS`, `daysUntilPurge`, `buildBreakdown`) should be discoverable so future work reuses them instead of re-inlining.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add to the "Date Math Helpers" section**

Under the `dateHelpers.js` bullet, add a line:
```markdown
- `daysUntilPurge(trashedAt, now?)` — whole days before a soft-deleted record is hard-purged, using `TRASH_RETENTION_DAYS` (from [src/constants/trash.js](src/constants/trash.js)). Pure (pass `now` for testability). Used by NotesPage and PracticeItemList trash countdowns.
```

- [ ] **Step 2: Add a note about the trash constant in the Database section**

Near the `purgeExpiredTrash` description, add:
```markdown
The 30-day window is `TRASH_RETENTION_DAYS` in [src/constants/trash.js](src/constants/trash.js) (a dependency-free module to avoid a dateHelpers↔database cycle); the UI countdown (`daysUntilPurge`) and the purge share it so they cannot drift.
```

- [ ] **Step 3: (Only if Task 8 was done) Document `buildBreakdown`**

Add to the relevant reports/utility section:
```markdown
- `buildBreakdown(items, logs)` in [practiceStats.js](src/utils/practiceStats.js) — shared per-item report pipeline (totals → drop zeros → sort desc → fundamentals/songs split → grandTotal). All four report tabs use it; each does its own active/trashed log filtering first.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document daysUntilPurge, TRASH_RETENTION_DAYS, buildBreakdown

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final verification (after all chosen tasks)

- [ ] `npm run lint` exits 0
- [ ] `npm run build` succeeds
- [ ] `npm test` — all pass (baseline 117 + new tests: 3 from Task 2, 5 from Task 5, 4 from Task 8 if done)
- [ ] `git log --oneline` shows one focused commit per task
- [ ] Manual: metronome plays; trash countdowns render; all four reports show unchanged totals

---

## Notes on items intentionally NOT in this plan

- **AuthContext / firebaseBackend / database test coverage:** high value but high effort; `database.js` and `firebaseBackend.js` carry load-bearing sync-correctness comments and are intentionally manually verified. Out of scope here.
- **`EncouragementModal.jsx` `onClick` on a `div`:** it is only `stopPropagation` on the modal panel (standard backdrop-close pattern), not an interactive control — no real a11y defect. No change.
- **App.jsx size / hook extraction & bundle code-splitting:** these are the previously-discussed "Tier 4" architecture items; deliberately excluded from this quality-cleanup plan.
