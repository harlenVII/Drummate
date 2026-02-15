# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drummate is a Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js (IndexedDB).

**Read [DEVELOPMENT.md](./DEVELOPMENT.md) first** for comprehensive project documentation, completed phases, and future roadmap.

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server at http://localhost:5173
npm run build            # Production build (always test before committing)
npm run preview          # Preview production build
npm run lint             # Run ESLint
```

**Critical:** Always run `npm run build` after changes to verify the build succeeds.

## Architecture Overview

### Global State Management (App.jsx)

All state lives in `App.jsx` and is passed down as props. No external state management library.

**Practice State:**
- `items`, `totals`, `activeItemId`, `elapsedTime`, `editing`
- Timer refs: `intervalRef`, `startTimeRef`, `activeItemIdRef`

**Metronome/Sequencer State:**
- `metronomeBpm`, `metronomeIsPlaying`, `metronomeCurrentBeat`, `metronomeTimeSignature`, `metronomeSubdivision`, `metronomeSoundType`
- `metronomeSubpage` - toggles between 'metronome' and 'sequencer' views
- `sequencerSlots`, `sequencerPlayingSlot`, `sequencerNextIdRef`
- Singleton refs: `metronomeEngineRef` (audio engine), `noSleepRef` (prevents screen lock)

**Report State:**
- `reportDate`, `reportLogs`

**Key Pattern:** Metronome/sequencer state persists when switching tabs. The audio engine is initialized once on mount and destroyed only on unmount.

### Audio Engine (metronomeEngine.js)

`MetronomeEngine` class handles all audio playback via Web Audio API + Web Worker.

**Dual Modes:**
1. **Normal metronome mode:** Single `subdivisionPattern` applied to all beats
2. **Sequence mode:** Array of patterns (`sequencePatterns`), one per beat slot

**Key Methods:**
- `start()` / `stop()` - Control playback
- `setBPM(bpm)` - Update tempo
- `setTimeSignature(beats, noteValue)` - Change time signature
- `setSubdivision(pattern)` - Set subdivision pattern (normal mode)
- `setSequence(patterns)` - Enable sequence mode with array of patterns
- `setSoundType(type)` - Change click sound ('click', 'woodBlock', 'hiHat', 'rimshot', 'beep')

**Callbacks:**
- `onBeat({ beat, subdivisionIndex })` - Fired for each scheduled note (used for UI beat indicators)
- `onSequenceBeat(slotIndex)` - Fired when sequence advances to next slot (used for sequencer UI)

**Implementation Details:**
- Lookahead scheduler: 25ms wake-up interval, 100ms lookahead window
- Web Worker at `/metronome-worker.js` (must be in `public/` folder)
- Subdivision patterns are arrays of integers (0 = quarter note, 1 = eighth, 2 = triplet, 3 = sixteenth)
- Rest beats use special pattern `[-1]` (no sound)

### Database Layer (database.js)

Dexie.js wrapper around IndexedDB. Database name: `DrummateDB`, version 2.

**Tables:**
- `practiceItems` - Schema: `'++id, name'`
- `practiceLogs` - Schema: `'++id, itemId, date, duration'`

**All operations are async/await.** Date strings always use `YYYY-MM-DD` format (from `dateHelpers.js`).

**Key Functions:**
- `getItems()`, `addItem(name)`, `renameItem(id, newName)`, `deleteItem(id)`
- `addLog(itemId, duration, date?)` - Date defaults to today if not provided
- `getTodaysLogs()`, `getLogsByDate(dateString)`

**Cascade Delete:** Deleting a practice item automatically deletes all its logs.

### Internationalization (LanguageContext.jsx)

React Context providing `t(key)` function for translations.

**Usage:**
```jsx
const { t, language, toggleLanguage } = useLanguage();
<button>{t('start')}</button>           // Simple key
<span>{t('tempoNames.allegro')}</span>  // Nested key
```

**Supported languages:** `en` (English), `zh` (中文)

**Language state does NOT persist** across page refreshes (defaults to English).

### PWA Configuration (vite.config.js)

- Service worker auto-updates via `vite-plugin-pwa`
- Caches: `.js`, `.css`, `.html`, `.ico`, `.png`, `.svg`
- Icons: `public/icons/icon-192x192.png` and `icon-512x512.png`
- Manifest: standalone display, theme color `#3b82f6`

