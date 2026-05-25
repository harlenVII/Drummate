# Keyboard Shortcuts Help Modal

**Date:** 2026-05-25
**Status:** Approved

## Overview

Add a `?` key toggle that shows/hides a modal listing all keyboard shortcuts. The modal excludes context-specific keys (←, →, Space, Tab) and follows the existing `PendingChangesModal` pattern.

## Trigger Key

`?` (Shift+/) — the GitHub/Gmail convention for keyboard help. Detected via `e.key === '?'` in the global `handleKeyDown` handler in `App.jsx`. Toggled: first press opens, second press closes. Escape and backdrop click also close.

## Component: `KeyboardShortcutsModal.jsx`

Follows `PendingChangesModal.jsx` structure exactly:

- `fixed inset-0 z-50` overlay with `bg-black/40 backdrop-blur-sm`
- White/dark card (`bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm`)
- Title bar, scrollable body, footer with Close button
- Backdrop click closes; Escape and `?` close via a `keydown` listener inside the component

**Props:** `isOpen: bool`, `onClose: () => void`

### Shortcuts shown (6 rows)

| Key(s) | Description |
|--------|-------------|
| `1` / `2` / `3` / `4` | Switch to Practice / Metronome / Report / Notes |
| `M` / `H` | Time unit: Minutes / Hours |
| `E` / `C` | Language: English / Chinese |
| `L` / `D` | Theme: Light / Dark |
| `S` | Stop active timer |
| `?` | Show / hide this help |

Keys render as `<kbd>`-style chips: `font-mono text-xs bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5 border border-gray-300 dark:border-slate-600`.

Multiple keys on one row (e.g. `1` / `2` / `3` / `4`) are rendered as individual chips separated by ` / `.

## State & Wiring in `App.jsx`

1. Add `const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)`
2. In `handleKeyDown`, add `else if (e.key === '?') setShowKeyboardHelp(prev => !prev)` — placed just before the `Tab` branch
3. Mount `<KeyboardShortcutsModal isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />` in App's JSX alongside the other modals

## i18n (`LanguageContext.jsx`)

Two new keys added to both `en` and `zh` translation objects:

| Key | English | Chinese |
|-----|---------|---------|
| `shortcuts.title` | `"Keyboard Shortcuts"` | `"键盘快捷键"` |
| `shortcuts.showHideHelp` | `"Show / hide this help"` | `"显示/隐藏此帮助"` |

All other row descriptions use plain inline strings (tab names, unit names, etc.) since no single reusable translation key maps cleanly to these shortcut descriptions.

## Out of Scope

- Context-specific shortcuts (←, →, Space, Tab, ↑/↓ in practice list) are intentionally omitted — they are tab/mode-dependent and would clutter the global list
- No animation beyond what the existing modal overlay provides
