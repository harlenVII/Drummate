# Practice Goal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-boxed practice goal (start date, end date, target hours) that shows progress and required daily average across the Practice and Stats tabs.

**Architecture:** One localStorage key (`drummate_goal`) holds the goal config. Three self-contained components (`GoalSetupModal`, `GoalCard`, `GoalBanner`) each read localStorage and query `getLogsByDateRange()` independently — no new state in `App.jsx`. Goal progress is always displayed in hours (since the goal is configured in hours), so `timeUnit` is not needed in these components.

**Tech Stack:** React 19, Tailwind CSS v4, Dexie.js (`getLogsByDateRange`), `LanguageContext` (`t()`), `dateHelpers.js`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/contexts/LanguageContext.jsx` | Modify | Add `goal.*` translation keys (`en` + `zh`) |
| `src/components/GoalSetupModal.jsx` | Create | Modal: start date, end date, target hours → writes `drummate_goal` to localStorage |
| `src/components/GoalCard.jsx` | Create | Full-detail goal card for Stats tab |
| `src/components/GoalBanner.jsx` | Create | Compact progress strip for Practice tab |
| `src/components/StatsReport.jsx` | Modify | Render `GoalCard` above existing sections |
| `src/components/PracticeItemList.jsx` | Modify | Render `GoalBanner` at top |
| `src/App.jsx` | No change needed | `timeUnit` not required by goal components |

---

## Helper used across GoalCard and GoalBanner

Both components share this date math. Write it once in each file (they are self-contained — no shared util file).

```js
function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function readGoal() {
  try {
    const raw = localStorage.getItem('drummate_goal');
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g.startDate || !g.endDate || !g.targetHours || g.targetHours <= 0) return null;
    if (g.startDate >= g.endDate) return null;
    return g;
  } catch {
    return null;
  }
}

function formatRequired(hoursPerDay, t) {
  if (hoursPerDay <= 0) return t('goal.met');
  if (hoursPerDay < 1) return `${Math.round(hoursPerDay * 60)} ${t('minutes')}`;
  return `${hoursPerDay.toFixed(1)} ${t('hours')}`;
}
```

---

## Task 1: Add i18n translation keys [model: Haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add English `goal` block inside the `en` object, after `reportGenerator`**

In `src/contexts/LanguageContext.jsx`, add after the closing brace of `reportGenerator: { ... },` inside `en`:

```js
    goal: {
      title: 'Practice Goal',
      setGoal: 'Set Goal',
      editGoal: 'Edit',
      clearGoal: 'Clear',
      noGoal: 'No practice goal set',
      startDate: 'Start Date',
      endDate: 'End Date',
      targetHours: 'Target Hours (e.g. 20)',
      met: 'Goal met!',
      missed: 'Goal missed',
      startsIn: 'Starts in {days} days',
      daysLeft: '{days} days left',
      needPerDay: 'Need {amount}/day',
      errorDates: 'Please enter a start and end date',
      errorDateOrder: 'End date must be after start date',
      errorHours: 'Target hours must be greater than 0',
    },
```

- [ ] **Step 2: Add Chinese `goal` block inside the `zh` object, after `reportGenerator`**

```js
    goal: {
      title: '练习目标',
      setGoal: '设置目标',
      editGoal: '编辑',
      clearGoal: '清除',
      noGoal: '未设置练习目标',
      startDate: '开始日期',
      endDate: '结束日期',
      targetHours: '目标时长（例如 20）',
      met: '目标达成！',
      missed: '目标未达成',
      startsIn: '{days} 天后开始',
      daysLeft: '剩余 {days} 天',
      needPerDay: '每天需要 {amount}',
      errorDates: '请输入开始和结束日期',
      errorDateOrder: '结束日期必须晚于开始日期',
      errorHours: '目标时长必须大于 0',
    },
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add goal i18n translation keys (en + zh)"
```

---

## Task 2: Create GoalSetupModal.jsx [model: Sonnet]

**Files:**
- Create: `src/components/GoalSetupModal.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';

const GOAL_KEY = 'drummate_goal';

