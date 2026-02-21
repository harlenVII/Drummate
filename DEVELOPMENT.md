# Drummate - Development Guide

## Project Overview

Drummate is a Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js (IndexedDB) with PocketBase for cross-device sync.

**Technology Stack:**
- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB) + PocketBase (sync)
- **Audio**: Web Audio API + Web Worker
- **PWA**: vite-plugin-pwa with Workbox
- **i18n**: Custom React Context (English/Chinese)

## Project Structure

```
Drummate/
├── index.html                         # HTML entry point
├── package.json                       # Dependencies and scripts
├── vite.config.js                     # Vite + PWA config
├── tailwind.config.js                 # Tailwind CSS v4 config
├── postcss.config.js                  # PostCSS with Tailwind + Autoprefixer
├── eslint.config.js                   # ESLint v9 flat config
├── CLAUDE.md                          # Claude Code project instructions
├── DEVELOPMENT.md                     # This file
├── PROJECT_PLAN.md                    # Roadmap & task tracking
├── DATA_SYNC_RESEARCH.md             # Data sync technical research
├── POCKETBASE_INTEGRATION_PLAN.md    # PocketBase integration details
├── VOICE_COMMANDS_RESEARCH.md        # Simple voice commands research
├── VOICE_AI_AGENT_RESEARCH.md        # On-device LLM agent research
├── public/
│   ├── metronome-worker.js            # Web Worker for background timing (25ms tick)
│   └── icons/
│       ├── icon-192x192.png           # PWA icon
│       └── icon-512x512.png           # PWA icon
└── src/
    ├── main.jsx                       # Entry point (mounts App in providers)
    ├── App.jsx                        # Main app: global state, routing, timer logic (593 lines)
    ├── index.css                      # Tailwind imports + system font stack
    ├── audio/
    │   └── metronomeEngine.js         # Web Audio API lookahead scheduler (558 lines)
    ├── components/
    │   ├── PracticeItemList.jsx       # Practice items with stopwatch (246 lines)
    │   ├── Metronome.jsx              # Metronome tab: controls, subdivisions (245 lines)
    │   ├── SequencerPage.jsx          # Rhythm sequencer with per-beat patterns (262 lines)
    │   ├── DailyReport.jsx            # Report tab: date picker, breakdown (213 lines)
    │   ├── BpmDial.jsx                # Circular SVG rotary dial (256 lines)
    │   ├── SubdivisionIcon.jsx        # SVG music notation icons (206 lines)
    │   ├── BeatIndicator.jsx          # Visual beat dots (26 lines)
    │   ├── TabBar.jsx                 # Bottom navigation with icons (95 lines)
    │   ├── AuthScreen.jsx             # Login/signup for PocketBase sync (123 lines)
    │   └── SettingsPanel.jsx          # App settings (86 lines)
    ├── constants/
    │   └── subdivisions.js            # Subdivision pattern definitions
    ├── contexts/
    │   ├── LanguageContext.jsx         # i18n context EN/中文 (178 lines)
    │   └── AuthContext.jsx            # PocketBase auth state (60 lines)
    ├── services/
    │   ├── database.js                # Dexie.js schema and operations (50 lines)
    │   ├── pocketbase.js              # PocketBase client instance (5 lines)
    │   └── sync.js                    # Cross-device sync logic (224 lines)
    └── utils/
        ├── dateHelpers.js             # Date formatting and navigation (45 lines)
        └── formatTime.js              # Seconds → HH:MM:SS formatter (8 lines)
```

## Database Schema

**IndexedDB via Dexie.js** (`src/services/database.js`) — Database name: `DrummateDB`, Version: 4

```javascript
// Table: practiceItems (schema: '++id, name')
{
  id: number (auto-increment),
  name: string (indexed, unique — used as sync dedup key)
}

// Table: practiceLogs (schema: '++id, itemId, date, duration, uid')
{
  id: number (auto-increment),
  itemId: number (foreign key → practiceItems.id),
  duration: number (seconds),
  date: string (YYYY-MM-DD, indexed),
  uid: string (UUID, generated on creation — used as sync dedup key)
}

// Table: syncQueue (schema: '++id, action, collection, localId')
{
  id: number (auto-increment),
  action: string ('create_item' | 'create_log' | 'delete_item' | 'rename_item'),
  payload: object (action-specific data)
}
```

