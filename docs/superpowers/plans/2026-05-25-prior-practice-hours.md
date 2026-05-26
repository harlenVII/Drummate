# Prior Practice Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to record hours practiced before using Drummate so the Stats report shows a true lifetime total practice time.

**Architecture:** A new `priorPracticeService.js` mirrors the `timezoneService.js` pattern — synchronous `getPriorHours()` reads from localStorage, `setPriorHours()` writes localStorage and fires a Firestore merge via the existing `setUserSetting` API, and `initPriorHours()` reconciles remote-wins on app load. The prior hours offset is applied only at the display boundary in `StatsReport` (added to the Total Practice Time row value only), keeping `computeStats` pure and Average Daily Time unaffected.

**Tech Stack:** React 19, Dexie.js/IndexedDB, Firestore (`setUserSetting` / `getUserSettings`), Vitest, Tailwind v4

---

## Files

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/services/priorPracticeService.js` | localStorage ↔ Firestore sync for prior hours |
| Create | `tests/priorPracticeService.test.js` | Unit tests for the service |
| Modify | `src/contexts/LanguageContext.jsx` | Add 3 i18n keys (en + zh) |
| Modify | `src/App.jsx` | Import + call `initPriorHours` in parallel init batch |
| Modify | `src/components/SettingsPanel.jsx` | Add numeric input row in Reports section |
| Modify | `src/components/StatsReport.jsx` | Apply offset to Total Practice Time display row |
| Modify | `CLAUDE.md` | Document new localStorage key |

---

### Task 1: `priorPracticeService.js` — service + tests [model: haiku]

**Files:**
- Create: `src/services/priorPracticeService.js`
- Create: `tests/priorPracticeService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/priorPracticeService.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('priorPracticeService', () => {
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

  it('returns 0 when no localStorage entry exists', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    expect(m.getPriorHours()).toBe(0);
  });

  it('reads an integer from localStorage', async () => {
    localStorage.setItem('drummate_prior_hours', '500');
    const m = await import('../src/services/priorPracticeService.js');
    expect(m.getPriorHours()).toBe(500);
  });

  it('setPriorHours writes to localStorage and calls setUserSetting', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(300, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('300');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 300);
  });

  it('setPriorHours floors fractional values', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(99.9, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('99');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 99);
  });

  it('setPriorHours clamps negative values to 0', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(-10, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('0');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 0);
  });

  it('initPriorHours adopts remote value into localStorage', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = {
      getUserSettings: vi.fn().mockResolvedValue({ priorPracticeHours: 750 }),
    };
    await m.initPriorHours(backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('750');
    expect(m.getPriorHours()).toBe(750);
  });

  it('initPriorHours does not overwrite localStorage when remote field is absent', async () => {
    localStorage.setItem('drummate_prior_hours', '200');
    const m = await import('../src/services/priorPracticeService.js');
    const backend = {
      getUserSettings: vi.fn().mockResolvedValue({}),
    };
    await m.initPriorHours(backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('200');
  });
});
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
npx vitest run tests/priorPracticeService.test.js
```

Expected: all 6 tests fail with module-not-found or similar errors.

- [ ] **Step 3: Create `src/services/priorPracticeService.js`**

```js
const KEY = 'drummate_prior_hours';

export function getPriorHours() {
  return Number(localStorage.getItem(KEY)) || 0;
}

export async function setPriorHours(hours, backend, userId) {
  const value = Math.floor(Math.max(0, hours));
  localStorage.setItem(KEY, String(value));
  await backend.setUserSetting(userId, 'priorPracticeHours', value);
}