## Critical Implementation Patterns

### Practice Timer Auto-Save

When user closes/refreshes page with active timer:
1. `beforeunload` / `pagehide` events trigger `saveSession()`
2. Session saved to `localStorage` as `drummate_pending_log`
3. On next page load, `useEffect` recovers and commits pending log to IndexedDB

**Why:** iOS Safari kills pages aggressively; synchronous localStorage survives.

### Metronome Tab Switching

When switching between metronome and sequencer subpages:
1. Stop current playback
2. Reset engine sequence: `metronomeEngineRef.current.setSequence(null)`
3. Clear beat indicators
4. Disable NoSleep.js

**Why:** Prevents audio engine state conflicts between modes.

### Date Handling

Always use helpers from `dateHelpers.js`:
- `getTodayString()` - Returns `YYYY-MM-DD` in local timezone
- `formatDate(dateString)` - Human-readable format
- Uses noon (12:00) for date calculations to avoid DST edge cases

### NoSleep.js Pattern

Single global instance in `App.jsx`:
- Enable on metronome/sequencer start
- Disable on stop or tab switch
- **Never create multiple instances** (causes iOS bugs)

### Web Worker Path

Worker MUST be in `public/` folder and referenced as `/metronome-worker.js` (absolute path from root).

**Why:** Vite serves `public/` as-is; relative paths break in production build.

## Component Patterns

### Subdivision Icons (SubdivisionIcon.jsx)

SVG music notation renderer. Pass `type` prop:
- `'quarter'`, `'eighth'`, `'triplet'`, `'sixteenth'`
- `'eighth-quarter'`, `'quarter-eighth'`, `'quarter-triplet'`
- `'quintuplet'`, `'sextuplet'`
- `'rest'` - renders rest symbol

### BPM Dial (BpmDial.jsx)

Circular SVG rotary control with infinite rotation:
- 280x280 viewBox, radius 120
- 60 BPM per full rotation
- 36 tick marks (major every 6th)
- Supports mouse and touch events
- Returns BPM via `onChange(bpm)` callback

## File Naming & Structure

- Components: PascalCase (e.g., `PracticeItemList.jsx`)
- Utilities: camelCase (e.g., `dateHelpers.js`, `formatTime.js`)
- Context: PascalCase with "Context" suffix (e.g., `LanguageContext.jsx`)
- Audio/Services: camelCase (e.g., `metronomeEngine.js`, `database.js`)

## Styling Guidelines

- **Tailwind CSS v4 only** - no CSS modules, no inline styles
- Use utility classes exclusively
- Mobile-first responsive design
- System font stack (defined in `index.css`)

## Common Gotchas

1. **AudioContext must be created in user gesture** (Safari requirement) - engine initializes on first play
2. **iOS silent mode bypass:** Engine sets audio session to `'playback'` category
3. **Timer cleanup:** Always clear intervals in cleanup functions
4. **Starting new practice item auto-saves previous item** if still running
5. **Database operations are async** - always await
6. **Date strings must be YYYY-MM-DD** - use `dateHelpers.js`
7. **All user-facing text must use `t()` function** for bilingual support
8. **Metronome state is global in App.jsx** - persists across tab switches

## Commit Conventions

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring
- `docs:` - Documentation updates

Always include: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

## Testing Checklist

After changes:
- [ ] `npm run build` succeeds
- [ ] All tabs work (Practice, Metronome subpages, Report)
- [ ] Database persists after refresh
- [ ] Metronome/sequencer plays in background when switching tabs
- [ ] Language toggle works
- [ ] Mobile responsive (if UI changes)

## Next Development Phase

**Current:** Phase 5 Complete (Metronome + Sequencer + Bilingual)
**Next:** Phase 6 - Data Persistency Across Devices (export/import JSON, Dexie Cloud sync)

See [DEVELOPMENT.md](./DEVELOPMENT.md) for full roadmap and future enhancements.