**Key Operations:**
- `getItems()` - Get all practice items
- `addItem(name)` - Create new practice item, returns id
- `renameItem(id, newName)` - Update item name
- `deleteItem(id)` - Delete item and cascade delete all its logs
- `addLog(itemId, duration, date?)` - Record practice session (date defaults to today)
- `getTodaysLogs()` - Get today's practice logs
- `getLogsByDate(dateString)` - Get logs for specific date

## Completed Phases

### Phase 1–2: Practice Tracking
- Multiple practice items (create, rename, delete)
- Stopwatch timer with start/stop per item
- Auto-saves previous item when starting a new one
- Edit mode for renaming/deleting items
- Today's cumulative totals per item
- Auto-save on page close/refresh (recovers via localStorage)
- IndexedDB persistence via Dexie.js

### Phase 3: Daily Reports
- Report tab with date navigation (previous/next day)
- Practice breakdown by item with percentages and progress bars
- Total practice time display
- Generate formatted report text (modal with copy to clipboard)
- Disables forward navigation past today

### Phase 4: PWA Configuration
- PWA manifest (standalone display, theme color #3b82f6)
- Service worker with Workbox (caches .js, .css, .html, .ico, .png, .svg)
- Offline support, install to home screen (iOS/Android)

### Phase 5: Metronome + Sequencer + Bilingual Support

**Metronome Features:**
- Web Audio API lookahead scheduler for sample-accurate timing
- Web Worker for background timing (immune to browser tab throttling)
- Circular SVG rotary dial with infinite rotation (60 BPM per full rotation)
- Visual beat indicators with accent highlight on beat 1
- Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- Subdivision patterns: quarter, eighth, triplet, sixteenth, and compound patterns (eighth-quarter, quarter-eighth, quarter-triplet, quintuplet, sextuplet)
- 5 sound types: click, wood block, hi-hat, rimshot, beep
- Tap tempo (averages last 5 taps)
- Tempo name display (Grave → Prestissimo)
- +/- 1 BPM buttons on dial sides
- Per-item metronome settings (BPM, time signature, subdivision, sound saved per practice item)
- Metronome persists when switching tabs (state lifted to App.jsx)
- NoSleep.js prevents screen lock during playback
- iOS silent mode compatibility (audio session set to 'playback')

**Rhythm Sequencer:**
- Per-beat subdivision patterns with rest support
- Add/remove/reorder beat slots
- Sequence playback with visual slot tracking
- Shared audio engine with metronome (dual mode in MetronomeEngine)

**Audio Engine** (`src/audio/metronomeEngine.js`):
- Lookahead scheduler: 25ms wake-up interval, 100ms lookahead window
- Dual modes: normal metronome (single pattern) and sequence mode (per-beat patterns)
- Multiple sound types via oscillator synthesis
- GainNode with exponential ramp to avoid pops
- AudioContext warm-up with silent buffer (Safari/iOS unlock)
- `onBeat` callback for UI beat indicators, `onSequenceBeat` for sequencer UI

**BPM Dial** (`src/components/BpmDial.jsx`):
- 280x280 SVG viewBox, radius 120
- 36 tick marks (major every 6th)
- Pointer events (mouse + touch) with capture
- Accumulated rotation tracking for infinite dial behavior
- BPM range: 30–300

**Bilingual Support** (`src/contexts/LanguageContext.jsx`):
- React Context API with `LanguageProvider` wrapper
- `t(key)` function supports nested keys (e.g., `tempoNames.grave`)
- Full EN/中文 translations for all UI text and tempo names
- Toggle button in app header
- Defaults to English (no persistence on refresh)

**Data Sync (Complete):**
- PocketBase client integration (`src/services/pocketbase.js`)
- Auth context with login/signup (`src/contexts/AuthContext.jsx`, `src/components/AuthScreen.jsx`)
- Real-time bidirectional sync via SSE (`src/services/sync.js`)
- Deduplication: items by unique name, logs by UUID (`uid`)
- Offline queue with automatic retry on next app load
- All PocketBase API calls use `requestKey: null` to prevent SDK auto-cancellation of concurrent requests
- Settings panel (`src/components/SettingsPanel.jsx`)

**Global State** (`src/App.jsx`):
- Practice: items, totals, activeItemId, elapsedTime, editing
- Report: reportDate, reportLogs
- Metronome: bpm, isPlaying, currentBeat, timeSignature, subdivision, soundType
- Sequencer: sequencerSlots, sequencerPlayingSlot, metronomeSubpage
- Refs: metronomeEngineRef, noSleepRef, intervalRef, startTimeRef, sequencerNextIdRef
- Engine initialized once on mount, cleaned up only on unmount

## How to Continue Development

### Starting a New Session

1. **Read this file** (`DEVELOPMENT.md`) to understand the project
2. **Check git log** to see what's been completed:
   ```bash
   git log --oneline
   ```
3. **Review the roadmap** in [PROJECT_PLAN.md](./PROJECT_PLAN.md)
4. **Check CLAUDE.md** for coding conventions and patterns

### Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build (always test before committing)
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Making Changes

**Before implementing:**
1. Read relevant files to understand current patterns
2. Maintain consistency with existing code style
3. Use existing components/utilities where possible
4. Test build after changes: `npm run build`

**Commit conventions:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring
- `docs:` - Documentation

**Key patterns in this codebase:**
- Components use Tailwind utility classes (no CSS modules)
- State management: React hooks (useState, useCallback, useRef)
- Database operations are async/await
- Date strings use "YYYY-MM-DD" format
- All user-facing text uses `t()` function for translation

### Testing Checklist

After making changes, verify:
- [ ] `npm run build` completes without errors
- [ ] All tabs work (Practice, Metronome subpages, Report)
- [ ] Database operations persist (refresh page)
- [ ] Metronome/sequencer plays in background when switching tabs
- [ ] Language toggle works on all screens
- [ ] Mobile responsive (test on mobile if possible)

## Deployment

### Quick Deploy (Netlify)
```bash
npm run build
# Drag `dist` folder to https://app.netlify.com/drop
```

### CLI Deploy
```bash
# Netlify
netlify deploy --prod

# Vercel
vercel
```

## Troubleshooting

### Metronome Not Playing
- Check browser console for AudioContext errors
- Ensure user gesture (click) initiated playback
- Verify Web Worker is loading: check Network tab for `metronome-worker.js`

### Database Not Persisting
- Check IndexedDB in browser DevTools (Application tab)
- Clear cache if migration issues occur
- Verify Dexie.js version compatibility

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version (should be >=18)
- Verify Tailwind CSS v4 config is correct

### PWA Not Installing
- Must be served over HTTPS (localhost is OK for development)
- Check manifest.webmanifest is valid
- Verify service worker is registered (DevTools > Application > Service Workers)

## Code Style Guidelines

1. **Components**: Functional components with hooks
2. **State**: Use `useState`, `useCallback`, `useRef` appropriately
3. **Props**: Destructure in function signature
4. **Styling**: Tailwind utility classes only
5. **File naming**: PascalCase for components, camelCase for utilities
6. **Translations**: Always use `t()` for user-facing text
7. **Dates**: Always use helpers from `dateHelpers.js`
8. **Database**: Always use functions from `database.js`

## Important Notes

- **Metronome state is global**: Managed in App.jsx, not in Metronome.jsx — persists across tab switches
- **Web Worker path**: Must be in `public/` folder (absolute path `/metronome-worker.js`)
- **NoSleep.js**: Single global instance in App.jsx — enabled on metronome start, disabled on stop
- **Language persistence**: Currently resets on refresh (consider localStorage if persistence needed)
- **Date handling**: All dates use "YYYY-MM-DD" in local timezone; dateHelpers.js uses noon to avoid DST issues
- **Audio context**: Only one instance per app (created inside user gesture for Safari compatibility)
- **iOS audio**: MetronomeEngine sets audio session to 'playback' to bypass silent mode switch
- **Timer behavior**: Starting a new practice item auto-saves the previous one if still running
- **Database name**: `DrummateDB` — table names are `practiceItems` and `practiceLogs`

## Resources

- [Vite Documentation](https://vite.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Dexie.js Documentation](https://dexie.org/)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [PWA Documentation](https://web.dev/progressive-web-apps/)

---

**Last Updated:** 2026-02-21
**Current Phase:** Phase 6 Complete
**Next Phase:** Phase 7 (Voice-Controlled Metronome) — see [PROJECT_PLAN.md](./PROJECT_PLAN.md)
