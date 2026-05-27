# Metronome Practice → Practice Item Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional link from a metronome practice to a practice item so that starting a metronome practice auto-starts the linked item's timer, and completing the metronome practice (all BPM steps done) auto-saves and stops it.

**Architecture:** `linkedItemUid` (nullable string) is stored directly on the `metronomePractice` record — no DB version bump needed since the field is unindexed. A dropdown in `PracticeEditModal` lets the user set/clear the link. `handleStartPractice` and `handleEndPractice` in App.jsx read the field at runtime to auto-start/stop.

**Tech Stack:** React 19, Vitest + @testing-library/react, Dexie (IndexedDB), Firebase (auto-synced via existing `pushPractice`)

---

## File Map

| File | Role |
|---|---|
| `src/contexts/LanguageContext.jsx` | Add 3 i18n strings (label, "None", "not found") |
| `src/components/PracticeEditModal.jsx` | Add `items` prop + `linkedItemUid` field + `<select>` dropdown |
| `src/components/PracticeRunView.jsx` | Pass `complete` boolean to `onEnd()` so App knows if it was a natural finish |
| `src/components/PracticePage.jsx` | Accept + forward `items` prop to `PracticeEditModal` |
| `src/App.jsx` | Pass `items` to PracticePage; update `handleStartPractice` + `handleEndPractice` |
| `tests/practiceEditModal.test.jsx` | RTL tests for the new dropdown |

---

### Task 1: i18n strings [model: Haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx:131-133` (en block)
- Modify: `src/contexts/LanguageContext.jsx:546-548` (zh block)

- [ ] **Step 1: Add English strings after the `positiveBars` validation key**

In `src/contexts/LanguageContext.jsx`, find the closing `},` of the `validation` block inside `practiceMode` (currently around line 132). Add three keys immediately after that closing brace, before the `multiMeter` block:

```js
      // BEFORE (lines 131–134):
      positiveBars: 'Bars per step must be at least 1',
      },
    },
    multiMeter: {

      // AFTER:
      positiveBars: 'Bars per step must be at least 1',
      },
      linkedItem: 'Linked Practice Item',
      linkedItemNone: '— None —',
      linkedItemNotFound: '⚠ Item not found',
    },
    multiMeter: {
```

- [ ] **Step 2: Add Chinese strings in the same position in the zh block** (around line 546)

```js
      // BEFORE (lines 545–549):
      positiveBars: '每段小节数至少为 1',
      },
    },
    multiMeter: {

      // AFTER:
      positiveBars: '每段小节数至少为 1',
      },
      linkedItem: '关联练习项目',
      linkedItemNone: '— 无 —',
      linkedItemNotFound: '⚠ 找不到该项目',
    },
    multiMeter: {
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(i18n): add linked practice item strings"
```

---

### Task 2: Write failing tests for PracticeEditModal dropdown [model: Sonnet]

**Files:**
- Create: `tests/practiceEditModal.test.jsx`

- [ ] **Step 1: Create the test file**

