# App.jsx Decomposition (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 2068-line `src/App.jsx` god component into focused custom hooks (`src/hooks/`) and per-tab components, leaving App.jsx a thin composition shell — with zero behavior change.

**Architecture:** Extract each concern into a custom hook or component. App.jsx calls the hooks in dependency order and threads shared callbacks (`loadData`, `handleStart`, `saveAndStop`, navigation handlers, `speakText`) between them. No global context/store is introduced; `user`/`language` are read from existing `useAuth()`/`useLanguage()` contexts inside hooks. Every extraction is a mechanical relocation — hook bodies must diff against the original App.jsx code.

**Tech Stack:** React 19 (hooks), Vite 7, Vitest + @testing-library/react (`renderHook`), Dexie, Firebase.

**Spec:** [docs/superpowers/specs/2026-06-01-app-jsx-decomposition-design.md](../specs/2026-06-01-app-jsx-decomposition-design.md)

---

## Extraction Convention (read first)

This is a **behavior-preserving move**, not a rewrite. For each extraction task:

1. **Create the hook file** with the exact signature given in the task. Move the
   named state/refs/effects/handlers out of App.jsx into the hook body
   **verbatim** (same code, same dependency arrays, same comments — the
   load-bearing sync comments must survive unchanged). The task lists the source
   symbols and line ranges; line numbers are approximate (they shift as earlier
   tasks land — locate by symbol name).
2. **Delete** those symbols from App.jsx.
3. **Wire** the hook into App.jsx using the wiring snippet, threading the listed
   inputs and destructuring the listed outputs.
4. **Green gate:** run `npm run build`, `npm run lint`, `npm run test`. All must
   pass before commit. The app must remain fully functional after every task.
5. **Commit.**

Because the app stays green after every task, tasks can be reviewed and merged
independently. Do **not** batch multiple hook extractions into one commit.

**Do not re-type moved bodies in this plan** — they already exist in App.jsx.
The plan gives you the interface and the wiring; the body is whatever currently
implements that symbol.

A note on cross-hook cycles (resolved in Tasks 9–11): `speakText` (from
`useTts`) is consumed by `useLlmEncouragement` and `useVoiceControl`, so
`useTts` is created first and is intentionally dependency-free on
`aiCoachEnabled`/`handsFreeMode`. The lone "auto-disable Kokoro" effect that
reads those two flags is relocated to App.jsx as a small coordination effect
(Task 11), not into `useTts`.

---

## Task 1: `useUiPreferences`

**Files:**
- Create: `src/hooks/useUiPreferences.js`
- Create: `tests/useUiPreferences.test.js`
- Modify: `src/App.jsx`

**Move from App.jsx:** `timeUnit` state (~93–96), `groupByCategory` (~97–100),
`compactMode` (~101–103), `theme` state (~104), `setTheme` callback
(~1526–1529), and the three persistence effects for `timeUnit` (~281–283),
`groupByCategory` (~285–287), `compactMode` (~289–291). Imports used:
`getItem`/`setItem` from `./utils/safeStorage`, `getTheme`/`setTheme as
setThemeService` from `./services/themeService`.

**Hook signature:**
```js
// src/hooks/useUiPreferences.js
export function useUiPreferences() {
  // ...moved state + persistence effects + setTheme...
  return {
    timeUnit, setTimeUnit,
    groupByCategory, setGroupByCategory,
    compactMode, setCompactMode,
    theme, setTheme,
  };
}
```

- [ ] **Step 1: Write the failing test**

```js
// tests/useUiPreferences.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiPreferences } from '../src/hooks/useUiPreferences';

describe('useUiPreferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults: minutes, grouped, not compact', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.timeUnit).toBe('minutes');
    expect(result.current.groupByCategory).toBe(true);
    expect(result.current.compactMode).toBe(false);
  });

  it('persists timeUnit to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => result.current.setTimeUnit('hours'));
    expect(localStorage.getItem('drummate_time_unit')).toBe('hours');
  });

  it('hydrates groupByCategory=false from storage', () => {
    localStorage.setItem('drummate_group_by_category', 'false');
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.groupByCategory).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/useUiPreferences.test.js`
Expected: FAIL — cannot resolve `../src/hooks/useUiPreferences`.

- [ ] **Step 3: Create the hook** by moving the symbols listed above into `src/hooks/useUiPreferences.js` with the signature shown.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/useUiPreferences.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into App.jsx** — delete the moved symbols, add near the top of `App()`:

```js
const {
  timeUnit, setTimeUnit,
  groupByCategory, setGroupByCategory,
  compactMode, setCompactMode,
  theme, setTheme,
} = useUiPreferences();
```
Add `import { useUiPreferences } from './hooks/useUiPreferences';`. Leave all JSX/usages referencing these names unchanged.

- [ ] **Step 6: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: build succeeds, lint clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useUiPreferences.js tests/useUiPreferences.test.js src/App.jsx
git commit -m "refactor(app): extract useUiPreferences hook"
```

---

## Task 2: `useMetronomeState`

**Files:**
- Create: `src/hooks/useMetronomeState.js`
- Create: `tests/useMetronomeState.test.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- Refs: `noSleepRef` (~118), `metronomeEngineRef` (~119).
- Metronome state: `metronomeBpm` (~120–124), `metronomeIsPlaying` (~125),
  `metronomeCurrentBeat` (~126), `metronomeTimeSignature` (~127–141),
  `metronomeSubdivision` (~142–146), `metronomeSoundType` (~147–151),
  `metronomeAccentFirstBeat` (~153–156).
- Sequencer state: `sequencerBpm` (~170–174), `sequencerSoundType` (~175–179),
  `sequencerSlots` (~180–188), `sequencerPlayingSlot` (~189),
  `sequencerNextIdRef` init block (~222–226).
- Multi-meter state: `multiMeterBpm` (~229–233), `multiMeterSoundType`
  (~234–238), `multiMeterSlots` (~239–247), `multiMeterPlayingSlot` (~248).
- Persistence effects: metronome (~251–269), multi-meter (~271–279), sequencer
  (~294–305).
- Engine-init effect (~553–573) — creates `new MetronomeEngine()`, sets
  `onBeat`/`onSequenceBeat`/`onMeterSlot`, destroys on unmount.
- Imports used: `NoSleep`, `MetronomeEngine`, `SUBDIVISIONS`, `getItem`/`setItem`.