export async function initPriorHours(backend, userId) {
  const settings = await backend.getUserSettings(userId);
  if (settings?.priorPracticeHours != null) {
    localStorage.setItem(KEY, String(settings.priorPracticeHours));
  }
}
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
npx vitest run tests/priorPracticeService.test.js
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/priorPracticeService.js tests/priorPracticeService.test.js
git commit -m "feat(prior-hours): add priorPracticeService with localStorage/Firestore sync

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: i18n keys [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add keys to the English translation object**

In `src/contexts/LanguageContext.jsx`, find the `stats` block in the English (`en`) translations (around line 243). Add `priorIncluded` after `days`:

```js
    stats: {
      overview: 'Overview',
      streaks: 'Streaks',
      records: 'Records',
      totalPracticeTime: 'Total Practice Time',
      totalPracticeDays: 'Total Practice Days',
      totalSessions: 'Total Sessions',
      avgDailyTime: 'Avg. Daily Practice',
      currentStreak: 'Current Streak',
      longestStreak: 'Longest Streak',
      longestDayTime: 'Best Single Day',
      mostPracticedItem: 'Most Practiced Item',
      bestMonth: 'Best Month',
      days: 'days',
      priorIncluded: 'incl. {hours} hrs before Drummate',  // add this line
    },
```

Also in the top-level English object, `settings` is a plain string (`settings: 'Settings'`). This feature needs two keys nested under a `settings` namespace. However the current pattern stores these as flat keys — check by looking at nearby keys: `groupByCategory`, `compactList`, `timezone` are all top-level flat keys, not nested under `settings`. Add two new flat keys near `groupByCategory` (around line 46):

```js
    groupByCategory: 'Group by Category',
    compactList: 'Compact List',
    priorPractice: 'Prior Practice',                              // add
    priorPracticeHint: 'Hours you practiced before Drummate',     // add
```

- [ ] **Step 2: Add the same keys to the Chinese (`zh`) translation object**

Find the `stats` block in the Chinese translations (around line 606). Add `priorIncluded` after `days`:

```js
    stats: {
      overview: '概览',
      streaks: '连续记录',
      records: '最佳记录',
      totalPracticeTime: '总练习时间',
      totalPracticeDays: '总练习天数',
      totalSessions: '总练习次数',
      avgDailyTime: '日均练习时间',
      currentStreak: '当前连续天数',
      longestStreak: '最长连续天数',
      longestDayTime: '单日最高练习',
      mostPracticedItem: '练习最多的项目',
      bestMonth: '最佳月份',
      days: '天',
      priorIncluded: '含 Drummate 前 {hours} 小时',  // add this line
    },
```

Find the flat keys near `groupByCategory` in the Chinese block (around line 409). Add two new flat keys:

```js
    groupByCategory: '按分类分组',
    compactList: '紧凑列表',
    priorPractice: '之前练习时长',                          // add
    priorPracticeHint: '在使用 Drummate 前的练习小时数',     // add
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npm run test
```

Expected: all existing tests pass (LanguageContext is not directly unit-tested, but the smoke test covers it).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat(prior-hours): add i18n keys for prior practice hours (en + zh)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Wire `initPriorHours` into App init [model: haiku]

**Files:**
- Modify: `src/App.jsx:59` (import section), `src/App.jsx:466-470` (parallel init batch)

- [ ] **Step 1: Add the import**

In `src/App.jsx`, find the line:
```js
import { initTimezone } from './services/timezoneService';
```

Add the new import directly after it:
```js
import { initTimezone } from './services/timezoneService';
import { initPriorHours } from './services/priorPracticeService';
```

- [ ] **Step 2: Add `initPriorHours` to the parallel init batch**

Find the `Promise.all` block at line 466:
```js
        await Promise.all([
          initTimezone(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
```

Change it to:
```js
        await Promise.all([
          initTimezone(firebaseBackend, user.id),
          initPriorHours(firebaseBackend, user.id),
          firebaseBackend.pullAll(user.id),
          firebaseBackend.pullAllNotes(user.id),
```

- [ ] **Step 3: Build to verify no import errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(prior-hours): init prior practice hours from Firestore on app load

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Settings panel — numeric input row [model: sonnet]

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add the import**

In `src/components/SettingsPanel.jsx`, add to the existing imports at the top:
```js
import { getPriorHours, setPriorHours } from '../services/priorPracticeService';
```

(`firebaseBackend` and `userId` are already imported/received by this component.)

- [ ] **Step 2: Add local state for the input**

Inside the `SettingsPanel` function body, after the existing `const [pendingCount, setPendingCount] = useState(0);` line (around line 160), add:

```js
const [priorHoursInput, setPriorHoursInput] = useState(() => String(getPriorHours()));
```

- [ ] **Step 3: Add the Row in the Reports section**

Find the `groupByCategory` row and the comment that begins `{/* === AI & VOICE === */}` immediately after it (around lines 345–350):

```jsx
          <Row
            label={t('groupByCategory')}
            control={<Toggle checked={groupByCategory} onChange={onToggleGroupByCategory} />}
          />

          {/* === AI & VOICE === */}
```

Insert the new row between them:

```jsx
          <Row
            label={t('groupByCategory')}
            control={<Toggle checked={groupByCategory} onChange={onToggleGroupByCategory} />}
          />

          <Row
            label={t('priorPractice')}
            subtitle={t('priorPracticeHint')}
            control={
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={priorHoursInput}
                  onChange={(e) => setPriorHoursInput(e.target.value)}
                  onBlur={() => {
                    const val = Math.floor(Math.max(0, Number(priorHoursInput) || 0));
                    setPriorHoursInput(String(val));
                    setPriorHours(val, firebaseBackend, userId).catch(console.error);
                  }}
                  className="w-20 text-right bg-transparent border-none text-sm text-gray-700 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:rounded-sm"
                />
                <span className="text-xs text-gray-400 dark:text-slate-500">hrs</span>
              </div>
            }
          />

          {/* === AI & VOICE === */}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "feat(prior-hours): add prior practice hours input in Settings Reports section

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: StatsReport — display the offset [model: sonnet]

**Files:**
- Modify: `src/components/StatsReport.jsx`

The prior hours offset is applied **only at the display layer** for the Total Practice Time row. `computeStats` and `stats.totalTime` remain untouched so that Average Daily Time is unaffected (it continues to use the raw in-app `stats.totalTime`).

- [ ] **Step 1: Add the import**

In `src/components/StatsReport.jsx`, add to the existing imports:
```js
import { getPriorHours } from '../services/priorPracticeService';
```

- [ ] **Step 2: Read `priorHours` in the component body**

Inside `StatsReport`, after `const { t } = useLanguage();` (line 10), add:
```js
const priorHours = getPriorHours();
```

This reads from localStorage on every render, so it picks up the latest value after the settings panel closes (which triggers a re-render of the parent App.jsx tree).

- [ ] **Step 3: Update the Total Practice Time row**

Find the existing Total Practice Time entry (line 30):
```js
        { label: t('stats.totalPracticeTime'), value: `${formatDuration(stats.totalTime, timeUnit)} ${t(timeUnit)}` },
```

Replace it with:
```js
        { label: t('stats.totalPracticeTime'), value: `${formatDuration(stats.totalTime + priorHours * 3600, timeUnit)} ${t(timeUnit)}`, sub: priorHours > 0 ? t('stats.priorIncluded', { hours: priorHours }) : null },
```

The `sub` field is already rendered by the existing row renderer (`{item.sub && <div className="text-xs ...">}`), so no UI changes are needed.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatsReport.jsx
git commit -m "feat(prior-hours): apply prior hours offset to Total Practice Time in Stats

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update CLAUDE.md [model: haiku]

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the new localStorage key to the UI preferences table**

In `CLAUDE.md`, find the localStorage table. The last row before the closing of the table is `drummate_compact_mode`. Add a new row after it:

```markdown
| `drummate_prior_hours` | integer string | `'0'` | prior practice hours offset added to lifetime total |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document drummate_prior_hours localStorage key

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Verification [model: sonnet]

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass including the 6 new `priorPracticeService` tests.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: no errors or warnings.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

Check the following:

1. **Stats tab, no prior hours set:** Total Practice Time shows only in-app time. No sub-line.
2. **Open Settings → Reports section:** "Prior Practice" row appears with subtitle "Hours you practiced before Drummate" and an input defaulting to `0`.
3. **Enter a value (e.g. 500) and blur the field:** Input normalises to `500`. localStorage key `drummate_prior_hours` is set (verify in DevTools → Application → Local Storage).
4. **Close Settings, go to Stats tab:** Total Practice Time now shows in-app + 500 hrs. Sub-line reads "incl. 500 hrs before Drummate".
5. **Average Daily Time is unchanged** — verify it still shows the same value as before entering prior hours.
6. **Switch to Chinese (Settings → Language → 中文):** Sub-line reads "含 Drummate 前 500 小时".
7. **Reload the page:** `drummate_prior_hours` survives; Stats still shows the offset.
8. **Enter 0 in Prior Practice input and blur:** Sub-line disappears from Stats.
9. **Enter a negative value (e.g. -5) and blur:** Input corrects to `0`.
10. **Enter a decimal (e.g. 99.7) and blur:** Input corrects to `99`.
