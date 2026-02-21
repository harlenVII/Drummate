# Drummate

A Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js.

## Features

### Practice Tracking
- Stopwatch timer for practice sessions
- Multiple practice items (exercises, songs, techniques)
- Edit mode for renaming/deleting items
- Auto-save on page close/refresh (recovers via localStorage)
- Per-item metronome settings (BPM, time signature, subdivision, sound)
- Offline-first with IndexedDB storage

### Daily Reports
- Practice breakdown by date with time percentages
- Navigate between days (today/yesterday/custom)
- Generate and copy formatted reports

### Metronome
- Sample-accurate timing with Web Audio API + Web Worker
- Circular dial control (30–300 BPM)
- Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- Subdivisions: quarter, eighth, triplet, sixteenth, and compound patterns
- Sound types: click, wood block, hi-hat, rimshot, beep
- Tap tempo
- Accent on beat 1 with visual beat indicators
- Tempo names (Grave to Prestissimo)
- Plays in background when switching tabs

### Rhythm Sequencer
- Per-beat subdivision patterns with rest support
- Add/remove/reorder beat slots
- Sequence playback with visual slot tracking
- Shared audio engine with metronome

### PWA & Internationalization
- Install to home screen (iOS/Android)
- Works offline with service worker caching
- Bilingual support (English/中文)
- Cross-device data sync via PocketBase (in progress)

## Getting Started

### Prerequisites
- Node.js >= 18
- npm >= 9

### Installation

```bash
git clone <repo-url>
cd Drummate
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Technology Stack

- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB) + PocketBase (sync)
- **Audio**: Web Audio API + Web Worker
- **PWA**: vite-plugin-pwa with Workbox
- **i18n**: Custom React Context (EN/ZH)

## Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) — Architecture, project structure, development guide
- [PROJECT_PLAN.md](./PROJECT_PLAN.md) — Roadmap with task breakdowns and design doc links

## Roadmap

- [x] Phase 1–2: Practice tracking with stopwatch & reports
- [x] Phase 3: Metronome (BPM dial, time signatures, tap tempo)
- [x] Phase 4: Rhythm sequencer & subdivisions
- [x] Phase 5: Bilingual support (EN/ZH)
- [ ] Phase 6: Data sync across devices (PocketBase)
- [ ] Phase 7: Voice-controlled metronome & voice commands
- [ ] Phase 8: On-device LLM for practice insights & encouragement
- [ ] Phase 9: Weekly/monthly analytics & streak tracking
- [ ] Phase 10: Leaderboard across users

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for details.

## License

MIT

## Acknowledgments

Built with [Claude Code](https://claude.com/claude-code)