**Hook signature:**
```js
export function useMetronomeState() {
  // ...all moved state, refs, persistence effects, engine-init effect...
  return {
    engineRef, noSleepRef,
    bpm: metronomeBpm, setBpm: setMetronomeBpm,
    isPlaying: metronomeIsPlaying, setIsPlaying: setMetronomeIsPlaying,
    currentBeat: metronomeCurrentBeat, setCurrentBeat: setMetronomeCurrentBeat,
    timeSignature: metronomeTimeSignature, setTimeSignature: setMetronomeTimeSignature,
    subdivision: metronomeSubdivision, setSubdivision: setMetronomeSubdivision,
    soundType: metronomeSoundType, setSoundType: setMetronomeSoundType,
    accentFirstBeat: metronomeAccentFirstBeat, setAccentFirstBeat: setMetronomeAccentFirstBeat,
    sequencerBpm, setSequencerBpm, sequencerSoundType, setSequencerSoundType,
    sequencerSlots, setSequencerSlots, sequencerPlayingSlot, setSequencerPlayingSlot,
    sequencerNextIdRef,
    multiMeterBpm, setMultiMeterBpm, multiMeterSoundType, setMultiMeterSoundType,
    multiMeterSlots, setMultiMeterSlots, multiMeterPlayingSlot, setMultiMeterPlayingSlot,
  };
}
```

> Note: the engine-init effect's `onBeat`/`onSequenceBeat`/`onMeterSlot` set
> `metronomeCurrentBeat`, `sequencerPlayingSlot`, `multiMeterPlayingSlot` —
> all now internal to this hook, so the effect moves intact with no rewiring.

- [ ] **Step 1: Write the failing test**

```js
// tests/useMetronomeState.test.js
import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/audio/metronomeEngine', () => ({
  MetronomeEngine: class { destroy() {} },
}));
vi.mock('nosleep.js', () => ({ default: class { enable() {} disable() {} } }));

import { useMetronomeState } from '../src/hooks/useMetronomeState';

describe('useMetronomeState', () => {
  beforeEach(() => localStorage.clear());

  it('defaults bpm to 120 and time signature to [4,4]', () => {
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.bpm).toBe(120);
    expect(result.current.timeSignature).toEqual([4, 4]);
  });

  it('clamps out-of-range stored bpm to 120', () => {
    localStorage.setItem('drummate_metronome_bpm', '9999');
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.bpm).toBe(120);
  });

  it('rejects malformed stored time signature', () => {
    localStorage.setItem('drummate_metronome_time_signature', 'not-json');
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.timeSignature).toEqual([4, 4]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/useMetronomeState.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook** by moving the symbols listed above into `src/hooks/useMetronomeState.js`.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/useMetronomeState.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into App.jsx** — delete moved symbols, add:

```js
const metronome = useMetronomeState();
```
Then replace every prior reference. Because many symbols are renamed under the
`metronome` object (e.g. `metronomeBpm` → `metronome.bpm`), do a careful
find/replace. The JSX `<Metronome>`, `<SequencerPage>`, `<MultiMeterPage>` props
(~1753–1831) now read from `metronome.*`. Keep the engine-init effect inside the
hook (already moved). Remove now-unused imports (`NoSleep`, `MetronomeEngine`,
`SUBDIVISIONS`) from App.jsx.

- [ ] **Step 6: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass. Manually confirm metronome/sequencer/multi-meter still play (defer to final manual checklist).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useMetronomeState.js tests/useMetronomeState.test.js src/App.jsx
git commit -m "refactor(app): extract useMetronomeState hook"
```

---

## Task 3: `useAppData`

**Files:**
- Create: `src/hooks/useAppData.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State: `items` (~74), `totals` (~75), `metronomePractices` (~161),
  `notes` (~307), `goalRefreshKey` (~311).
- `refreshNotes` callback (~308–310).
- `loadData` callback (~331–347).
- The `useEffect(() => { loadData(); }, [loadData])` mount effect (~349–351).
- The purge-expired-trash effect (~353–369).
- The day-change refresh effect (~371–398).
- Imports used: `getItems`, `getTodaysLogs`, `getPractices`, `getAllNotes`,
  `purgeExpiredTrash` from `./services/database`; `firebaseBackend`;
  `getTodayString`; `useAuth` (for `user` in purge effect).

**Hook signature:**
```js
export function useAppData() {
  const { user } = useAuth();
  // ...moved state + loadData + refreshNotes + 3 effects...
  return {
    items, setItems,
    totals, setTotals,
    metronomePractices, setMetronomePractices,
    notes, setNotes,
    goalRefreshKey,
    loadData, refreshNotes,
  };
}
```

> `setItems`/`setTotals`/`setMetronomePractices`/`setNotes` are returned because
> the sign-out and visitor-logoff reset effects (Task 12) clear them.

- [ ] **Step 1: Create the hook** by moving the symbols above into `src/hooks/useAppData.js`.

- [ ] **Step 2: Wire into App.jsx** — delete moved symbols, add:

```js
const {
  items, setItems, totals, setTotals,
  metronomePractices, setMetronomePractices,
  notes, setNotes, goalRefreshKey, loadData, refreshNotes,
} = useAppData();
```
Remove now-unused imports from App.jsx (`getItems`, `getTodaysLogs`, `getPractices`, `purgeExpiredTrash` — keep `getAllNotes` only if still referenced elsewhere; it is not, so remove it too).

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppData.js src/App.jsx
git commit -m "refactor(app): extract useAppData hook"
```

---

## Task 4: `usePracticeTimer`

