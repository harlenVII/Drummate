# Keyboard Shortcuts Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?` key that toggles a modal listing all global keyboard shortcuts.

**Architecture:** New `KeyboardShortcutsModal` component (following `PendingChangesModal` pattern), two i18n keys in `LanguageContext`, and minimal wiring in `App.jsx` (one state, one key handler branch, one mount).

**Tech Stack:** React 19, Tailwind CSS v4, existing `LanguageContext` for translations.

---

## Files

| Action | Path |
|--------|------|
| Modify | `src/contexts/LanguageContext.jsx` |
| Create | `src/components/KeyboardShortcutsModal.jsx` |
| Modify | `src/App.jsx` |

---

### Task 1: Add i18n keys [model: haiku]

**Files:**
- Modify: `src/contexts/LanguageContext.jsx:56` (English `close` line), `:405` (Chinese `close` line)

- [ ] **Step 1: Add English translation keys**

In `src/contexts/LanguageContext.jsx`, find the English object near line 56 (`close: 'Close',`) and add the `shortcuts` block immediately after it:

```js
    close: 'Close',
    shortcuts: {
      title: 'Keyboard Shortcuts',
      showHideHelp: 'Show / hide this help',
    },
```

- [ ] **Step 2: Add Chinese translation keys**

Find the Chinese object near line 405 (`close: '关闭',`) and add the same block:

```js
    close: '关闭',
    shortcuts: {
      title: '键盘快捷键',
      showHideHelp: '显示/隐藏此帮助',
    },
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/LanguageContext.jsx
git commit -m "feat: add shortcuts i18n keys (en + zh)"
```

---

### Task 2: Create `KeyboardShortcutsModal.jsx` [model: sonnet]

**Files:**
- Create: `src/components/KeyboardShortcutsModal.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/KeyboardShortcutsModal.jsx` with the following content:

```jsx
import { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const SHORTCUTS = [
  { keys: ['1', '2', '3', '4'], descEn: 'Switch to Practice / Metronome / Report / Notes', descZh: '切换到练习 / 节拍器 / 报告 / 笔记' },
  { keys: ['M', 'H'],           descEn: 'Time unit: Minutes / Hours',                      descZh: '时间单位：分钟 / 小时' },
  { keys: ['E', 'C'],           descEn: 'Language: English / Chinese',                      descZh: '语言：英文 / 中文' },
  { keys: ['L', 'D'],           descEn: 'Theme: Light / Dark',                              descZh: '主题：浅色 / 深色' },
  { keys: ['S'],                descEn: 'Stop active timer',                                descZh: '停止计时器' },
  { keys: ['?'],                descEn: null,                                               descZh: null },
];

function Kbd({ label }) {
  return (
    <kbd className="font-mono text-xs bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200">
      {label}
    </kbd>
  );
}

function KeyboardShortcutsModal({ isOpen, onClose }) {
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
          <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-gray-800 dark:text-slate-100">
            {t('shortcuts.title')}
          </h2>
        </div>

        <div className="px-5 py-3">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map(({ keys, descEn, descZh }) => {
                const desc = descEn === null
                  ? t('shortcuts.showHideHelp')
                  : (language === 'zh' ? descZh : descEn);
                return (
                  <tr key={keys.join('+')} className="border-b border-gray-100 dark:border-slate-700 last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className="text-gray-400 dark:text-slate-500 mx-1">/</span>}
                          <Kbd label={k} />
                        </span>
                      ))}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-slate-300">{desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/KeyboardShortcutsModal.jsx
git commit -m "feat: add KeyboardShortcutsModal component"
```

---

### Task 3: Wire into App.jsx [model: haiku]

**Files:**
- Modify: `src/App.jsx`

Three targeted edits:

- [ ] **Step 1: Import the modal**

Near line 29 where `PendingChangesModal` is imported, add:

```js
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
```

- [ ] **Step 2: Add state**

Near line 330 where `pendingModalOpen` state is declared, add:

```js
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
```

- [ ] **Step 3: Add `?` key handler**

In `handleKeyDown` (around line 1453), add a new branch **before** the `else if (e.key === 'Tab')` line:

```js
      else if (e.key === '?') setShowKeyboardHelp(prev => !prev)
```

So the surrounding context looks like:

```js
      else if (e.code === 'KeyS') {
        if (activeItemIdRef.current != null) saveAndStop();
      }
      else if (e.key === '?') setShowKeyboardHelp(prev => !prev)
      else if (e.key === 'Tab') {
```

- [ ] **Step 4: Mount the modal**

Near line 1863 where `<PendingChangesModal>` is mounted, add the new modal directly after it:

```jsx
      <KeyboardShortcutsModal
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire KeyboardShortcutsModal into App — ? key toggles shortcut help"
```

---

### Task 4: Build verification [model: haiku]

**Files:** none modified

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: exits with code 0, no TypeScript/ESLint errors, `dist/` produced.

- [ ] **Step 2: Manual smoke test**

```bash
npm run dev
```

Open `http://localhost:5173`. Verify:
1. Press `?` — modal appears with 6 rows of shortcuts
2. Press `?` again — modal closes
3. Press `Escape` while modal is open — modal closes
4. Click the backdrop — modal closes
5. Click the Close button — modal closes
6. Press `?` while focused in an `<input>` (e.g. add-item field) — modal does NOT open
7. Toggle dark mode (`D`) — modal renders correctly in dark
8. Toggle language (`C`) — descriptions switch to Chinese; toggle back (`E`) — English restored

- [ ] **Step 3: Commit build verification**

No files changed. If build or smoke test revealed issues, fix them and commit with `fix:` prefix before closing out.
