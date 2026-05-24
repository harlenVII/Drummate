# Night Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled night mode (Light / Dark) toggle to Drummate, switchable from Settings or the `L` / `D` keyboard shortcuts, persisted to localStorage.

**Architecture:** New `themeService.js` (mirrors `timezoneService.js` / `offlineService.js`) owns the in-memory cache + localStorage I/O. Tailwind v4's `@custom-variant dark` is wired so a `dark` class on `<html>` flips every `dark:`-prefixed utility. `App.jsx` holds React state, exposes a setter, and adds the keyboard shortcut. Every component using hardcoded `bg-white` / `bg-gray-*` / `text-gray-*` / `border-gray-*` gets a `dark:` sibling.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, localStorage.

**Spec:** [docs/superpowers/specs/2026-05-24-night-mode-design.md](../specs/2026-05-24-night-mode-design.md)

---

## Conventions used in this plan

**Canonical color translation table** — apply consistently in every audit task:

| Light class | Add dark sibling |
|---|---|
| `bg-white` | `dark:bg-slate-800` |
| `bg-gray-50` | `dark:bg-slate-900` |
| `bg-gray-100` | `dark:bg-slate-800` |
| `bg-gray-200` | `dark:bg-slate-700` |
| `bg-gray-300` (toggle off-state) | `dark:bg-slate-600` |
| `text-gray-900` / `text-gray-800` | `dark:text-slate-100` |
| `text-gray-700` | `dark:text-slate-200` |
| `text-gray-600` / `text-gray-500` | `dark:text-slate-400` |
| `text-gray-400` | `dark:text-slate-500` |
| `border-gray-100` | `dark:border-slate-800` |
| `border-gray-200` / `border-gray-300` | `dark:border-slate-700` |
| `divide-gray-200` | `dark:divide-slate-700` |
| `shadow-xl` / `shadow-sm` (white-card shadows) | leave as-is; shadows still read on dark |
| Accent colors (`bg-blue-600`, `bg-amber-500`, `text-red-600`, etc.) | leave as-is unless audit shows readability issue; if so, bump one shade lighter for dark (e.g. `dark:text-red-400`) |

**Verification pattern** — most tasks end by running the dev server and visually checking the changed surface in both themes:

```bash
npm run dev
# open http://localhost:5173
# in DevTools console: document.documentElement.classList.toggle('dark')
# verify the surface looks correct in both states
```

The project has no automated test suite. Each task that touches code ends with `npm run build` to catch build errors before commit.

---

## Task 1: Create themeService  [model: haiku]

**Files:**
- Create: `src/services/themeService.js`

- [ ] **Step 1: Write the service**

Content for `src/services/themeService.js`:

```javascript
const STORAGE_KEY = 'drummate_theme';
const DEFAULT_THEME = 'light';
const VALID = new Set(['light', 'dark']);

function readCache() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v && VALID.has(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
}

function applyTheme(theme) {
  try {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  } catch {
    // SSR / no document; ignore
  }
}

let currentTheme = readCache() ?? DEFAULT_THEME;

// Apply once at module load so the class is on <html> before React mounts.
// This prevents a light-flash when reloading in dark mode.
applyTheme(currentTheme);

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  if (!VALID.has(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }
  currentTheme = theme;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
}
```

- [ ] **Step 2: Smoke check by build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/themeService.js
git commit -m "$(cat <<'EOF'
feat: add themeService for light/dark mode

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire the Tailwind dark variant and import the service early  [model: haiku]

**Files:**
- Modify: `src/index.css`
- Modify: `src/main.jsx`

- [ ] **Step 1: Add the `@custom-variant` directive to `src/index.css`**