**Files:**
- Create: `src/hooks/usePracticeTimer.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State/refs: `activeItemId` (~77), `focusedPracticeItemId` (~78),
  `elapsedTime` (~79), `editing` (~76), `intervalRef` (~80), `startTimeRef`
  (~81), `activeItemIdRef` (~82).
- Effects: keep-`activeItemIdRef`-in-sync (~576–578), pending-log recovery
  (~581–601), save-session-on-pagehide (~604–631).
- Callbacks: `stopTimer` (~633–637), `saveAndStop` (~639–667), `handleStart`
  (~669–708), `handleStop` (~710–712), `handleSetEditing` (~954–962).
- Imports used: `addLog`, `db` from `./services/database`; `firebaseBackend`;
  `getItem`/`setItem`/`removeItem`; `useAuth` for `user`.

**Hook signature:**
```js
export function usePracticeTimer({ loadData, metronome }) {
  const { user } = useAuth();
  // metronome provides: bpm, timeSignature, subdivision, soundType,
  //   setBpm, setTimeSignature, setSubdivision, setSoundType,
  //   isPlaying, setIsPlaying, engineRef
  // ...moved state/refs/effects/callbacks...
  return {
    activeItemId, setActiveItemId,
    elapsedTime, setElapsedTime,
    focusedPracticeItemId, setFocusedPracticeItemId,
    editing,
    stopTimer, saveAndStop, handleStart, handleStop, handleSetEditing,
  };
}
```

> In the moved bodies, references to `metronomeBpm` etc. become `metronome.bpm`;
> `metronomeEngineRef` → `metronome.engineRef`; `metronomeIsPlaying` →
> `metronome.isPlaying`; `setMetronomeIsPlaying` → `metronome.setIsPlaying`;
> `setMetronomeBpm` → `metronome.setBpm`, etc. These are the only edits to the
> moved code — pure rename, no logic change.

- [ ] **Step 1: Create the hook** with the signature above; move symbols and apply the `metronome.*` renames inside the moved bodies.

- [ ] **Step 2: Wire into App.jsx** — delete moved symbols, add (after `useAppData` and `useMetronomeState`):

```js
const timer = usePracticeTimer({ loadData, metronome });
const {
  activeItemId, setActiveItemId, elapsedTime,
  focusedPracticeItemId, setFocusedPracticeItemId,
  editing, stopTimer, saveAndStop, handleStart, handleStop, handleSetEditing,
} = timer;
```

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass (note: `tests/practicePage.test.js` exercises timer behavior — must stay green).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePracticeTimer.js src/App.jsx
git commit -m "refactor(app): extract usePracticeTimer hook"
```

---

## Task 5: `usePracticeItems`

**Files:**
- Create: `src/hooks/usePracticeItems.js`
- Modify: `src/App.jsx`

**Move from App.jsx:** `handleAddItem` (~714–730), `handleRenameItem`
(~732–742), `handleDeleteItem` (~744–759), `handleRestoreItem` (~761–771),
`handlePermanentDelete` (~773–788), `handleArchiveItem` (~790–805),
`handleSetItemCategory` (~896–906), `handleMergeItem` (~908–926), `handleReorder`
(~928–952). Imports used: `addItem`, `renameItem`, `trashItem`, `restoreItem`,
`deleteItem`, `archiveItem`, `setItemCategory`, `mergeItem`, `db`;
`firebaseBackend`; `useLanguage` for `t` (used by `handleAddItem`'s duplicate
alert); `useAuth` for `user`.

**Hook signature:**
```js
export function usePracticeItems({ items, loadData, activeItemId, clearActiveTimer }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  // clearActiveTimer(id): if id === activeItemId, stop+clear the running timer.
  // ...moved handlers; the three handlers that currently inline
  //   "if (activeItemId === id) { stopTimer(); setActiveItemId(null);
  //    setElapsedTime(0); }" (delete/permanentDelete/archive) call
  //   clearActiveTimer(id) instead.
  return {
    handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
    handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
    handleMergeItem, handleReorder,
  };
}
```

> The timer-clearing snippet inside `handleDeleteItem`/`handlePermanentDelete`/
> `handleArchiveItem` references `stopTimer`/`setActiveItemId`/`setElapsedTime`,
> which now live in `usePracticeTimer`. Rather than thread three setters, expose
> one helper from the timer hook. **Add to `usePracticeTimer`'s return:**
> ```js
> const clearActiveTimer = useCallback((id) => {
>   if (activeItemId === id) {
>     stopTimer();
>     setActiveItemId(null);
>     setElapsedTime(0);
>   }
> }, [activeItemId, stopTimer]);
> ```
> This is the exact inlined logic, extracted once — behavior identical.

- [ ] **Step 1: Update `usePracticeTimer`** to define and return `clearActiveTimer` (code above).

- [ ] **Step 2: Create `usePracticeItems`** with the signature above; in the three destructive handlers replace the inlined clear-snippet with `clearActiveTimer(id);`.

- [ ] **Step 3: Wire into App.jsx**:

```js
const {
  handleAddItem, handleRenameItem, handleDeleteItem, handleRestoreItem,
  handlePermanentDelete, handleArchiveItem, handleSetItemCategory,
  handleMergeItem, handleReorder,
} = usePracticeItems({ items, loadData, activeItemId, clearActiveTimer: timer.clearActiveTimer });
```
Remove now-unused item-db imports from App.jsx.

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePracticeItems.js src/hooks/usePracticeTimer.js src/App.jsx
git commit -m "refactor(app): extract usePracticeItems hook"
```

---

## Task 6: `useMetronomePractices`

**Files:**
- Create: `src/hooks/useMetronomePractices.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- Run-view state: `runningPracticeUid` (~162), `practiceRunStepIndex` (~164),
  `practiceRunBarIndex` (~165), `practiceRunIsPlaying` (~166),
  `practiceRunComplete` (~167).
- Handlers: `handleAddPractice` (~807–816), `handleUpdatePractice` (~818–828),
  `handleDeletePractice` (~830–846), `handleReorderPractices` (~848–858),
  `handleStartPractice` (~860–874), `handleEndPractice` (~876–894).
- Imports used: `addPractice as dbAddPractice`, `updatePractice as
  dbUpdatePractice`, `deletePractice as dbDeletePractice`, `updatePracticeOrder`,
  `getPractices`; `firebaseBackend`; `useAuth` for `user`.

**Hook signature:**
```js
export function useMetronomePractices({
  metronomePractices, items, loadData, handleStart, saveAndStop, activeItemId,
}) {
  const { user } = useAuth();
  // ...moved run-view state + handlers...
  return {
    runningPracticeUid, setRunningPracticeUid,
    practiceRunStepIndex, setPracticeRunStepIndex,
    practiceRunBarIndex, setPracticeRunBarIndex,
    practiceRunIsPlaying, setPracticeRunIsPlaying,
    practiceRunComplete, setPracticeRunComplete,
    handleAddPractice, handleUpdatePractice, handleDeletePractice,
    handleReorderPractices, handleStartPractice, handleEndPractice,
  };
}
```

- [ ] **Step 1: Create the hook** by moving the symbols above.

- [ ] **Step 2: Wire into App.jsx**:

```js
const practices = useMetronomePractices({
  metronomePractices, items, loadData, handleStart, saveAndStop, activeItemId,
});
```
Destructure the run-view state/handlers used by the `<PracticePage>` JSX from `practices`. Remove now-unused practice-db imports from App.jsx.

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMetronomePractices.js src/App.jsx
git commit -m "refactor(app): extract useMetronomePractices hook"
```

---

## Task 7: `useReports`

**Files:**
- Create: `src/hooks/useReports.js`
- Create: `tests/useReports.test.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State: `reportDate` (~105), `reportLogs` (~106), `weekStart`/`weekLogs`
  (~110–111), `monthStart`/`monthLogs` (~112,115), `yearStart`/`yearLogs`
  (~113–114), `editTimeModal` (~221).
