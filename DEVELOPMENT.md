# Drummate - Development Guide

## Project Overview

Drummate is a Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome. Built with React, Vite, Tailwind CSS v4, and Dexie.js (IndexedDB wrapper).

**Technology Stack:**
- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB)
- **Audio**: Web Audio API + Web Worker
- **PWA**: vite-plugin-pwa with Workbox
- **Language**: Bilingual (English/Chinese)

## Project Structure

```
Drummate/
├── index.html                         # HTML entry point
├── package.json                       # Dependencies and scripts
├── vite.config.js                     # Vite + PWA config
├── tailwind.config.js                 # Tailwind CSS v4 config
├── postcss.config.js                  # PostCSS with Tailwind + Autoprefixer
├── eslint.config.js                   # ESLint v9 flat config
├── public/
│   ├── metronome-worker.js            # Web Worker for background timing (25ms tick)
│   └── icons/
│       ├── icon-192x192.png           # PWA icon
│       └── icon-512x512.png           # PWA icon
└── src/
    ├── main.jsx                       # Entry point (mounts App in LanguageProvider)
    ├── App.jsx                        # Main app: global state, routing, timer logic
    ├── index.css                      # Tailwind imports + system font stack
    ├── audio/
    │   └── metronomeEngine.js         # Web Audio API lookahead scheduler (247 lines)
    ├── components/
    │   ├── PracticeItemList.jsx       # Practice items with stopwatch (195 lines)
    │   ├── Metronome.jsx              # Metronome tab: controls, subdivisions (197 lines)
    │   ├── DailyReport.jsx            # Report tab: date picker, breakdown (213 lines)
    │   ├── BpmDial.jsx                # Circular SVG rotary dial (257 lines)
    │   ├── SubdivisionIcon.jsx        # SVG music notation icons (158 lines)
    │   ├── BeatIndicator.jsx          # Visual beat dots (27 lines)
    │   └── TabBar.jsx                 # Bottom navigation with icons (96 lines)
    ├── contexts/
    │   └── LanguageContext.jsx        # i18n context EN/中文 (127 lines)
    ├── services/
    │   └── database.js                # Dexie.js schema and operations (44 lines)
    └── utils/
        ├── dateHelpers.js             # Date formatting and navigation (46 lines)
        └── formatTime.js              # Seconds → HH:MM:SS formatter (8 lines)
```

## Database Schema

**IndexedDB via Dexie.js** (`src/services/database.js`) — Database name: `DrummateDB`, Version: 2

```javascript
// Table: practiceItems (schema: '++id, name')
{
  id: number (auto-increment),
  name: string (indexed)
}

// Table: practiceLogs (schema: '++id, itemId, date, duration')
{
  id: number (auto-increment),
  itemId: number (foreign key → practiceItems.id),
  duration: number (seconds),
  date: string (YYYY-MM-DD, indexed)
}
```

**Key Operations:**
- `getItems()` - Get all practice items
- `addItem(name)` - Create new practice item, returns id
- `renameItem(id, newName)` - Update item name
- `deleteItem(id)` - Delete item and cascade delete all its logs
- `addLog(itemId, duration)` - Record practice session with today's date
- `getTodaysLogs()` - Get today's practice logs
- `getLogsByDate(dateString)` - Get logs for specific date

## Completed Phases

### Phase 0: Project Setup ✅
- Initialized Vite 7 + React 19 project
- Configured Tailwind CSS v4 with PostCSS + Autoprefixer
- Set up Dexie.js (IndexedDB) for local data storage
- ESLint v9 flat config

### Phase 1-2: Practice Tracking ✅
- Multiple practice items (create, rename, delete)
- Stopwatch timer with start/stop per item
- Auto-saves previous item when starting a new one
- Edit mode for renaming/deleting items
- Today's cumulative totals per item
- IndexedDB persistence via Dexie.js

### Phase 3: Daily Reports ✅
- Report tab with date navigation (previous/next day)
- Practice breakdown by item with percentages and progress bars
- Total practice time display
- Generate formatted report text (modal with copy to clipboard)
- Close modal with Escape key
- Disables forward navigation past today