function GoalSetupModal({ isOpen, onClose, onSave, goal }) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (goal) {
      setStartDate(goal.startDate);
      setEndDate(goal.endDate);
      setTargetHours(String(goal.targetHours));
    } else {
      setStartDate(getTodayString());
      setEndDate('');
      setTargetHours('');
    }
    setError('');
  }, [isOpen, goal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!startDate || !endDate) { setError(t('goal.errorDates')); return; }
    if (startDate >= endDate) { setError(t('goal.errorDateOrder')); return; }
    const hours = parseFloat(targetHours);
    if (isNaN(hours) || hours <= 0) { setError(t('goal.errorHours')); return; }
    localStorage.setItem(GOAL_KEY, JSON.stringify({ startDate, endDate, targetHours: hours }));
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-800">{t('goal.title')}</h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600">{t('goal.startDate')}</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setError(''); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600">{t('goal.endDate')}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setError(''); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600">{t('goal.targetHours')}</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={targetHours}
            onChange={(e) => { setTargetHours(e.target.value); setError(''); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoalSetupModal;
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalSetupModal.jsx
git commit -m "feat: add GoalSetupModal component"
```

---

## Task 3: Create GoalCard.jsx [model: Sonnet]

**Files:**
- Create: `src/components/GoalCard.jsx`

This is the full-detail card for the Stats tab. It self-manages goal state and DB queries.

- [ ] **Step 1: Create the file**

```jsx
import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';
import GoalSetupModal from './GoalSetupModal';

const GOAL_KEY = 'drummate_goal';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function readGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g.startDate || !g.endDate || !g.targetHours || g.targetHours <= 0) return null;
    if (g.startDate >= g.endDate) return null;
    return g;
  } catch {
    return null;
  }
}

function formatRequired(hoursPerDay, t) {
  if (hoursPerDay <= 0) return t('goal.met');
  if (hoursPerDay < 1) return `${Math.round(hoursPerDay * 60)} ${t('minutes')}`;
  return `${hoursPerDay.toFixed(1)} ${t('hours')}`;
}

function GoalCard() {
  const { t } = useLanguage();
  const [goal, setGoal] = useState(readGoal);
  const [practicedSeconds, setPracticedSeconds] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!goal) { setPracticedSeconds(0); return; }
    let cancelled = false;
    (async () => {
      const logs = await getLogsByDateRange(goal.startDate, goal.endDate);
      if (cancelled) return;
      setPracticedSeconds(logs.reduce((sum, l) => sum + l.duration, 0));
    })();
    return () => { cancelled = true; };
  }, [goal]);

  const handleSave = () => setGoal(readGoal());
  const handleClear = () => { localStorage.removeItem(GOAL_KEY); setGoal(null); };

  if (!goal) {
    return (
      <>
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <span className="text-gray-500 text-sm">{t('goal.noGoal')}</span>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {t('goal.setGoal')}
          </button>
        </div>
        <GoalSetupModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSave} goal={null} />
      </>
    );
  }

  const today = getTodayString();
  const expired = today > goal.endDate;
  const notStarted = today < goal.startDate;
  const totalDays = dateDiffDays(goal.startDate, goal.endDate) + 1;
  const practicedHours = practicedSeconds / 3600;
  const progressPercent = Math.min(100, (practicedHours / goal.targetHours) * 100);
  const remainingHours = Math.max(0, goal.targetHours - practicedHours);
  const goalMet = practicedHours >= goal.targetHours;

  let statusText = '';
  let requiredText = '';

  if (notStarted) {
    const daysUntilStart = dateDiffDays(today, goal.startDate);
    statusText = t('goal.startsIn', { days: daysUntilStart });
    const perDay = goal.targetHours / totalDays;
    requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
  } else if (expired) {
    statusText = goalMet ? t('goal.met') : t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    statusText = t('goal.daysLeft', { days: daysLeft });
    if (goalMet) {
      requiredText = t('goal.met');
    } else {
      const perDay = remainingHours / daysLeft;
      requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="font-semibold text-gray-800 text-sm">{t('goal.title')}</span>
            <div className="text-xs text-gray-400 mt-0.5">{goal.startDate} – {goal.endDate}</div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowModal(true)} className="text-xs text-blue-600 hover:underline">
              {t('goal.editGoal')}
            </button>
            <button onClick={handleClear} className="text-xs text-red-500 hover:underline">
              {t('goal.clearGoal')}
            </button>
          </div>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-gray-600">
          <span>
            {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')}
          </span>
          <span className={goalMet || (expired && goalMet) ? 'text-green-600 font-medium' : ''}>
            {statusText}
          </span>
        </div>

        {requiredText && (
          <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
            {requiredText}
          </div>
        )}
      </div>

      <GoalSetupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        goal={goal}
      />
    </>
  );
}