- Loaders: `loadReportData` (~964–967), `loadWeekData` (~969–973),
  `loadMonthData` (~975–979), `loadYearData` (~981–985).
- Handlers: `handleReportDateChange` (~987–993), `handleManualTimeAdjust`
  (~995–1008), `handleMergeToYesterday` (~1014–1031), `handleEditTime`
  (~1010–1012), `handleAddTime` (~1033–1038), `handleDayClick` (~1040–1047),
  `handleWeekChange` (~1049–1052), `handleMonthChange` (~1054–1057),
  `handleYearChange` (~1059–1062).
- Imports used: `getLogsByDate`, `getLogsByDateRange`, `addAdjustmentLog`,
  `reattributeLogsToDate`, `db`; `firebaseBackend`; `getWeekEnd`, `getMonthEnd`,
  `getYearEnd`, `getWeekStart`, `getMonthStart`, `getYearStart`,
  `getTodayString`, `shiftDate`; `useAuth` for `user`.

> `handleDayClick` calls `setReportSubpage('daily')`. `reportSubpage` moves to
> `useNavigation` (Task 8). To avoid a forward dependency, `useReports` accepts
> an optional `onNavigateToDaily` callback and calls it instead of
> `setReportSubpage('daily')`. App.jsx passes
> `onNavigateToDaily: () => setReportSubpage('daily')` after Task 8 wires
> navigation. Until Task 8 lands, App.jsx still owns `reportSubpage`, so pass
> `onNavigateToDaily: () => setReportSubpage('daily')` from the start.

**Hook signature:**
```js
export function useReports({ loadData, onNavigateToDaily }) {
  const { user } = useAuth();
  // ...moved state + loaders + handlers; handleDayClick calls onNavigateToDaily()
  //    in place of setReportSubpage('daily')...
  return {
    reportDate, weekStart, weekLogs, monthStart, monthLogs, yearStart, yearLogs,
    reportLogs, editTimeModal, setEditTimeModal,
    loadReportData, loadWeekData, loadMonthData, loadYearData,
    handleReportDateChange, handleManualTimeAdjust, handleMergeToYesterday,
    handleEditTime, handleAddTime, handleDayClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    setReportDate, setWeekStart, setMonthStart, setYearStart,
  };
}
```

> `setReportDate`/`setWeekStart`/`setMonthStart`/`setYearStart` are returned
> because `handleTabChange` (Task 8) resets them to today on entering the report
> tab.

- [ ] **Step 1: Write the failing test**

```js
// tests/useReports.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getLogsByDate = vi.fn(async () => []);
const getLogsByDateRange = vi.fn(async () => []);
vi.mock('../src/services/database', () => ({
  getLogsByDate: (...a) => getLogsByDate(...a),
  getLogsByDateRange: (...a) => getLogsByDateRange(...a),
  addAdjustmentLog: vi.fn(),
  reattributeLogsToDate: vi.fn(),
  db: { practiceLogs: { get: vi.fn() } },
}));
vi.mock('../src/services/backends/firebaseBackend', () => ({ default: { pushLog: vi.fn() } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import { useReports } from '../src/hooks/useReports';

describe('useReports', () => {
  beforeEach(() => { getLogsByDate.mockClear(); });

  it('handleReportDateChange updates date and loads that day', async () => {
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToDaily: vi.fn() }));
    await act(async () => { await result.current.handleReportDateChange('2026-01-15'); });
    expect(result.current.reportDate).toBe('2026-01-15');
    expect(getLogsByDate).toHaveBeenCalledWith('2026-01-15');
  });

  it('handleDayClick fires onNavigateToDaily', async () => {
    const onNavigateToDaily = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToDaily }));
    await act(async () => { await result.current.handleDayClick('2026-01-10'); });
    expect(onNavigateToDaily).toHaveBeenCalled();
    expect(result.current.reportDate).toBe('2026-01-10');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/useReports.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook** by moving the symbols above; replace `setReportSubpage('daily')` inside `handleDayClick` with `onNavigateToDaily()`.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/useReports.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into App.jsx**:

```js
const reports = useReports({
  loadData,
  onNavigateToDaily: () => setReportSubpage('daily'),
});
```
Destructure the report state/handlers used by the report JSX + `EditTimeModal` from `reports`. (`reportSubpage`/`setReportSubpage` still live in App.jsx until Task 8.) Remove now-unused report-db/date imports from App.jsx.

- [ ] **Step 6: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReports.js tests/useReports.test.js src/App.jsx
git commit -m "refactor(app): extract useReports hook"
```

---

## Task 8: `useNavigation`

