# Drummate

A Progressive Web App (PWA) for drummers: practice tracking, dated notes, rich reports, and a sample-accurate metronome with rhythm sequencer. Voice commands and on-device AI coaching are processed entirely in the browser — no audio leaves your device.

Built with React 19, Vite 7, Tailwind CSS v4, Dexie.js (IndexedDB), and Firebase for cross-device sync.

## Features

### Practice Tracking
- Stopwatch timer for practice items (exercises, songs, techniques) organized into **Fundamentals** and **Songs** categories
- Drag-and-drop reordering within and across categories (`@dnd-kit`)
- Per-item metronome settings (BPM, time signature, subdivision, sound)
- Auto-save on page close / refresh / iOS Safari kill (crash-recovered from localStorage)
- Archive and a 30-day trash bin (soft-delete with automatic purge)
- Offline-first with IndexedDB; works without an account in **visitor mode**

### Notes
- Dated journal entries attached to practice items
- Two views: **By Date** and **By Item**
- Notes attached to trashed items are hidden until restored

### Reports & Analytics
- **Daily** — per-item breakdown with editable times and a "Merge to yesterday" action for late-night sessions
- **Weekly** / **Monthly** — totals, per-item rollups, trend visualizations, calendar heatmap
- **Yearly** — long-term overview
- **Stats** — lifetime totals, streaks, prior-hours offset (for practice logged before adopting the app)
- **Goals** — multi-goal tracking with pinned banner on the Practice tab, automatic archival of expired goals, history view
- Configurable time units (minutes / hours), date navigation via keyboard arrows
- Generate and copy formatted text reports

### Metronome
- Sample-accurate scheduling: Web Audio API + Web Worker lookahead (25 ms wake, 100 ms lookahead)
- Circular dial control (30–300 BPM) with tempo names (Grave → Prestissimo)
- Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- Subdivisions: quarter, eighth, triplet, sixteenth, offbeat sixteenths, compound patterns; rest beats supported
- Sound types: click, wood block, hi-hat, rimshot, beep
- Tap tempo (averages last 5 taps), accent on beat 1, visual beat indicators
- Keeps playing in the background when switching tabs; `NoSleep.js` prevents screen lock
- iOS silent-mode bypass via `playback` audio session category

### Rhythm Sequencer
- Per-beat subdivision patterns with rest support
- Add / remove / reorder beat slots
- Visual slot tracking during playback; shared audio engine with the metronome

### Linked Practice + Metronome
- A metronome practice slot can be linked to a practice item — pressing Start begins the linked item's stopwatch automatically and ending it auto-saves the log

### Voice Commands & Hands-Free Mode
- **Wake word** — say "Drummate" to activate (OpenWakeWord ONNX, ~5 MB, runs locally)
- **Commands** — start/stop metronome, set tempo / time signature / subdivision, start/stop practice items, switch tabs, generate reports
- **Voice feedback** — browser TTS plus on-device Kokoro TTS for high-quality English speech
- Bilingual support (EN/ZH); fuzzy matching on practice-item names
- All voice processing is on-device — no cloud API calls

### AI Coach
- On-device LLM (Qwen 2.5-0.5B via `@wllama/wllama`) generates session-aware encouragement
- Lazy-loaded WASM weights from CDN on first use; bilingual hardcoded fallbacks ensure the feature works offline before the model downloads

### Cross-Device Sync & Offline
- Firebase backend (Firestore + Anonymous / Google auth) with real-time bidirectional sync
- **Visitor mode** — use the full app without signing in; data lives only in Dexie. Creating an account migrates local data; signing in to an existing account wipes local and pulls cloud truth
- **Explicit offline mode** — banner, pending-changes modal with readable summaries, and a sync queue that replays enriched payloads on reconnect
- Account-synced **timezone** (single home TZ) so log grouping is consistent across devices
- Soft-delete + 30-day purge cascades cleanly across items, logs, and notes

### PWA & Internationalization
- Installable on iOS / Android home screens
- Service worker (Workbox) with runtime caching for large ONNX / WASM models (30-day expiry)
- Bilingual UI (English / 中文), light & dark themes, compact density mode

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Installation

```bash
git clone <repo-url>
cd Drummate
npm install
npm run dev
```

Open <http://localhost:5173>.

### Build for Production

```bash
npm run build
npm run preview
```

### Tests

```bash
npm run test          # Vitest, one-shot
npm run test:watch
```

### Environment Variables

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
```

Firebase is the sole sync backend; without these variables the app still works fully in visitor mode.

## Keyboard Shortcuts

Blocked while focus is inside an `<input>` or `<textarea>`.

| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Practice / Metronome / Report / Notes |
| `Tab` / `Shift+Tab` | Cycle subpages on current tab |
| `←` / `→` | Step report date |
| `M` / `H` | Time unit: minutes / hours |
| `E` / `C` | Language: English / Chinese |
| `L` / `D` | Theme: light / dark |
| `S` | Stop active practice timer |
| `Space` | Toggle play/pause during metronome practice |
| `?` | Toggle shortcuts help |

## Technology Stack

- **Frontend** — React 19, Vite 7
- **Styling** — Tailwind CSS v4 (mobile-first), system font stack
- **Database** — Dexie.js (IndexedDB), version 16
- **Sync** — Firebase (Firestore + Auth)
- **Audio** — Web Audio API + Web Worker scheduler
- **Voice** — OpenWakeWord (ONNX) + Web Speech API + Kokoro TTS (WASM)
- **AI** — `@wllama/wllama` on-device LLM inference
- **Drag & drop** — `@dnd-kit`
- **PWA** — `vite-plugin-pwa` with Workbox
- **i18n** — Custom React Context (EN / ZH)

## Documentation

- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — Architecture and development guide
- [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) — Roadmap and design-doc index
- [CLAUDE.md](./CLAUDE.md) — Detailed engineering notes (data model, sync correctness, gotchas)

## Browser Support

- **Chrome (desktop & Android)** — Full support including wake-word hands-free mode
- **Safari / iOS** — PWA install, metronome, practice tracking, sync, TTS feedback; wake-word detection unavailable
- **Other Chromium browsers** — Most features supported; wake word requires Chrome

## License

MIT

## Acknowledgments

Built with [Claude Code](https://claude.com/claude-code).