```jsx
// tests/practiceEditModal.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PracticeEditModal from '../src/components/PracticeEditModal';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const fundamentals = [
  { id: 1, uid: 'uid-1', name: 'Paradiddle', category: 'fundamentals', trashed: false, archived: false },
];
const songs = [
  { id: 2, uid: 'uid-2', name: 'Song A', category: 'songs', trashed: false, archived: false },
];
const mockItems = [...fundamentals, ...songs];

const basePractice = {
  name: 'Test',
  startBpm: 80,
  endBpm: 120,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: 'quarter',
  soundType: 'click',
  linkedItemUid: null,
};

describe('PracticeEditModal — linked practice item dropdown', () => {
  it('renders a dropdown with None option and practice items', () => {
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
    expect(screen.getByText('practiceMode.linkedItemNone')).toBeTruthy();
    expect(screen.getByText('Paradiddle')).toBeTruthy();
    expect(screen.getByText('Song A')).toBeTruthy();
  });

  it('onSave receives linkedItemUid null when None is selected (default)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={onSave}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText('practiceMode.namePlaceholder'), 'Test');
    await user.click(screen.getByText('done'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ linkedItemUid: null }));
  });

  it('onSave receives the selected item uid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={onSave}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText('practiceMode.namePlaceholder'), 'Test');
    await user.selectOptions(screen.getByRole('combobox'), 'uid-1');
    await user.click(screen.getByText('done'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ linkedItemUid: 'uid-1' }));
  });

  it('pre-selects the saved linkedItemUid when editing', () => {
    render(
      <PracticeEditModal
        practice={{ ...basePractice, linkedItemUid: 'uid-2' }}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('uid-2');
  });

  it('shows stale warning when savedlinkedItemUid is not in items', () => {
    render(
      <PracticeEditModal
        practice={{ ...basePractice, linkedItemUid: 'gone-uid' }}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('practiceMode.linkedItemNotFound')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run tests/practiceEditModal.test.jsx
```

Expected: All 5 tests FAIL — `items` prop is unknown, no `<select>` exists yet.

---

### Task 3: Implement PracticeEditModal dropdown [model: Sonnet]

**Files:**
- Modify: `src/components/PracticeEditModal.jsx`

- [ ] **Step 1: Add `linkedItemUid` to DEFAULTS and add `items` prop**

In `PracticeEditModal.jsx`, update `DEFAULTS` (currently around line 16) to include `linkedItemUid: null`:

```js
const DEFAULTS = {
  name: '',
  startBpm: 80,
  endBpm: 120,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: 'quarter',
  soundType: 'click',
  linkedItemUid: null,      // ← add this line
};
```

Update the function signature (currently `export default function PracticeEditModal({ practice, onSave, onDelete, onCancel }`) to:

```js
export default function PracticeEditModal({ practice, items = [], onSave, onDelete, onCancel }) {
```

- [ ] **Step 2: Add the dropdown section in JSX**

In `PracticeEditModal.jsx`, find the `{error && ...}` block (currently around line 204) and insert the linked item section immediately before it:

```jsx
          {/* Linked practice item */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-600 dark:text-slate-200">
              {t('practiceMode.linkedItem')}
            </span>
            {(() => {
              const isStale = form.linkedItemUid && !items.find(i => i.uid === form.linkedItemUid);
              const fundamentals = items
                .filter(i => i.category === 'fundamentals')
                .sort((a, b) => a.name.localeCompare(b.name));
              const songs = items
                .filter(i => i.category === 'songs')
                .sort((a, b) => a.name.localeCompare(b.name));
              return (
                <select
                  value={form.linkedItemUid ?? ''}
                  onChange={(e) => setField('linkedItemUid', e.target.value || null)}
                  className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 dark:bg-slate-700 dark:text-slate-100"
                >
                  <option value="">{t('practiceMode.linkedItemNone')}</option>
                  {isStale && (
                    <option value={form.linkedItemUid} disabled>
                      {t('practiceMode.linkedItemNotFound')}
                    </option>
                  )}
                  {fundamentals.length > 0 && (
                    <optgroup label={t('categories.fundamentals')}>
                      {fundamentals.map(item => (
                        <option key={item.uid} value={item.uid}>{item.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {songs.length > 0 && (
                    <optgroup label={t('categories.songs')}>
                      {songs.map(item => (
                        <option key={item.uid} value={item.uid}>{item.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              );
            })()}
          </div>
```

- [ ] **Step 3: Verify `handleSave` needs no changes**