**Files:**
- Create: `src/hooks/useNavigation.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State + ref-mirrors: `activeTab`/`activeTabRef` (~89–90, mirror ~1520),
  `reportSubpage` (~107, ref ~84/1518), `metronomeSubpage` (~159, ref ~83/1517),
  `notesSubpage`/`notesSubpageRef` (~108–109, mirror ~1519),
  plus the report date/week/month/year ref-mirrors (`reportDateRef`,
  `weekStartRef`, `monthStartRef`, `yearStartRef` — ~84–88, mirrors ~1521–1524)
  **only if** they are used solely by navigation/keyboard. They are used by the
  keyboard handler (Task 13); move them to `useNavigation` and expose them so
  Task 13 can read them. `languageRef` (~91, mirror ~1516) is keyboard-only —
  leave it for Task 13.
- Handlers: `handleTabChange` (~1064–1085), `handleSubpageChange` (~1087–1120).
- Imports used: `getTodayString`, `getWeekStart`, `getMonthStart`,
  `getYearStart`.

**Hook signature:**
```js
export function useNavigation({ reports, metronome, practices }) {
  // reports: { loadReportData, loadWeekData, loadMonthData, loadYearData,
  //            setReportDate, setWeekStart, setMonthStart, setYearStart,
  //            reportDate, weekStart, monthStart, yearStart }
  // metronome: { engineRef, noSleepRef, isPlaying, setIsPlaying, setCurrentBeat,
  //              setSequencerPlayingSlot, setMultiMeterPlayingSlot }
  // practices: { runningPracticeUid, setRunningPracticeUid,
  //              setPracticeRunStepIndex, setPracticeRunBarIndex,
  //              setPracticeRunIsPlaying, setPracticeRunComplete }
  return {
    activeTab, setActiveTab, activeTabRef,
    metronomeSubpage, setMetronomeSubpage, metronomeSubpageRef,
    reportSubpage, setReportSubpage, reportSubpageRef,
    notesSubpage, setNotesSubpage, notesSubpageRef,
    reportDateRef, weekStartRef, monthStartRef, yearStartRef,
    handleTabChange, handleSubpageChange,
  };
}
```

> `handleTabChange` references `reports.loadReportData`/`setReportDate`/etc.
> `handleSubpageChange` references `metronome.engineRef`/`isPlaying`/setters,
> `metronome.noSleepRef`, and the `practices` run-view setters +
> `runningPracticeUid`. Apply those `reports.*`/`metronome.*`/`practices.*`
> renames inside the moved bodies — no logic change.
> The report date/week/month/year ref-mirror effects move here and now read
> `reports.reportDate`/`weekStart`/`monthStart`/`yearStart`.

- [ ] **Step 1: Create the hook** with the signature above; apply the dotted renames in the moved handler bodies and ref-mirror effects.

- [ ] **Step 2: Wire into App.jsx** (after `reports`, `metronome`, `practices`):

```js
const nav = useNavigation({ reports, metronome, practices });
const {
  activeTab, metronomeSubpage, reportSubpage, setReportSubpage,
  notesSubpage, setNotesSubpage, handleTabChange, handleSubpageChange,
} = nav;
```
Update the `useReports` call's `onNavigateToDaily` to `() => nav.setReportSubpage('daily')` **only if** ordering allows; since `nav` depends on `reports`, keep `onNavigateToDaily: () => setReportSubpage('daily')` impossible now (no local `setReportSubpage`). Resolve by giving `useReports` a settable ref: instead, pass `onNavigateToDaily` via a stable wrapper. **Concretely:** keep a `reportSubpageNavRef = useRef(() => {})` in App.jsx, pass `onNavigateToDaily: () => reportSubpageNavRef.current()` to `useReports`, and after `nav` is created set `reportSubpageNavRef.current = () => nav.setReportSubpage('daily')`. This breaks the reports↔nav cycle without changing behavior.

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass. Manually confirm Tab-key subpage cycling and tab switches (deferred to final checklist).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useNavigation.js src/App.jsx
git commit -m "refactor(app): extract useNavigation hook"
```

---

## Task 9: `useTts`

**Files:**
- Create: `src/hooks/useTts.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State/refs: `ttsServiceRef` (~202), `kokoroEnabled` (~203–205),
  `kokoroStatus` (~206), `kokoroProgress` (~207).
- Callbacks: `speakText` (~1122–1132), `stopSpeech` (~1134–1137),
  `loadKokoroTts` (~1139–1153), `handleToggleKokoro` (~1156–1167).
- The auto-load-on-mount effect (~1178–1189).
- **Do NOT move** the auto-disable effect (~1170–1175) — it reads
  `aiCoachEnabled`/`handsFreeMode` and stays in App.jsx (Task 11).
- Imports used: `speak`, `getLang`, `cancelSpeech` from `./services/voiceFeedback`;
  dynamic `import('./services/ttsService')`; `useLanguage` for `language`;
  `getItem`/`setItem`.

**Hook signature:**
```js
export function useTts() {
  const { language } = useLanguage();
  // ...moved state/refs/callbacks + auto-load effect...
  return {
    ttsServiceRef,
    kokoroEnabled, setKokoroEnabled,
    kokoroStatus, kokoroProgress,
    speakText, stopSpeech, loadKokoroTts, handleToggleKokoro,
  };
}
```

- [ ] **Step 1: Create the hook** by moving the listed symbols (leaving the auto-disable effect behind).

- [ ] **Step 2: Wire into App.jsx** (early, before llm/voice since they need `speakText`):

```js
const tts = useTts();
const { speakText, stopSpeech } = tts;
```
The auto-disable effect stays in App.jsx but now reads `tts.kokoroEnabled`/`tts.setKokoroEnabled` — update those references in place (it will be tidied in Task 11).

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTts.js src/App.jsx
git commit -m "refactor(app): extract useTts hook"
```

---

## Task 10: `useLlmEncouragement`

**Files:**
- Create: `src/hooks/useLlmEncouragement.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State/refs: `aiCoachEnabled` (~210–212), `llmServiceRef` (~215),
  `llmStatus` (~216), `llmProgress` (~217), `llmMessage` (~218), `llmError`
  (~219), `llmModalOpen` (~220).
- Callbacks: `generateEncouragement` (~1316–1332), `loadAndGenerate`
  (~1334–1359), `handleLlmDownload` (~1361–1363), `handleEncouragementPress`
  (~1365–1395).
- Imports used: dynamic `import('./services/llmService')`,
  `import('./utils/practiceStats')`; `getItem`/`setItem`; `useLanguage` for
  `language`.

**Hook signature:**
```js
export function useLlmEncouragement({ items, totals, activeItemId, elapsedTime, speakText }) {
  const { language } = useLanguage();
  // ...moved state/refs/callbacks...
  return {
    aiCoachEnabled, setAiCoachEnabled,
    llmStatus, llmProgress, llmMessage, llmError, llmModalOpen, setLlmModalOpen,
    generateEncouragement, loadAndGenerate, handleLlmDownload, handleEncouragementPress,
  };
}
```

> The unmount cleanup effect (~1499–1514) destroys `wakeWordEngineRef`,
> `llmServiceRef`, **and** `ttsServiceRef`. It is shared across three hooks.
> Resolution: split it — `useLlmEncouragement` gets a cleanup effect destroying
> only `llmServiceRef`; `useTts` (Task 9) should likewise own a cleanup effect
> destroying only `ttsServiceRef`; `useVoiceControl` (Task 11) owns the
> `wakeWordEngineRef` cleanup. **Go back and add** the `ttsServiceRef` cleanup
> effect to `useTts` now if not already present (it was part of the shared
> effect). Each destroys only its own ref — behavior identical to the combined
> effect.

- [ ] **Step 1: Add a `ttsServiceRef`-only unmount cleanup effect to `useTts`** (if Task 9 didn't include it):
```js
useEffect(() => () => {
  if (ttsServiceRef.current) { ttsServiceRef.current.destroy(); ttsServiceRef.current = null; }
}, []);
```

- [ ] **Step 2: Create `useLlmEncouragement`** with an `llmServiceRef`-only cleanup effect:
```js
useEffect(() => () => {
  if (llmServiceRef.current) { llmServiceRef.current.destroy(); llmServiceRef.current = null; }
}, []);
```

- [ ] **Step 3: Wire into App.jsx**:

```js
const llm = useLlmEncouragement({ items, totals, activeItemId, elapsedTime, speakText });
const { aiCoachEnabled } = llm;
```

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLlmEncouragement.js src/hooks/useTts.js src/App.jsx
git commit -m "refactor(app): extract useLlmEncouragement hook"
```