### Phase 4: PWA Configuration ✅
- PWA manifest (standalone display, theme color #3b82f6)
- Service worker with Workbox (caches .js, .css, .html, .ico, .png, .svg)
- Offline support
- Install to home screen (iOS/Android)

### Phase 5: Metronome + Bilingual Support ✅

**Metronome Features:**
- Web Audio API lookahead scheduler for sample-accurate timing
- Web Worker for background timing (immune to browser tab throttling)
- Circular SVG rotary dial with infinite rotation (60 BPM per full rotation)
- Visual beat indicators with accent highlight on beat 1
- Time signatures: 2/4, 3/4, 4/4, 5/4
- 7 subdivision patterns: quarter, eighth, triplet, sixteenth, and 3 mixed patterns
- SVG music notation icons for subdivisions (`SubdivisionIcon.jsx`)
- Tap tempo (averages last 5 taps)
- Tempo name display (Grave → Prestissimo)
- +/- 1 BPM buttons on dial sides
- Metronome persists when switching tabs (state lifted to App.jsx)
- NoSleep.js prevents screen lock during playback
- iOS silent mode compatibility (audio session set to 'playback')

**Audio Engine** (`src/audio/metronomeEngine.js`):
- Lookahead scheduler: 25ms wake-up interval, 100ms lookahead window
- Oscillator frequencies: 1000 Hz accent (vol 0.8), 800 Hz normal (vol 0.5), 600 Hz subdivision (vol 0.3)
- GainNode with exponential ramp to avoid pops (50ms note duration)
- AudioContext warm-up with silent buffer (Safari/iOS unlock)
- Auto-resume on AudioContext state change

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

**Global State** (`src/App.jsx`):
- Practice: items, totals, activeItemId, elapsedTime, editing
- Report: reportDate, reportLogs
- Metronome: bpm, isPlaying, currentBeat, timeSignature, subdivision
- Refs: metronomeEngineRef, noSleepRef, intervalRef, startTimeRef
- Engine initialized once on mount, cleaned up only on unmount

## How to Continue Development

### Starting a New Session

If you start a fresh session without prior context, follow this workflow:

1. **Read this file** (`DEVELOPMENT.md`) to understand the project
2. **Check git log** to see what's been completed:
   ```bash
   git log --oneline
   ```
3. **Review the codebase structure** to understand current implementation
4. **Identify next phase** from the "Future Enhancements" section below

### Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
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
- Always include: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

**Key patterns in this codebase:**
- Components use Tailwind utility classes (no CSS modules)
- State management: React hooks (useState, useCallback, useRef)
- Database operations are async/await
- Date strings use "YYYY-MM-DD" format
- All text uses `t()` function for translation

### Testing Checklist

After making changes, verify:
- [ ] `npm run build` completes without errors
- [ ] All three tabs work (Practice, Metronome, Report)
- [ ] Database operations persist (refresh page)
- [ ] Metronome plays in background when switching tabs
- [ ] Language toggle works on all screens
- [ ] Mobile responsive (test on mobile if possible)

## Future Enhancements

### Phase 6: Data Persistency Across Devices (Not Started)
- Export/import practice data as JSON (manual backup/restore)
- Dexie Cloud integration for real-time cross-device sync
- User authentication for cloud sync
- See `DATA_SYNC_RESEARCH.md` for technical research

### Phase 7: Voice-Controlled Metronome & Voice Commands (Not Started)
- Wake word detection ("Hey Drummate") via Picovoice Porcupine
- Speech-to-text via Whisper Tiny (WASM, on-device)
- Voice commands: set tempo, start/stop metronome, generate reports, navigate tabs
- Intent parsing via regex for structured commands
- Text-to-speech feedback via browser `speechSynthesis` API
- Encouragement generation after daily reports (template-based → optional on-device LLM)
- See `VOICE_COMMANDS_RESEARCH.md` for technical research

### Phase 8: Weekly/Monthly Analytics (Not Started)
- Weekly/monthly practice summaries
- Streak tracking
- Practice time charts
- Item-specific progress tracking

### Phase 9: Advanced Metronome (Not Started)
- Accents on custom beats (currently only beat 1)
- Polyrhythms
- Sound customization (click sounds vs wood block, rimshot, etc.)
- Visual flash on screen edge
- Tempo ramp (gradual BPM increase over time)
- Note: Subdivisions already implemented in Phase 5

### Phase 10: Leaderboard (Not Started)
- Cross-user practice leaderboard
- Requires cloud backend (pairs with Phase 6 cloud sync)
- Weekly/monthly rankings
- Opt-in sharing of practice stats

### Phase 11: On-Device LLM (Not Started)
- Practice recommendations based on history
- Personalized insights and encouragement (upgrade from templates)
- Smart practice plan generation
- SmolLM2 135M or Qwen2.5 0.5B via WASM
- See `VOICE_COMMANDS_RESEARCH.md` for model options

## Deployment

### Quick Deploy (Netlify)
```bash
npm run build
# Drag `dist` folder to https://app.netlify.com/drop
```

### CLI Deploy (Netlify)
```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod
```

### CLI Deploy (Vercel)
```bash
npm install -g vercel
vercel
```

### GitHub Pages
1. Add to `package.json` scripts:
   ```json
   "deploy": "npm run build && gh-pages -d dist"
   ```
2. Set `base: '/drummate/'` in `vite.config.js`
3. Run `npm run deploy`

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
- [Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [PWA Documentation](https://web.dev/progressive-web-apps/)

---

**Last Updated:** 2026-02-11
**Current Phase:** Phase 5 Complete (Metronome + Bilingual)
**Next Phase:** Phase 6 (Data Persistency Across Devices)
