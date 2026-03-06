# Drummate

A Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome with a rhythm sequencer. Features voice commands, on-device AI coaching, and cross-device sync — all privacy-first with local processing.

Built with React 19, Vite 7, Tailwind CSS v4, and Dexie.js.

## Features

### Practice Tracking
- Stopwatch timer for practice sessions with multiple items (exercises, songs, techniques)
- Edit mode for renaming/deleting items
- Drag-and-drop reordering (@dnd-kit)
- Auto-save on page close/refresh (recovers via localStorage)
- Per-item metronome settings (BPM, time signature, subdivision, sound)
- Archive and trash bin with 30-day auto-purge
- Offline-first with IndexedDB storage

### Reports & Analytics
- **Daily report** — practice breakdown by item with time percentages
- **Weekly summary** — per-item breakdown with trend visualization
- **Monthly summary** — calendar heatmap and trend charts
- Navigate between dates, configurable time units (minutes/hours)
- Generate and copy formatted reports

### Metronome
- Sample-accurate timing with Web Audio API + Web Worker
- Circular dial control (30–300 BPM)
- Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- Subdivisions: quarter, eighth, triplet, sixteenth, offbeat sixteenths, and compound patterns
- Sound types: click, wood block, hi-hat, rimshot, beep
- Tap tempo (averages last 5 taps)
- Accent on beat 1 with visual beat indicators
- Tempo names (Grave to Prestissimo)
- Plays in background when switching tabs
- NoSleep.js prevents screen lock during playback

### Rhythm Sequencer
- Per-beat subdivision patterns with rest support
- Add/remove/reorder beat slots
- Sequence playback with visual slot tracking
- Shared audio engine with metronome

### Voice Commands & Hands-Free Mode
- **Wake word detection** — say "Drummate" to activate (OpenWakeWord ONNX, runs locally)
- **Voice commands** — start/stop metronome, set tempo/time signature/subdivision, start/stop practice items, switch tabs, generate reports
- **Voice feedback** — browser TTS with English and Chinese support
- **Natural voice** — on-device Kokoro TTS for high-quality speech (English)
- **Hands-free mode** — combines wake word + STT + intent parsing for fully hands-free operation
- All voice processing runs on-device — no cloud API calls

### AI Coach
- On-device LLM (Qwen2.5-0.5B via @wllama/wllama) for practice encouragement
- Context-aware messages based on practice data, streaks, and active sessions
- Bilingual support (EN/ZH) with hardcoded fallback messages
- Optional download, lazy-loaded on first use

### Cross-Device Sync
- Pluggable backend system supporting **Firebase** and **PocketBase**
- Real-time bidirectional sync
- Offline queue with automatic retry
- Deduplication by item name and log UUID

### PWA & Internationalization
- Install to home screen (iOS/Android)
- Works offline with service worker caching (Workbox)
- Runtime caching for large ONNX/WASM models (30-day expiry)
- Bilingual support (English/中文)

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

### Environment Variables

```bash
# Firebase (default backend)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=

# PocketBase (alternative backend)
VITE_POCKETBASE_URL=
```

Backend selection is controlled at runtime — no build-time configuration needed. Firebase SDK is lazy-loaded only when active.

## Technology Stack

- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB) + Firebase / PocketBase (sync)
- **Audio**: Web Audio API + Web Worker
- **Voice**: OpenWakeWord (ONNX) + Web Speech API + Kokoro TTS (WASM)
- **AI**: @wllama/wllama (on-device LLM inference)
- **Drag & Drop**: @dnd-kit
- **PWA**: vite-plugin-pwa with Workbox
- **i18n**: Custom React Context (EN/ZH)

## Documentation

- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) — Architecture, project structure, development guide
- [PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) — Roadmap with task breakdowns and design doc links

## Roadmap

- [x] Phase 1–2: Practice tracking with stopwatch & reports
- [x] Phase 3: Metronome (BPM dial, time signatures, tap tempo)
- [x] Phase 4: Rhythm sequencer & subdivisions
- [x] Phase 5: Bilingual support (EN/ZH)
- [x] Phase 6: Data sync across devices (Firebase/PocketBase)
- [x] Phase 7: Voice commands & hands-free mode
- [x] Phase 8: On-device AI Coach for practice encouragement
- [x] Phase 9: Weekly/monthly analytics & streak tracking
- [ ] Phase 10: Leaderboard across users

See [PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) for details.

## Browser Support

- **Chrome** — Full feature support including hands-free voice commands
- **Safari/iOS** — PWA install, metronome, practice tracking; voice features limited to TTS feedback
- **Other Chromium browsers** — Most features supported; wake word detection requires Chrome

## License

MIT

## Acknowledgments

Built with [Claude Code](https://claude.com/claude-code)