---

## Task 11: `useVoiceControl`

**Files:**
- Create: `src/hooks/useVoiceControl.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- State/refs: `wakeWordEngineRef` (~192), `sttServiceRef` (~193),
  `handsFreeMode` (~194), `wakeWordLoading` (~195), `wakeWordDetected` (~196),
  `wakeWordError` (~197), `listeningState` (~198), `voiceTranscript` (~199).
- Callbacks: `dispatchVoiceCommand` (~1192–1313), `handleToggleHandsFree`
  (~1398–1496).
- The `wakeWordEngineRef`-only portion of the unmount cleanup (~1499–1504).
- Imports used: `createSttService`; `parseIntent`, `findBestItemMatch`;
  dynamic `import('./audio/wakeWordEngine')`; `useLanguage` for `language` +
  `toggleLanguage`.

**Hook signature:**
```js
export function useVoiceControl({
  metronome, items, activeItemId, handleStart, handleStop,
  handleTabChange, handleSubpageChange, speakText,
}) {
  const { language, toggleLanguage } = useLanguage();
  // dispatchVoiceCommand references metronome.* (engineRef, isPlaying, setIsPlaying,
  //   setCurrentBeat, setBpm, setTimeSignature, setSubdivision), noSleepRef
  //   (metronome.noSleepRef), setActiveTab/setMetronomeSubpage — replace the
  //   latter two with handleTabChange/handleSubpageChange calls where the
  //   original used direct setState. NOTE: the original 'metronome.start' case
  //   calls setActiveTab('metronome') + setMetronomeSubpage('metronome')
  //   directly; preserve exact behavior by calling nav setters. To avoid adding
  //   nav setters to the interface, pass a small `navigate` helper instead:
  //   navigate('metronome', 'metronome'). See wiring.
  return {
    handsFreeMode, wakeWordLoading, wakeWordDetected, wakeWordError,
    listeningState, voiceTranscript, handleToggleHandsFree,
  };
}
```

> **Direct-setState cases in `dispatchVoiceCommand`:** the original sets
> `setActiveTab(...)` and `setMetronomeSubpage(...)` directly in a few cases.
> These setters now live in `useNavigation`. Pass them through a single
> `navigate(tab, subpage)` callback from App.jsx:
> ```js
> const navigate = (tab, subpage) => {
>   nav.setActiveTab(tab);
>   if (subpage) nav.setMetronomeSubpage(subpage);
> };
> ```
> Replace the direct `setActiveTab`/`setMetronomeSubpage` calls in the moved
> `dispatchVoiceCommand` with `navigate(...)`. Cases that already call
> `handleTabChange`/`handleSubpageChange` keep doing so via the passed props.
> Behavior is identical.

- [ ] **Step 1: Create the hook** with the signature above; apply the `metronome.*` renames and the `navigate`/`handleTabChange`/`handleSubpageChange` substitutions in `dispatchVoiceCommand`. Include the `wakeWordEngineRef`-only cleanup effect.

- [ ] **Step 2: Wire into App.jsx**:

```js
const navigate = (tab, subpage) => {
  nav.setActiveTab(tab);
  if (subpage) nav.setMetronomeSubpage(subpage);
};
const voice = useVoiceControl({
  metronome, items, activeItemId, handleStart, handleStop,
  handleTabChange, handleSubpageChange, speakText, navigate,
});
const {
  handsFreeMode, wakeWordLoading, wakeWordDetected, wakeWordError,
  listeningState, voiceTranscript, handleToggleHandsFree,
} = voice;
```
> Add `navigate` to the destructured signature params of `useVoiceControl`.

- [ ] **Step 3: Tidy the auto-disable Kokoro effect** in App.jsx — it now reads `aiCoachEnabled` (from `llm`) and `handsFreeMode` (from `voice`) and calls `tts.setKokoroEnabled(false)`. Confirm it sits after all three hooks are destructured:
```js
useEffect(() => {
  if (!aiCoachEnabled && !handsFreeMode && tts.kokoroEnabled) {
    tts.setKokoroEnabled(false);
    setItem('drummate_kokoro_tts', 'false');
  }
}, [aiCoachEnabled, handsFreeMode]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVoiceControl.js src/App.jsx
git commit -m "refactor(app): extract useVoiceControl hook"
```

---

## Task 12: `useSync`

**Files:**
- Create: `src/hooks/useSync.js`
- Modify: `src/App.jsx`

**Move from App.jsx (preserve all load-bearing comments verbatim):**
- State: `isSyncing` (~312), `offlineMode`/`_setOfflineMode` (~313),
  `syncTrigger` (~314), `pendingModalOpen` (~315), `goOnlineToast` (~323),
  `subscriptionRef` (~400), `prevUserRef` (~447), `prevIsVisitorRef` (~426).
- `setOfflineMode` callback (~318–321).
- `goOnlineToast` auto-clear effect (~325–329).
- The sign-out reset effect (~402–424).
- The visitor-logoff reset effect (~427–445).
- The main sync `init` effect (~449–550) — **the load-bearing one**.
- `handleEnterOfflineMode` (~1611–1622), `handleGoOnline` (~1624–1634).
- Imports used: `getOfflineMode`, `setOfflineMode as setOfflineServiceMode`;
  `db`, `archiveGoal`, `getGoalByUid`, `insertGoalRecord`; `firebaseBackend`;
  `initTimezone`, `initPriorHours`; `shouldMigrateLegacy`, `buildMigratedGoal`,
  `selectExpiredForArchive`; `getTodayString`; `getItem`/`removeItem`;
  `useAuth` for `user`, `authReady`.

> The reset effects call setters from `useAppData`
> (`setItems`/`setTotals`/`setMetronomePractices`/`setNotes`),
> `useReports` (`setReportLogs`/`setWeekLogs`/`setMonthLogs`/`setYearLogs` —
> **expose these from `useReports`** by adding them to its return),
> `useMetronomeState` (`setSequencerBpm`/`setSequencerSoundType`/
> `setSequencerSlots`/`sequencerNextIdRef`/`setMultiMeterBpm`/
> `setMultiMeterSoundType`/`setMultiMeterSlots`), `useSync`-local `setIsSyncing`,
> `useNavigation` (`setActiveTab`), and App-level `setSettingsOpen`. Pass all
> needed setters into `useSync` via a `resetters` object so the moved reset
> effects keep working verbatim (only the call sites get the object prefix).

**Hook signature:**
```js
export function useSync({ loadData, resetters }) {
  const { user, authReady } = useAuth();
  // resetters = {
  //   setItems, setTotals, setMetronomePractices, setNotes,
  //   setReportLogs, setWeekLogs, setMonthLogs, setYearLogs,
  //   setSequencerBpm, setSequencerSoundType, setSequencerSlots, sequencerNextIdRef,
  //   setMultiMeterBpm, setMultiMeterSoundType, setMultiMeterSlots,
  //   setActiveTab, setSettingsOpen,
  // }
  // ...moved state/refs/effects/callbacks (comments preserved verbatim)...
  return {
    isSyncing, offlineMode, setOfflineMode,
    pendingModalOpen, setPendingModalOpen,
    goOnlineToast,
    handleEnterOfflineMode, handleGoOnline,
  };
}
```

> In the moved reset effects, prefix each setter call with `resetters.`
> (e.g. `setItems([])` → `resetters.setItems([])`). The `init` effect's body is
> moved **unchanged** except `setIsSyncing`/`setOfflineMode`/`subscriptionRef`
> are now hook-local (no prefix needed) and `loadData` comes from the param. Do
> not reorder, simplify, or alter any logic or comment in `init`.

- [ ] **Step 1: Expose reset setters** from `useReports` — add `setReportLogs`, `setWeekLogs`, `setMonthLogs`, `setYearLogs` to its return object.

- [ ] **Step 2: Create `useSync`** by moving the listed symbols; apply the `resetters.` prefix in the two reset effects only.

- [ ] **Step 3: Wire into App.jsx**:

```js
const sync = useSync({
  loadData,
  resetters: {
    setItems, setTotals, setMetronomePractices, setNotes,
    setReportLogs: reports.setReportLogs, setWeekLogs: reports.setWeekLogs,
    setMonthLogs: reports.setMonthLogs, setYearLogs: reports.setYearLogs,
    setSequencerBpm: metronome.setSequencerBpm, setSequencerSoundType: metronome.setSequencerSoundType,
    setSequencerSlots: metronome.setSequencerSlots, sequencerNextIdRef: metronome.sequencerNextIdRef,
    setMultiMeterBpm: metronome.setMultiMeterBpm, setMultiMeterSoundType: metronome.setMultiMeterSoundType,
    setMultiMeterSlots: metronome.setMultiMeterSlots,
    setActiveTab: nav.setActiveTab, setSettingsOpen,
  },
});
const {
  isSyncing, offlineMode, pendingModalOpen, setPendingModalOpen,
  goOnlineToast, handleEnterOfflineMode, handleGoOnline,
} = sync;
```
Remove now-unused sync/offline/goal-migration imports from App.jsx.

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass (`tests/offlineService.test.js`, `tests/authContext.test.js`, `tests/visitorMode.test.js` must stay green).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSync.js src/hooks/useReports.js src/App.jsx
git commit -m "refactor(app): extract useSync hook"
```

---

## Task 13: `useKeyboardShortcuts`

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.js`
- Modify: `src/App.jsx`

**Move from App.jsx:**
- `languageRef` (~91) + its mirror effect (~1516).
- `showKeyboardHelp` state (~316).
- The global `keydown` handler effect (~1531–1609).

> The handler reads: `handleTabChange`, `handleSubpageChange`, `setReportSubpage`,
> `handleReportDateChange`, `handleWeekChange`, `handleMonthChange`,
> `handleYearChange` (from nav/reports); `toggleLanguage` (useLanguage);
> `saveAndStop`, `activeItemIdRef` (timer); `setTheme`, `setTimeUnit` (prefs);
> `setMetronomeAccentFirstBeat` (metronome); the refs
> `activeTabRef`/`metronomeSubpageRef`/`reportSubpageRef`/`notesSubpageRef`/
> `reportDateRef`/`weekStartRef`/`monthStartRef`/`yearStartRef` (nav);
> `setShowKeyboardHelp` (local). Plus `getTodayString`, `shiftDate`,
> `getWeekStart`, `getMonthStart`, `getYearStart`.

**Hook signature:**
```js
export function useKeyboardShortcuts({
  activeItemIdRef,
  nav,        // { activeTabRef, metronomeSubpageRef, reportSubpageRef, notesSubpageRef,
              //   reportDateRef, weekStartRef, monthStartRef, yearStartRef,
              //   handleTabChange, handleSubpageChange, setReportSubpage, setNotesSubpage }
  reports,    // { handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange }
  setTimeUnit, setTheme, setMetronomeAccentFirstBeat,
  saveAndStop,
}) {
  const { language, toggleLanguage } = useLanguage();
  // languageRef + mirror effect live here; showKeyboardHelp state lives here.
  // The moved keydown effect uses nav.*/reports.* dotted references.
  return { showKeyboardHelp, setShowKeyboardHelp };
}
```

> `activeItemIdRef` must be exposed from `usePracticeTimer` — **add it to that
> hook's return** if not already. The keyboard handler's body is moved
> unchanged except for the `nav.`/`reports.` prefixes on the listed symbols.

- [ ] **Step 1: Expose `activeItemIdRef`** from `usePracticeTimer`'s return (Task 4 hook).

- [ ] **Step 2: Create `useKeyboardShortcuts`** by moving the listed symbols; apply dotted prefixes.

- [ ] **Step 3: Wire into App.jsx**:

```js
const { showKeyboardHelp, setShowKeyboardHelp } = useKeyboardShortcuts({
  activeItemIdRef: timer.activeItemIdRef,
  nav, reports,
  setTimeUnit, setTheme, setMetronomeAccentFirstBeat: metronome.setAccentFirstBeat,
  saveAndStop,
});
```
Remove the now-unused date-helper imports from App.jsx if no longer referenced there.

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.js src/hooks/usePracticeTimer.js src/App.jsx
git commit -m "refactor(app): extract useKeyboardShortcuts hook"
```

---

## Task 14: Extract `MetronomeTab` component

**Files:**
- Create: `src/components/MetronomeTab.jsx`
- Modify: `src/App.jsx`

**Move from App.jsx:** the entire `activeTab === 'metronome'` JSX block
(~1707–1833) — the subpage toggle bar + the
Metronome/Sequencer/MultiMeter/Practice conditional.

**Component signature:**
```jsx
// src/components/MetronomeTab.jsx
export default function MetronomeTab({
  metronomeSubpage, onSubpageChange,
  metronome,            // the full useMetronomeState object
  practices,            // run-view state + handlers from useMetronomePractices
  items, compactMode,
}) { /* moved JSX, reading metronome.* / practices.* */ }
```

- [ ] **Step 1: Create the component** by moving the JSX block; map the inline prop expressions (e.g. `bpm={metronomeBpm}`) to `metronome.*` and `practices.*` accessors. Import `Metronome`, `SequencerPage`, `MultiMeterPage`, `PracticePage`, `useLanguage` (for the toggle labels' `t`).

- [ ] **Step 2: Replace the block in App.jsx**:

```jsx
{activeTab === 'metronome' && (
  <MetronomeTab
    metronomeSubpage={metronomeSubpage}
    onSubpageChange={handleSubpageChange}
    metronome={metronome}
    practices={practices}
    items={items}
    compactMode={compactMode}
  />
)}
```
Add the import; remove `Metronome`/`SequencerPage`/`MultiMeterPage`/`PracticePage` imports from App.jsx if no longer used there.

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/MetronomeTab.jsx src/App.jsx
git commit -m "refactor(app): extract MetronomeTab component"
```

---

## Task 15: Extract `ReportTab` component

**Files:**
- Create: `src/components/ReportTab.jsx`
- Modify: `src/App.jsx`

**Move from App.jsx:** the entire `activeTab === 'report'` JSX block
(~1835–1926) — the report subpage toggle bar + the
Daily/Weekly/Monthly/Yearly/Stats/Goals conditional.

**Component signature:**
```jsx
export default function ReportTab({
  reportSubpage, setReportSubpage,
  items,               // unfiltered; ReportTab applies the existing .filter(i => !i.trashed)
  reports,             // the useReports object (dates, logs, handlers)
  timeUnit, groupByCategory, compactMode,
  user, firebaseBackend,
}) { /* moved JSX, reading reports.* */ }
```

- [ ] **Step 1: Create the component** by moving the JSX block; map prop expressions to `reports.*`. Import `DailyReport`, `WeeklyReport`, `MonthlyReport`, `YearlyReport`, `StatsReport`, `GoalsPage`, `useLanguage`. Preserve the exact `items.filter(i => !i.trashed)` calls.

- [ ] **Step 2: Replace the block in App.jsx**:

```jsx
{activeTab === 'report' && (
  <ReportTab
    reportSubpage={reportSubpage}
    setReportSubpage={setReportSubpage}
    items={items}
    reports={reports}
    timeUnit={timeUnit}
    groupByCategory={groupByCategory}
    compactMode={compactMode}
    user={user}
    firebaseBackend={firebaseBackend}
  />
)}
```
Add the import; remove the now-unused report-component imports from App.jsx.

- [ ] **Step 3: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportTab.jsx src/App.jsx
git commit -m "refactor(app): extract ReportTab component"
```

---

## Task 16: Extract `AppHeader` component + final cleanup

**Files:**
- Create: `src/components/AppHeader.jsx`
- Modify: `src/App.jsx`

**Move from App.jsx:** the header row JSX (~1666–1678) — the `<h1>` title + the
settings avatar button.

**Component signature:**
```jsx
export default function AppHeader({ user, onOpenSettings }) {
  const { t } = useLanguage();
  /* moved title + settings button JSX */
}
```

- [ ] **Step 1: Create the component** by moving the header JSX.

- [ ] **Step 2: Replace in App.jsx**:

```jsx
<AppHeader user={user} onOpenSettings={() => setSettingsOpen(true)} />
```

- [ ] **Step 3: Final import sweep** — remove every now-unused import from App.jsx. Run `npm run lint` and fix any `no-unused-vars`.

- [ ] **Step 4: Green gate**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 5: Verify App.jsx size** — `wc -l src/App.jsx`. Expected: ~250–320 lines (imports + hook calls + JSX shell + remaining modals/widgets).

- [ ] **Step 6: Commit**

```bash
git add src/components/AppHeader.jsx src/App.jsx
git commit -m "refactor(app): extract AppHeader and finalize App.jsx shell"
```

---

## Task 17: Full manual verification

No code changes — execute the manual checklist and record results. If anything
fails, it indicates a non-pure move; bisect to the offending task's commit.

- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] `npm run test` all green
- [ ] Practice: start/stop/save a timer; add/rename/delete/restore/archive/merge/reorder items; category change
- [ ] Practice timer auto-save: start a timer, refresh the page — session recovered
- [ ] Metronome subpage plays; Sequencer plays; Multi-Meter plays; Practice run mode works — all persist across tab switches
- [ ] Report subpages: daily/weekly/monthly/yearly/stats/goals render; date stepping; edit-time modal; add-time; merge-to-yesterday; day-click → daily
- [ ] Notes: by-date and by-item; local create/edit/delete reflects
- [ ] Keyboard shortcuts: 1/2/3/4, Tab/Shift+Tab cycling per tab, ←/→ on report subpages, M/H, E/C, L/D, S, A (metronome accent), ? (help modal)
- [ ] Settings panel: every toggle (time unit, group-by-category, compact, theme, AI coach, hands-free, Kokoro)
- [ ] AI Coach: enable → encouragement button → modal loads/generates
- [ ] Hands-free (Chrome): toggle loads wake-word engine; voice command dispatches
- [ ] Offline (DevTools offline + reload): local data intact, banner shows, no items wiped; pending count ticks on edits; go-online round-trip; go-online-while-offline 3.5s toast
- [ ] Sign out / visitor log-off: state resets cleanly, lands on practice tab

---

## Self-Review Notes

- **Spec coverage:** all 13 hooks + 3 components from the spec table have tasks
  (Tasks 1–16). `useNavigation` owns `reportSubpage` (spec tentatively placed it
  in `useReports`; moved for cohesion, cycle broken via `reportSubpageNavRef`).
- **Cross-hook cycles resolved:** reports↔nav (`reportSubpageNavRef`),
  tts↔llm/voice (auto-disable effect kept in App.jsx; `speakText` extracted
  first), shared unmount cleanup split three ways (Tasks 9/10/11), shared
  `clearActiveTimer` extracted once (Task 5).
- **Tests:** new unit tests for `useUiPreferences`, `useMetronomeState`,
  `useReports`; existing suite guards the rest. `@testing-library/react`
  (^16.3.2, provides `renderHook`) is already installed and the vitest
  environment is `jsdom` — no prerequisite install needed.
- **No logic changes:** every moved body is verbatim modulo documented dotted
  renames and the three small extracted helpers, each of which reproduces the
  original inlined behavior exactly.