Open `PracticeEditModal.jsx` and read `handleSave` (around line 74). It calls `onSave({...form, name: form.name.trim(), startBpm: ..., endBpm: ..., bpmIncrement: ..., barsPerStep: ...})`. The `...form` spread includes `form.linkedItemUid`, so the field is automatically included in the payload. **No code change needed here — this is a read-and-confirm step only.**

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run tests/practiceEditModal.test.jsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/PracticeEditModal.jsx tests/practiceEditModal.test.jsx
git commit -m "feat(metronome): add linked practice item dropdown to PracticeEditModal"
```

---

### Task 4: Update PracticeRunView to pass `complete` to `onEnd` [model: Haiku]

**Files:**
- Modify: `src/components/PracticeRunView.jsx:142-148`

The `handleEnd` callback currently calls `onEnd()` with no arguments. Change it to pass the current `complete` state so the caller can distinguish natural completion from manual exit.

- [ ] **Step 1: Update `handleEnd`**

Find `handleEnd` (around line 142):

```js
// BEFORE:
  const handleEnd = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.isPlaying) engine.stop();
    engine && (engine.onBeat = null);
    noSleepRef.current?.disable?.();
    onEnd();
  }, [engineRef, noSleepRef, onEnd]);

// AFTER:
  const handleEnd = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.isPlaying) engine.stop();
    engine && (engine.onBeat = null);
    noSleepRef.current?.disable?.();
    onEnd(complete);
  }, [engineRef, noSleepRef, onEnd, complete]);
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PracticeRunView.jsx
git commit -m "feat(metronome): pass completion state to onEnd callback"
```

---

### Task 5: Forward `items` prop through PracticePage [model: Haiku]

**Files:**
- Modify: `src/components/PracticePage.jsx`

`PracticePage` is the intermediary between App.jsx and `PracticeEditModal`. It needs to accept an `items` prop and pass it down to the modal.

- [ ] **Step 1: Add `items` to the PracticePage prop destructuring**

Find the `export default function PracticePage({` declaration (around line 99) and add `items = []` to the list:

```js
// BEFORE:
export default function PracticePage({
  practices,
  runningPracticeUid,
  engineRef,
  noSleepRef,
  onAddPractice,
  onUpdatePractice,
  onDeletePractice,
  onReorderPractices,
  onStartPractice,
  onEndPractice,
  runStepIndex,
  runBarIndex,
  runIsPlaying,
  runComplete,
  setRunStepIndex,
  setRunBarIndex,
  setRunIsPlaying,
  setRunComplete,
  compactMode = false,
}) {

// AFTER:
export default function PracticePage({
  practices,
  runningPracticeUid,
  engineRef,
  noSleepRef,
  onAddPractice,
  onUpdatePractice,
  onDeletePractice,
  onReorderPractices,
  onStartPractice,
  onEndPractice,
  runStepIndex,
  runBarIndex,
  runIsPlaying,
  runComplete,
  setRunStepIndex,
  setRunBarIndex,
  setRunIsPlaying,
  setRunComplete,
  compactMode = false,
  items = [],                // ← add this line
}) {
```

- [ ] **Step 2: Pass `items` to PracticeEditModal**

Find where `PracticeEditModal` is rendered in `PracticePage` (around line 234):

```jsx
// BEFORE:
        <PracticeEditModal
          practice={modalState.mode === 'edit' ? modalState.practice : null}
          onSave={async (data) => {

// AFTER:
        <PracticeEditModal
          practice={modalState.mode === 'edit' ? modalState.practice : null}
          items={items}
          onSave={async (data) => {
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticePage.jsx
git commit -m "feat(metronome): forward items prop to PracticeEditModal"
```

---

### Task 6: Wire up auto-start and auto-stop in App.jsx [model: Sonnet]

**Files:**
- Modify: `src/App.jsx`

Two changes: (1) pass `items` to `PracticePage`, (2) update `handleStartPractice` to auto-start the linked item, (3) update `handleEndPractice` to auto-stop on natural completion.

- [ ] **Step 1: Pass `items` to PracticePage**

Find the `<PracticePage` block (around line 1824) and add the `items` prop:

```jsx
// BEFORE:
                <PracticePage
                  practices={metronomePractices}
                  runningPracticeUid={runningPracticeUid}

// AFTER:
                <PracticePage
                  practices={metronomePractices}
                  runningPracticeUid={runningPracticeUid}
                  items={items.filter(i => !i.trashed)}
```

- [ ] **Step 2: Update `handleStartPractice`**

Find `handleStartPractice` (currently around line 899):

```js
// BEFORE:
  const handleStartPractice = useCallback((uid) => {
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
    setRunningPracticeUid(uid);
  }, []);

// AFTER:
  const handleStartPractice = useCallback(async (uid) => {
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
    setRunningPracticeUid(uid);

    const practice = metronomePractices.find(p => p.uid === uid);
    if (practice?.linkedItemUid) {
      const linkedItem = items.find(i => i.uid === practice.linkedItemUid && !i.trashed);
      if (linkedItem) {
        await handleStart(linkedItem.id);
      }
    }
  }, [metronomePractices, items, handleStart]);
```

- [ ] **Step 3: Update `handleEndPractice`**

Find `handleEndPractice` (currently around line 907):

```js
// BEFORE:
  const handleEndPractice = useCallback(() => {
    setRunningPracticeUid(null);
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
  }, []);

// AFTER:
  const handleEndPractice = useCallback(async (wasComplete) => {
    const practiceUid = runningPracticeUid;

    if (wasComplete && practiceUid) {
      const practice = metronomePractices.find(p => p.uid === practiceUid);
      if (practice?.linkedItemUid && activeItemId != null) {
        const activeItem = items.find(i => i.id === activeItemId);
        if (activeItem?.uid === practice.linkedItemUid) {
          await saveAndStop();
        }
      }
    }

    setRunningPracticeUid(null);
    setPracticeRunStepIndex(0);
    setPracticeRunBarIndex(0);
    setPracticeRunIsPlaying(false);
    setPracticeRunComplete(false);
  }, [runningPracticeUid, metronomePractices, activeItemId, items, saveAndStop]);
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(metronome): auto-start/stop linked practice item with metronome practice"
```

---

### Task 7: Manual verification [model: Sonnet]

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open http://localhost:5173.

- [ ] **Step 2: Verify dropdown appears in Create modal**

1. Go to **Metronome** tab → **Practices** subpage.
2. Tap **+** to add a new practice.
3. Confirm a **"Linked Practice Item"** dropdown appears at the bottom of the modal with a "— None —" option and all non-trashed practice items from the Practice tab grouped by Fundamentals / Songs.
4. Save with "None" selected — confirm no timer starts.

- [ ] **Step 3: Verify link persists through edit**

1. Create or edit a metronome practice, select a linked item, save.
2. Re-open the edit modal — confirm the dropdown shows the previously selected item.

- [ ] **Step 4: Verify auto-start**

1. Ensure the Practice tab has no active timer (no item running).
2. On the Metronome tab, start the practice linked to an item.
3. Switch to the Practice tab — confirm the linked item's timer is ticking.
   - Or stay on Metronome — the floating practice widget at the top should appear with the linked item name.

- [ ] **Step 5: Verify auto-stop on natural completion**

1. Create a short metronome practice (e.g. start=80, end=82, increment=2, bars=1).
2. Link it to a practice item and start it.
3. Let it complete all BPM steps — confirm the "Practice Complete!" screen appears.
4. Click **Done** — confirm the practice item's timer auto-saves and stops (the floating widget disappears; the item's total in the Report tab increases).

- [ ] **Step 6: Verify manual end does NOT stop timer**

1. Start the same linked metronome practice.
2. Click **End** (the gray button) before it finishes.
3. Confirm the practice item timer is still running (floating widget still visible).

- [ ] **Step 7: Verify stale link warning**

1. Open a metronome practice that was linked to an item that no longer exists (or temporarily remove an item from Dexie via DevTools → Application → IndexedDB → Delete that row).
2. Open the edit modal — confirm **"⚠ Item not found"** appears as the selected (disabled) option.

- [ ] **Step 8: Final build confirmation**

```bash
npm run build
```

Expected: Build succeeds with no errors or warnings related to these changes.