export default GoalCard;
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalCard.jsx
git commit -m "feat: add GoalCard component for Stats tab"
```

---

## Task 4: Integrate GoalCard into StatsReport.jsx [model: Haiku]

**Files:**
- Modify: `src/components/StatsReport.jsx`

- [ ] **Step 1: Add import at the top of StatsReport.jsx**

Add after the existing imports (line 6, after `import ReportGeneratorModal`):

```jsx
import GoalCard from './GoalCard';
```

- [ ] **Step 2: Render GoalCard at the top of the return, before the sections `<div>`**

The current return is:
```jsx
  return (
    <>
      <div className="flex flex-col gap-4">
```

Replace the opening fragment + outer div with:
```jsx
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
            {t('goal.title')}
          </h3>
          <GoalCard />
        </div>
```

Keep all remaining content inside the outer `<div className="flex flex-col gap-4">` unchanged.

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatsReport.jsx
git commit -m "feat: integrate GoalCard into Stats report page"
```

---

## Task 5: Create GoalBanner.jsx [model: Sonnet]

**Files:**
- Create: `src/components/GoalBanner.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';

const GOAL_KEY = 'drummate_goal';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function readGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g.startDate || !g.endDate || !g.targetHours || g.targetHours <= 0) return null;
    if (g.startDate >= g.endDate) return null;
    return g;
  } catch {
    return null;
  }
}

function GoalBanner() {
  const { t } = useLanguage();
  const [goal] = useState(readGoal);
  const [practicedSeconds, setPracticedSeconds] = useState(0);

  useEffect(() => {
    if (!goal) return;
    let cancelled = false;
    (async () => {
      const logs = await getLogsByDateRange(goal.startDate, goal.endDate);
      if (cancelled) return;
      setPracticedSeconds(logs.reduce((sum, l) => sum + l.duration, 0));
    })();
    return () => { cancelled = true; };
  }, [goal]);

  if (!goal) return null;

  const today = getTodayString();
  const expired = today > goal.endDate;
  const practicedHours = practicedSeconds / 3600;
  const progressPercent = Math.min(100, (practicedHours / goal.targetHours) * 100);
  const goalMet = practicedHours >= goal.targetHours;

  let rightText = '';
  if (goalMet) {
    rightText = t('goal.met');
  } else if (expired) {
    rightText = t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    const remainingHours = Math.max(0, goal.targetHours - practicedHours);
    const perDay = remainingHours / daysLeft;
    const amount = perDay < 1
      ? `${Math.round(perDay * 60)} ${t('minutes')}`
      : `${perDay.toFixed(1)} ${t('hours')}`;
    rightText = t('goal.needPerDay', { amount });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm px-4 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          {t('goal.title')}: {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')}
        </span>
        <span className={goalMet ? 'text-green-600 font-medium' : ''}>
          {rightText}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export default GoalBanner;
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalBanner.jsx
git commit -m "feat: add GoalBanner compact component for Practice tab"
```

---

## Task 6: Wire GoalBanner into PracticeItemList [model: Haiku]

**Files:**
- Modify: `src/components/PracticeItemList.jsx`

- [ ] **Step 1: Add GoalBanner import to PracticeItemList.jsx**

At the top of `src/components/PracticeItemList.jsx`, after the existing imports, add:

```jsx
import GoalBanner from './GoalBanner';
```

- [ ] **Step 2: Render GoalBanner at the top of PracticeItemList's return**

The main return (line 551) currently starts with:
```jsx
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
```

Add `<GoalBanner />` as the first child inside the outer div:

```jsx
  return (
    <div className="flex flex-col gap-3">
      <GoalBanner />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticeItemList.jsx
git commit -m "feat: integrate GoalBanner into Practice tab"
```

---

## Task 7: Final verification [model: Haiku]

**Files:** none

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: exits 0 with no errors or warnings about undefined variables.

- [ ] **Step 2: Start dev server and verify manually**

```bash
npm run dev
```

Open `http://localhost:5173` and confirm:

1. Practice tab: `GoalBanner` is hidden (no goal set yet)
2. Stats tab: `GoalCard` shows "No practice goal set" + "Set Goal" button
3. Click "Set Goal" → modal opens with Start Date, End Date, Target Hours fields
4. Enter invalid data (end before start) → error message appears, save blocked
5. Enter valid data (e.g. 2026-05-01 → 2026-06-30, 20 hours) → saves, card shows progress bar and required daily average
6. Switch to Practice tab → `GoalBanner` now shows compact progress strip
7. Switch back to Stats → card still shows the goal (persisted in localStorage)
8. Click "Edit" → modal pre-fills existing values; can change and save
9. Click "Clear" → card returns to empty state; banner disappears from Practice tab
10. Toggle language (E/C keys) → all goal strings switch language correctly
