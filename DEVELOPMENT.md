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
├── public/
│   ├── metronome-worker.js      # Web Worker for metronome timing
│   ├── manifest.webmanifest      # PWA manifest
│   └── icons/                    # PWA icons
├── src/
│   ├── audio/
│   │   └── metronomeEngine.js   # Web Audio API lookahead scheduler
│   ├── components/
│   │   ├── BeatIndicator.jsx    # Visual beat dots
│   │   ├── BpmDial.jsx          # Circular SVG BPM control
│   │   ├── DailyReport.jsx      # Report tab with date picker
│   │   ├── Metronome.jsx        # Metronome tab container
│   │   ├── PracticeItemList.jsx # Practice items and stopwatch
│   │   └── TabBar.jsx           # Bottom navigation
│   ├── contexts/
│   │   └── LanguageContext.jsx  # i18n context (EN/中文)
│   ├── services/
│   │   └── database.js          # Dexie.js schema and operations
│   ├── utils/
│   │   └── dateHelpers.js       # Date formatting utilities
│   ├── App.jsx                  # Main app component
│   ├── main.jsx                 # Entry point
│   └── index.css                # Tailwind imports
├── vite.config.js               # Vite + PWA config
├── tailwind.config.js           # Tailwind v4 config
└── package.json
```

## Database Schema

**IndexedDB via Dexie.js** (`src/services/database.js`)

```javascript
// Table: items
{
  id: number (auto-increment),
  name: string,
  createdAt: number (timestamp)
}

// Table: logs
{
  id: number (auto-increment),
  itemId: number,
  duration: number (seconds),
  timestamp: number,
  date: string (YYYY-MM-DD)
}
```

**Key Operations:**
- `getItems()` - Get all practice items
- `addItem(name)` - Create new practice item
- `renameItem(id, newName)` - Update item name
- `deleteItem(id)` - Delete item and all logs
- `addLog(itemId, duration)` - Record practice session
- `getTodaysLogs()` - Get today's practice logs
- `getLogsByDate(dateString)` - Get logs for specific date

## Completed Phases

### Phase 0: Project Setup ✅
**Commits:** `5761d0f`, `7b379da`, `968aaf5`
- Initialized Vite + React project
- Configured Tailwind CSS v4
- Set up Dexie.js for local data storage
- Basic project structure

### Phase 1-2: Practice Tracking ✅
**Commits:** `de9da9b`, `ae0d42f`
- Multiple practice items support
- Stopwatch timer with start/stop
- Edit mode for renaming/deleting items
- Today's totals display
- IndexedDB persistence

### Phase 3: Daily Reports ✅
**Commits:** `014a0e2`, `dec53b1`
- Report tab with date picker
- Date navigation (today/yesterday/custom)
- Practice breakdown by item with percentages
- Total practice time display
- Generate report text feature (copy to clipboard)

### Phase 4: PWA Configuration ✅
**Commit:** `db4235d`
- PWA manifest with icons
- Service worker with Workbox
- Offline support
- Install prompt for mobile

### Phase 5: Metronome ✅
**Commits:** `00a7ccc`, `3c00a3a`, `5f5c48a`, `da4bbd5`, `4935967`

**Core Features:**
- Web Audio API lookahead scheduler for sample-accurate timing
- Web Worker to prevent browser throttling in background
- Circular SVG rotary dial (30-300 BPM)
- Visual beat indicators with accent on beat 1
- Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- Tap tempo feature (averages last 5 taps)
- Tempo name display (Grave, Largo, Adagio, Moderato, Allegro, Vivace, Presto, Prestissimo)

**Enhancements:**
- Bilingual support (English/Chinese) with toggle button
- Metronome persists when switching between tabs
- All UI elements translated including tempo names

**Key Implementation Details:**

1. **Metronome Engine** (`src/audio/metronomeEngine.js`)
   - Lookahead scheduler: 25ms wake-up interval, 100ms lookahead window
   - Oscillator sounds: 1000 Hz (accent), 800 Hz (normal)
   - GainNode with exponential ramp to avoid pops
   - Web Worker integration for background timing
   - Sample-accurate scheduling via `AudioContext.currentTime`

2. **BPM Dial** (`src/components/BpmDial.jsx`)
   - 280x280 SVG viewBox, 270° sweep (135° to 405°)
   - Pointer events (mouse + touch) with capture
   - 54 tick marks (major every 9th)
   - Active arc and drag handle
   - Center display: BPM number, tempo name, "BPM" label

3. **State Management** (`src/App.jsx`)
   - Metronome state lifted to App level to persist across tabs
   - Engine initialized once on app mount
   - Cleanup only on app unmount (not tab switch)

4. **Web Worker** (`public/metronome-worker.js`)
   - Runs in separate thread
   - Immune to browser tab throttling
   - Sends 'tick' message every 25ms
   - Fallback to setInterval if worker unavailable

5. **Bilingual Support** (`src/contexts/LanguageContext.jsx`)
   - React Context API
   - Translation dictionaries for EN/中文
   - `t(key)` function supports nested keys (e.g., 'tempoNames.grave')
   - Toggle button in app header
   - Defaults to English

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
- Subdivisions (eighth notes, triplets)
- Accents on custom beats
- Polyrhythms
- Sound customization (click sounds)
- Visual flash on screen edge

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

- **Metronome state is global**: Managed in App.jsx, not in Metronome.jsx
- **Web Worker path**: Must be in `public/` folder (absolute path `/metronome-worker.js`)
- **Language persistence**: Currently resets on refresh (consider localStorage if persistence needed)
- **Date timezone**: All dates use local timezone via `toDateString()` helper
- **Audio context**: Only one instance per app (in App.jsx metronome engine)

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
