# Night Mode Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-05-24

## Summary

Add a user-controlled night mode to Drummate. Manual-only toggle (Light / Dark) in Settings, with `L` / `D` keyboard shortcuts. Soft-dark palette built on Tailwind's slate scale. Preference persists in localStorage.

## Motivation

The current all-white background is too bright in low-light environments (typical practice settings, late-night sessions). Users need a dark theme they can switch to.

## Non-goals (YAGNI)

- No "follow system" option, no auto-by-time-of-day, no scheduled switching.
- No per-tab themes, no theme transitions/animations (instant swap).
- No theme-aware favicon or PWA manifest update.
- No theming of AI-generated content inside `EncouragementModal` — just its container.

## Mechanics

### Storage

- New localStorage key: `drummate_theme`, values `'light' | 'dark'`. Default `'light'`.
- Mirrors the existing `drummate_language` / `drummate_timezone` / `drummate_goal` pattern (plain string, read on mount, written on change).

### Activation

Tailwind v4 class-based dark variant declared once in [src/index.css](../../src/index.css):

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The `dark` class is toggled on the `<html>` element when the theme is dark. All Tailwind `dark:` utilities cascade from there.

### Service module

New file `src/services/themeService.js`, mirroring the shape of `offlineService.js` and `timezoneService.js`:

- `getTheme(): 'light' | 'dark'` — synchronous getter reading the module-level cache.
- `setTheme(t)` — updates the cache, writes localStorage, calls `applyTheme(t)`.
- `applyTheme(t)` — adds or removes the `dark` class on `document.documentElement`.
- Module-load init: read `drummate_theme` from localStorage into the cache and apply once, so the class is on `<html>` before React mounts (avoids a light-flash on dark-mode reload).

### React state

`App.jsx`:

- New state: `const [theme, setThemeState] = useState(getTheme)`.
- Wrapped setter `setTheme(t)` calls `themeService.setTheme(t)` then `setThemeState(t)`. Passed down to `SettingsPanel`.
- No effect needed to sync the html class — the service does that synchronously inside `setTheme`.

### Keyboard shortcuts

Add to the existing keydown handler in `App.jsx` (blocked when focus is in an input/textarea, same as the current shortcuts):

| Key | Action |
|-----|--------|
| `L` | `setTheme('light')` |
| `D` | `setTheme('dark')` |

Pattern matches the existing `M`/`H` (time unit) and `E`/`C` (language) shortcuts. Neither key conflicts with current bindings (`1`/`2`/`3`/`4`, `Tab`, arrows, `M`, `H`, `E`, `C`, `S`).

Add to the keyboard shortcut table in [CLAUDE.md](../../CLAUDE.md) when implementing.

### Settings UI

New row in `SettingsPanel.jsx`, placed near the Language and Timezone rows:

- Label: `t('settings.theme')` ("Theme" / "主题").
- Control: two-button segmented toggle, Light / Dark.
- Active button uses the existing settings-control active style; inactive uses the inactive style. Both must theme correctly (`bg-white dark:bg-slate-800` etc.).

### Translations

Add to both `en` and `zh` in `LanguageContext.jsx`:

- `settings.theme` → "Theme" / "主题"
- `settings.themeLight` → "Light" / "浅色"
- `settings.themeDark` → "Dark" / "深色"

## Color system

Palette (Tailwind slate):

| Role | Light | Dark |
|---|---|---|
| App background | `white` / `slate-50` | `slate-900` (#0f172a) |
| Surface (cards, modals) | `white` | `slate-800` |
| Border | `slate-200` | `slate-700` |
| Primary text | `slate-900` | `slate-100` |
| Muted text | `slate-500` / `slate-600` | `slate-400` |
| Accent (existing blues/greens) | unchanged | same hue, one shade lighter for contrast on dark surface |

Applied via Tailwind's `dark:` modifier on each class — e.g. `bg-white dark:bg-slate-800`. No CSS-variable indirection. Matches the existing all-Tailwind styling rule from CLAUDE.md.

### Audit scope

Every component file with hardcoded `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, `divide-gray-*`, etc. gets `dark:` siblings added. Specifically:

- All tab content: `PracticeItemList`, `MetronomePage` + subviews, `DailyReport` / `WeeklyReport` / `MonthlyReport` / `YearlyReport` / `StatsReport`, `NotesPage` / `NotesByDate` / `NotesByItem`.
- All modals: `NoteEditModal`, `GoalSetupModal`, `ReportGeneratorModal`, `EncouragementModal` (container only), `PendingChangesModal`, any confirmation modals.
- Shell components: `App.jsx` root, tab bar, `OfflineBanner` (amber stays, but text/border may need a darker variant), the sync overlay, `FloatingPracticeWidget`, `FloatingVoiceIndicator`.
- Cards: `GoalCard`, `GoalBanner`.
- Metronome visualizations: lit beat colors stay vivid (visibility > theme cohesion); unlit backgrounds change.

## Testing

- `npm run build` succeeds.
- Manual switch via Settings: every tab and modal renders correctly in both themes.
- Keyboard shortcut `L` / `D` toggles theme; blocked when typing in any input/textarea.
- Refresh in dark mode: `<html>` already has the `dark` class on first paint (no light-flash).
- Translation toggle works in both themes.
- Offline banner and sync overlay readable in dark mode.
- Metronome beat indicators visible in dark mode.