After the `@import "tailwindcss";` line at the top of the file, add a blank line then:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The full file head should read:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* Lock viewport — prevent page-level scroll & overscroll bounce */
html, body {
  ...
```

- [ ] **Step 2: Import the service in `src/main.jsx`**

`themeService` applies the theme at module load. Importing it early (before App) ensures the `dark` class is on `<html>` before React renders, so there is no light-mode flash on reload.

Open `src/main.jsx`. Find the existing import block (top of file). Add this import alongside other side-effect-only or service imports — exact placement: right after the React/ReactDOM imports, before `import App`:

```javascript
import './services/themeService.js';
```

The `import` has no bound name because the module's side effect (applying the cached theme) is the whole point.

- [ ] **Step 3: Verify the wiring**

Run: `npm run build`
Expected: build succeeds.

Then:

```bash
npm run dev
```

Open http://localhost:5173. In DevTools console:

```javascript
document.documentElement.classList.add('dark')
```

Expected: nothing visible changes yet (no `dark:` utilities used anywhere) — this just confirms no error. Run:

```javascript
localStorage.setItem('drummate_theme', 'dark')
location.reload()
```

After reload, in console run: `document.documentElement.classList.contains('dark')` — expected `true`. Reset with `localStorage.removeItem('drummate_theme')` and reload.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/main.jsx
git commit -m "$(cat <<'EOF'
feat: wire Tailwind dark variant and load themeService early

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add theme translations  [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

- [ ] **Step 1: Add `en` keys**

Translations are flat top-level keys in this file (see existing `settings: 'Settings'`, `language: 'Language'`, `timezone: 'Timezone'` at lines 204–206). Add three more keys, immediately after the `timezone` line in the `en` block:

```javascript
    settings: 'Settings',
    language: 'Language',
    timezone: 'Timezone',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
```

- [ ] **Step 2: Add `zh` keys**

Find the corresponding `zh` block (search for `settings: '设置'`, around line 550). Add the three matching keys immediately after `timezone` in the same way:

```javascript
    settings: '设置',
    language: '语言',
    timezone: '时区',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
```

(If `language` or `timezone` zh values differ from above, leave the existing ones — only add the three new theme keys.)

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "$(cat <<'EOF'
feat: add theme translations (en, zh)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add theme state, setter, and keyboard shortcut in App.jsx  [model: sonnet]

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import the service**

Near the top of `src/App.jsx` with the other `./services/*` imports, add:

```javascript
import { getTheme, setTheme as setThemeService } from './services/themeService';
```

- [ ] **Step 2: Add React state**

In the `App` component body, alongside other top-level `useState` calls (search for `useState(getTimezone)` or similar — group it near other settings-like state), add:

```javascript
  const [theme, setThemeState] = useState(getTheme);
```

- [ ] **Step 3: Add the wrapped setter**

Near other top-level callbacks in the component (e.g. close to where `toggleLanguage` or `setTimeUnit` setters live), add:

```javascript
  const setTheme = useCallback((next) => {
    setThemeService(next);
    setThemeState(next);
  }, []);
```

Make sure `useCallback` is in the React import at the top of the file — it almost certainly already is, but verify.

- [ ] **Step 4: Add `L` and `D` keyboard shortcuts**

Open `src/App.jsx` and locate the keyboard handler at lines 1434–1504 (the `handleKeyDown` function inside the keyboard `useEffect`). Find the existing `KeyE` / `KeyC` language shortcut block:

```javascript
      else if (e.code === 'KeyE') { if (languageRef.current !== 'en') toggleLanguage(); }
      else if (e.code === 'KeyC') { if (languageRef.current !== 'zh') toggleLanguage(); }
```

Add two new lines immediately after, before the `KeyS` block:

```javascript
      else if (e.code === 'KeyL') setTheme('light');
      else if (e.code === 'KeyD') setTheme('dark');
```

The resulting block reads:

```javascript
      else if (e.code === 'KeyE') { if (languageRef.current !== 'en') toggleLanguage(); }
      else if (e.code === 'KeyC') { if (languageRef.current !== 'zh') toggleLanguage(); }
      else if (e.code === 'KeyL') setTheme('light');
      else if (e.code === 'KeyD') setTheme('dark');
      else if (e.code === 'KeyS') {
```

Then update the `useEffect` dependency array at line 1504 to include `setTheme`:

```javascript
  }, [handleTabChange, handleSubpageChange, setReportSubpage, handleReportDateChange, handleWeekChange, handleMonthChange, handleYearChange, toggleLanguage, saveAndStop, setTheme]);
```

- [ ] **Step 5: Pass `theme` and `setTheme` to `SettingsPanel`**

Search `src/App.jsx` for `<SettingsPanel`. Add two props to the JSX (alongside existing props):

```javascript
        theme={theme}
        onThemeChange={setTheme}
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: build succeeds.

Then:

```bash
npm run dev
```

In the browser, press `D` — in DevTools console, run `document.documentElement.classList.contains('dark')` — expected `true`. Press `L` — same check should return `false`. Click into a text input and press `D` — class should NOT change (input-focus guard still works).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat: wire theme state and L/D keyboard shortcuts in App

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add theme toggle row to SettingsPanel and dark-style the panel itself  [model: sonnet]

**Files:**
- Modify: `src/components/SettingsPanel.jsx`

- [ ] **Step 1: Accept the new props**

At the top of the component, add `theme` and `onThemeChange` to the destructured props (next to `language`, `onLanguageChange`, etc.).

- [ ] **Step 2: Add the theme row**

Locate the existing Language row (around lines 142–162 — a `<div>` with `<span>{t('language')}</span>` and a segmented toggle inside `<div className="flex bg-gray-200 rounded-lg p-1 gap-1">`). Use it as the template.

Add a new theme row immediately after the Language row, before the Timezone row. The structure is:

```jsx
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{t('theme')}</span>
            <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
              {['light', 'dark'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => onThemeChange(mode)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    theme === mode
                      ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  {t(mode === 'light' ? 'themeLight' : 'themeDark')}
                </button>
              ))}
            </div>
          </div>
```

(If the surrounding rows use different spacing / class names, mirror those exactly — the snippet above matches the Language row at SettingsPanel.jsx:142.)

- [ ] **Step 3: Dark-style the panel container and existing rows**

Open the file and apply the canonical color translation table from the top of this plan to every existing `bg-white` / `bg-gray-*` / `text-gray-*` / `border-gray-*` class in the file. The most important ones:

- Line 109 panel root: `bg-white` → `bg-white dark:bg-slate-900`
- Line 114 header divider: `border-gray-200` → `border-gray-200 dark:border-slate-700`
- Line 115 `<h2>`: `text-gray-800` → `text-gray-800 dark:text-slate-100`
- Line 118 close-button: `text-gray-400 hover:text-gray-600` → `text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300`
- Line 128 user row: `border-gray-100` → `border-gray-100 dark:border-slate-800`
- Line 134 user name: `text-gray-800` → `text-gray-800 dark:text-slate-100`
- Line 136 user email: `text-gray-500` → `text-gray-500 dark:text-slate-400`
- All toggle-row labels (`text-gray-700`) → add `dark:text-slate-200`
- All segmented-toggle inactive states (`text-gray-500`) → add `dark:text-slate-400`
- All `bg-gray-200` segmented containers → add `dark:bg-slate-700`
- All segmented active states (`bg-white text-gray-800`) → add `dark:bg-slate-800 dark:text-slate-100`
- All toggle off-states (`bg-gray-300`) → add `dark:bg-slate-600`
- The toggle knob (`bg-white shadow`) → leave (the knob should stay white in both themes for affordance)
- All description text (`text-gray-400`) → add `dark:text-slate-500`
- All `border-t border-gray-200` section dividers → add `dark:border-slate-700`

- [ ] **Step 4: Verify in browser**

Run `npm run dev`. Open Settings panel. Use `D` / `L` to toggle theme — every text element should remain readable in both modes, the new Theme row works, and selecting Light / Dark from the new toggle changes the html class.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.jsx
git commit -m "$(cat <<'EOF'
feat: add theme toggle row and dark-mode styling to SettingsPanel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Dark-style the shell (App root, TabBar, banners, overlays, widgets)  [model: sonnet]

**Files (apply canonical translation table to each):**
- Modify: `src/App.jsx` — the JSX render block only (root container, sync overlay, anywhere the App component renders background/border/text classes directly)
- Modify: `src/components/TabBar.jsx`
- Modify: `src/components/OfflineBanner.jsx`
- Modify: `src/components/FloatingPracticeWidget.jsx`
- Modify: `src/components/FloatingVoiceIndicator.jsx`

- [ ] **Step 1: Audit each file**

For each file in the list, run:

```bash
grep -nE "bg-white|bg-gray-|text-gray-|border-gray-|divide-gray-" <file>
```

Apply the canonical translation table from the top of this plan to every match. Do NOT touch:
- Accent colors (`bg-blue-*`, `bg-amber-*`, `bg-red-*`, etc.) unless visibly unreadable in dark
- Inline-button knobs (white circles in toggles)
- Tab icons / SVG fill colors that already come from a tinted accent

The amber `OfflineBanner` (`bg-amber-*`) stays amber in both themes — it's a status indicator and should pop. If its text (`text-amber-900` or similar) reads poorly on the same amber in dark mode, add a `dark:text-amber-100` only after a visual check confirms a problem; otherwise leave it.

The sync overlay (search `src/App.jsx` for "syncing" or "sync" overlay JSX — usually a fixed-position div over the app) needs its card surface darkened: `bg-white` → `dark:bg-slate-800`, and any text inside.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. Toggle dark mode (Settings → Dark or press `D`). Walk through:
- App background (visible at tab edges) — dark
- Tab bar — dark, icons visible, active tab still highlighted
- Trigger offline mode (Settings → Offline mode) — banner still amber and readable; "Go online" link still visible
- Start a timer, switch tabs — `FloatingPracticeWidget` pill visible against dark background
- (If you can trigger voice listening) `FloatingVoiceIndicator` readable

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/TabBar.jsx src/components/OfflineBanner.jsx src/components/FloatingPracticeWidget.jsx src/components/FloatingVoiceIndicator.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for app shell, tab bar, banner, and floating widgets

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Dark-style the Practice tab  [model: sonnet]

**Files:**
- Modify: `src/components/PracticePage.jsx`
- Modify: `src/components/PracticeItemList.jsx`
- Modify: `src/components/PracticeRunView.jsx`
- Modify: `src/components/PracticeEditModal.jsx`
- Modify: `src/components/EditTimeModal.jsx`
- Modify: `src/components/MergeTargetPicker.jsx`
- Modify: `src/components/GoalBanner.jsx`

- [ ] **Step 1: Audit each file**

For each file:

```bash
grep -nE "bg-white|bg-gray-|text-gray-|border-gray-|divide-gray-" <file>
```

Apply the canonical translation table. Specific concerns:

- `PracticeItemList`: practice item rows, category section headers (`text-gray-500 uppercase` or similar) — make sure both stay visible. Drag handles often use a muted gray — bump to `dark:text-slate-500`.
- `PracticeRunView`: the large timer numeral and item name. Ensure both render bright on dark.
- `PracticeEditModal` / `EditTimeModal` / `MergeTargetPicker`: full modal — backdrop usually fine, but card (`bg-white`) and inputs need dark variants. Input borders: `border-gray-300` → add `dark:border-slate-600`; input background (often implicit white) — add `dark:bg-slate-700 dark:text-slate-100`.
- `GoalBanner`: the compact strip at the top of the Practice tab. Whatever background it currently uses needs a dark sibling.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. In dark mode:
- Practice tab list renders cleanly, all items readable
- Tap an item to start practicing → `PracticeRunView` overlay is dark and readable
- Open Edit mode → reorder, archive, trash buttons visible
- Open `PracticeEditModal` (rename / merge an item) → modal card is dark, inputs are dark, all text readable
- `EditTimeModal` (from Daily report Edit) — repeat the check
- If a goal is set, `GoalBanner` at top of Practice tab is readable

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticePage.jsx src/components/PracticeItemList.jsx src/components/PracticeRunView.jsx src/components/PracticeEditModal.jsx src/components/EditTimeModal.jsx src/components/MergeTargetPicker.jsx src/components/GoalBanner.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for Practice tab and related modals

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Dark-style the Metronome tab  [model: sonnet]

**Files:**
- Modify: `src/components/Metronome.jsx`
- Modify: `src/components/SequencerPage.jsx`
- Modify: `src/components/MultiMeterPage.jsx`
- Modify: `src/components/BeatIndicator.jsx`
- Modify: `src/components/BpmDial.jsx`
- Modify: `src/components/SubdivisionIcon.jsx`

- [ ] **Step 1: Audit each file**

For each file, run the same grep and apply the canonical translation table.

Specific concerns:

- `BeatIndicator`: lit beat colors (`bg-blue-500` / `bg-orange-400` or whatever the accent is) stay vivid — DO NOT add dark variants to lit states. Only the *unlit* background (`bg-gray-200` → `dark:bg-slate-700`) and the surrounding container change.
- `BpmDial`: the dial track (`bg-gray-200`) and tick marks need dark variants. The dial fill (an accent) stays. Numeric BPM text → `dark:text-slate-100`.
- `SubdivisionIcon`: SVG `stroke` / `fill` classes — if they use `text-gray-*`, add dark variants. Pure-color SVG attributes (`stroke="#000"`) need to be replaced with `currentColor` and a Tailwind text color so dark mode can recolor them. Spot-check first; only refactor a hardcoded color if the icon visibly breaks in dark mode.
- `Metronome` / `SequencerPage` / `MultiMeterPage`: containers, control labels, buttons. Sliders / range inputs use OS-native styling; if they look harsh in dark mode, that's a separate ticket — leave them for now.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. Switch to Metronome tab. In dark mode:
- All four metronome subpages (Metronome / Practice / Sequencer / MultiMeter — cycle with Tab) are readable
- Start the metronome — lit beats are still vivid and easy to see against the now-dark unlit background
- BPM dial is usable and readable
- Subdivision icons in the selector are visible

- [ ] **Step 4: Commit**

```bash
git add src/components/Metronome.jsx src/components/SequencerPage.jsx src/components/MultiMeterPage.jsx src/components/BeatIndicator.jsx src/components/BpmDial.jsx src/components/SubdivisionIcon.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for Metronome tab and beat indicators

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Dark-style the Report tab  [model: sonnet]

**Files:**
- Modify: `src/components/DailyReport.jsx`
- Modify: `src/components/WeeklyReport.jsx`
- Modify: `src/components/MonthlyReport.jsx`
- Modify: `src/components/YearlyReport.jsx`
- Modify: `src/components/StatsReport.jsx`
- Modify: `src/components/GoalCard.jsx`
- Modify: `src/components/GoalSetupModal.jsx`
- Modify: `src/components/ReportGeneratorModal.jsx`

- [ ] **Step 1: Audit each file**

For each file, run the same grep and apply the canonical translation table.

Specific concerns:

- All four time-window reports (`DailyReport` / `WeeklyReport` / `MonthlyReport` / `YearlyReport`) share visual style — totals card, item breakdown rows, date navigation chevrons. Apply identically.
- `StatsReport`: large stat tiles, streak block. Strong-color accent badges stay.
- `GoalCard`: progress bar background (`bg-gray-200` → `dark:bg-slate-700`); progress bar fill (accent) stays. "Required daily average" callout text → dark variant.
- `GoalSetupModal` / `ReportGeneratorModal`: full modals — card, inputs, date pickers. Date picker (`<input type="date">`) is native; if it looks bad in dark, leave it.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. Switch to Report tab. In dark mode, cycle through all five subpages (`Tab` key): Daily, Weekly, Monthly, Yearly, Stats. Each should be readable. Open the Stats tab's "Generate Report" button → modal is dark. Open / create a goal via `GoalSetupModal` → modal is dark.

- [ ] **Step 4: Commit**

```bash
git add src/components/DailyReport.jsx src/components/WeeklyReport.jsx src/components/MonthlyReport.jsx src/components/YearlyReport.jsx src/components/StatsReport.jsx src/components/GoalCard.jsx src/components/GoalSetupModal.jsx src/components/ReportGeneratorModal.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for Report tab and goal/report modals

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Dark-style the Notes tab  [model: sonnet]

**Files:**
- Modify: `src/components/NotesPage.jsx`
- Modify: `src/components/NotesByDate.jsx`
- Modify: `src/components/NotesByItem.jsx`
- Modify: `src/components/NoteEditModal.jsx`

- [ ] **Step 1: Audit each file**

For each file, run the same grep and apply the canonical translation table.

Specific concerns:

- `NotesByDate`: chronological feed cards. Date headers (often `text-gray-500`) get dark variant.
- `NotesByItem`: accordion sections grouped by category. Section headers and item rows.
- `NoteEditModal`: textarea — `bg-white text-gray-900 border-gray-300` → add `dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600`. The "Delete" button (red) stays red; the cancel/save buttons need dark variants matching their surrounding card.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. Switch to Notes tab. In dark mode:
- By Date view readable; if there are notes, both date headers and note bodies render
- By Item view readable; section accordion looks correct expanded and collapsed
- Open `NoteEditModal` to add a new note: dropdown, date picker, textarea all readable. Edit an existing note: textarea readable, Delete button still red.

- [ ] **Step 4: Commit**

```bash
git add src/components/NotesPage.jsx src/components/NotesByDate.jsx src/components/NotesByItem.jsx src/components/NoteEditModal.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for Notes tab and note edit modal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Dark-style remaining modals and screens  [model: sonnet]

**Files:**
- Modify: `src/components/PendingChangesModal.jsx`
- Modify: `src/components/EncouragementModal.jsx`
- Modify: `src/components/EncouragementButton.jsx`
- Modify: `src/components/AuthScreen.jsx`

- [ ] **Step 1: Audit each file**

For each file, run the same grep and apply the canonical translation table.

Specific concerns:

- `PendingChangesModal`: list of pending sync actions. Each row, divider lines.
- `EncouragementModal`: container card gets dark variant. The AI-generated message text inside is just text — `dark:text-slate-100` on the body container is fine. Don't try to style markdown if any.
- `EncouragementButton`: button background and text.
- `AuthScreen`: the login screen shown when not authenticated. Apply translation table — note the Google sign-in button is brand-styled (white) and should stay as-is; only the surrounding card / page background and headline text get dark variants.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify**

Run `npm run dev`. In dark mode:
- Open Settings → Pending changes (this requires being in offline mode with some pending actions). Modal readable.
- Open Encouragement modal (button in Practice or Stats — wherever `EncouragementButton` lives). Container dark, body text readable.
- Sign out (Settings → Sign out) to see `AuthScreen` in dark mode — page background dark, headline readable, Google button untouched.

- [ ] **Step 4: Commit**

```bash
git add src/components/PendingChangesModal.jsx src/components/EncouragementModal.jsx src/components/EncouragementButton.jsx src/components/AuthScreen.jsx
git commit -m "$(cat <<'EOF'
feat: dark-mode styling for pending changes, encouragement, and auth screens

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update CLAUDE.md keybindings table and final verification sweep  [model: sonnet]

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add L and D rows to the keyboard shortcuts table**

Open `CLAUDE.md` and find the "Keyboard Shortcuts (App.jsx)" section. The table currently ends with:

```markdown
| `S` | Stop the active practice timer (no-op if no timer running) |
```

Add two new rows after it (and keep the table aligned):

```markdown
| `L` / `D` | Switch theme to Light / Dark |
```

(One combined row matches the style of the existing `M` / `H` and `E` / `C` rows.)

- [ ] **Step 2: Add a Common Gotcha entry about theme init order**

Find the "Common Gotchas" numbered list. Add a new entry at the end:

```markdown
25. **Theme is applied before React mounts** — `src/services/themeService.js` reads `drummate_theme` from localStorage and applies the `dark` class to `<html>` at module load. `src/main.jsx` imports this module before `App` so the class is set before first paint, avoiding a light-flash on reload in dark mode. Do not move this import below `App`, and do not gate `applyTheme` behind React state.
```

- [ ] **Step 3: Final full-app verification pass**

This is the last task — do a thorough manual sweep before committing.

Run `npm run build`. Expected: succeeds.

Run `npm run dev`. Toggle dark mode via Settings → Dark. Then walk through every tab and modal that this plan touched:

- [ ] Practice tab: items list (active section, archived section, trash), edit mode, add item, start a timer, `PracticeRunView`, edit modal, merge picker, edit-time modal, goal banner (if a goal is set)
- [ ] Metronome tab: all four subpages, start playback, change BPM, change subdivisions, switch sequencer slots
- [ ] Report tab: all five subpages (cycle with Tab), arrow-key navigation between dates, daily report Edit mode, "Merge today's practice to yesterday" button visible (if today has logs)
- [ ] Notes tab: both subpages, create new note modal, edit existing note modal, delete confirmation
- [ ] Settings: every row readable, Theme toggle switches state, Language toggle still works, Timezone dropdown readable
- [ ] Offline mode toggle → banner readable → pending changes modal readable → go online (or stay offline with toast)
- [ ] Encouragement modal (if AI Coach enabled)
- [ ] Sign out → AuthScreen → sign back in
- [ ] Reload the page in dark mode — no light-flash before app renders
- [ ] Switch to light mode via the toggle — every surface reverts cleanly
- [ ] Press `L` and `D` in various contexts — switches theme except when typing in inputs

If any surface looks broken (unreadable text, blown-out white card, missing border), apply the canonical translation table to that file and add to this task's commit.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document night mode shortcuts and theme init gotcha

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

If the verification pass uncovered any missed component, fix it and create one more commit:

```bash
git add <files>
git commit -m "$(cat <<'EOF'
fix: dark-mode polish for <surfaces uncovered during final pass>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Done

Twelve tasks, each producing a buildable, visually-verifiable commit. The first three are foundation (service, CSS wiring, translations). Tasks 4 and 5 wire state and add the toggle. Tasks 6–11 are the color audit, partitioned by surface area so they can be executed independently or in parallel. Task 12 documents the changes and does the full-app sweep.
