# Drummate

A Progressive Web App (PWA) for drummers: practice tracking, dated notes, rich reports, and a sample-accurate metronome with tempo-ramp drills, a rhythm builder, and a mixed-meter builder. Voice commands and on-device AI coaching run entirely in the browser — no audio leaves your device.

Built with React 19, Vite 7, Tailwind CSS v4, Dexie.js (IndexedDB), and Firebase for cross-device sync.

## Features

### Practice Tracking
- Stopwatch timer per practice item (exercises, songs, techniques), organized into **Fundamentals** and **Songs**
- Drag-and-drop reordering within and across categories (`@dnd-kit`)
- Manual time adjustment — add or edit a session's minutes after the fact
- Merge two items into one (reassigns all logs and notes) for when the same exercise got entered twice
- Auto-save on page close / refresh / iOS Safari kill (recovered from `localStorage` on next load)
- Archive, plus a 30-day trash bin (soft-delete with a visible countdown and automatic purge)
- Floating widget keeps the running timer visible and stoppable from any tab
- Offline-first on IndexedDB; fully usable without an account in **visitor mode**

### Notes
- Dated journal entries attached to a practice item
- Two views: **By Date** and **By Item** (items with no notes are hidden in By Item)
- Own 30-day trash bin; notes on trashed items are hidden until the item is restored

### Reports & Analytics
- **Daily** — per-item breakdown with editable times, plus a "Merge to yesterday" action for past-midnight sessions
- **Weekly** / **Monthly** — totals, per-item rollups, trend line charts, calendar heatmap
- **Yearly** — year heatmap and year-scoped streaks
- **Stats** — lifetime total, practice days, daily average, current/longest streak, most-practiced item, longest day, best month, and a prior-hours offset for practice logged before adopting the app
- **Goals** — multiple goals (target hours over a date range), one pinnable to a Practice-tab banner, drag-to-reorder, automatic archival when a goal's end date passes, history view
- Optional grouping by category, minutes/hours toggle, keyboard date stepping
- Copyable plain-text report over any date range

### Metronome
- Sample-accurate scheduling: Web Audio API + Web Worker lookahead (25 ms wake, 100 ms lookahead)
- Circular dial control, 30–300 BPM, with tempo names (Grave → Prestissimo)
- Time signatures 2/4, 3/4, 4/4, 5/4 (odd and compound meters live in the Meter Builder)
- Subdivisions: quarter, eighth, triplet, sextuplet, sixteenth, dotted eighth, offbeat sixteenths, and compound sixteenth patterns; rest beats supported
- Sounds: click, wood block, hi-hat, rimshot, beep
- Tap tempo (averages the last 5 taps), toggleable accent on beat 1, visual beat indicators
- Keeps playing when you switch tabs; `NoSleep.js` prevents screen lock; iOS silent-mode bypass via the `playback` audio session category

### Tempo-Ramp Drills
- Saved drills that step from a start BPM to an end BPM by a chosen increment, holding N bars per step
- 2-bar count-in, per-step accent on transitions, pause/resume, and progress weighted by real elapsed time rather than step count
- A drill can be linked to a practice item — starting the drill starts that item's stopwatch, and finishing it saves the log

### Rhythm Builder
- Per-beat subdivision patterns with rests, up to 16 slots
- Add / remove / insert / reorder slots, with visual slot tracking during playback
- Shares the audio engine with the metronome

### Meter Builder
- Chain up to 16 bars of mixed time signatures (2/4–7/4, 3/8, 6/8, 7/8, 9/8, 11/8, 12/8) into a repeating cycle
- Per-bar sound selection; accent, quarter, and subdivision clicks laid out automatically per bar

### Voice Commands & Hands-Free Mode
- **Wake word** — say "Drummate" to activate (OpenWakeWord ONNX, ~5 MB, runs locally)
- **Commands** — start/stop the metronome, set or nudge tempo, set time signature or subdivision, start/stop a practice item, switch tabs, generate a report, toggle language
- **Voice feedback** — browser speech synthesis, or on-device Kokoro TTS for higher-quality English
- Fuzzy matching (Levenshtein) on spoken practice-item names
- All processing is on-device — no cloud API calls

### AI Coach
- On-device LLM (Qwen3-0.6B, Q4_K_M GGUF, ~397 MB) via `@wllama/wllama` generates post-session encouragement from the day's real numbers
- WASM fetched from CDN on first use; model cached in OPFS so the download happens once
- Bilingual hardcoded fallbacks, so the feature works before (or without) the download

### Cross-Device Sync & Offline
- Firebase backend (Firestore + Auth) with real-time bidirectional sync
- **Visitor mode** — the full app with no sign-in; data stays in Dexie. Creating an account migrates the local data up; signing in to an existing account wipes local and pulls cloud truth
- **Explicit offline mode** — banner, a pending-changes modal with readable summaries, and a sync queue that replays enriched payloads on reconnect
- Account-synced home **timezone**, so log grouping stays consistent across devices and travel
- Soft-delete + 30-day purge cascades cleanly across items, logs, and notes

### PWA & Internationalization
- Installable on iOS / Android home screens
- Service worker (Workbox) with runtime caching for the large ONNX / WASM models (30-day expiry)
- Bilingual UI (English / 中文), light & dark themes, selectable accent color scheme (blue / orange / green), compact density mode

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

### Build & Test

```bash
npm run build
npm run preview
npm run lint
npm run test          # Vitest, one-shot
npm run test:watch
```

Tests live in `tests/`, not alongside sources.

### Environment Variables

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
```

Firebase is the sole sync backend; without these variables the app still works fully in visitor mode.

### Deployment

Deployed as a static build (`npm run build` → `dist/`). [vercel.json](./vercel.json) sends `no-store` cache headers for `index.html` and `sw.js` so a new service worker is picked up on the next load instead of being served from cache.

## Keyboard Shortcuts

Blocked while focus is inside an `<input>` or `<textarea>`.

| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Practice / Metronome / Report / Notes |
| `Tab` / `Shift+Tab` | Cycle subpages on the current tab |
| `←` / `→` | Step the report date (daily = 1 day, weekly = 1 week, …) |
| `U` | Toggle time unit: minutes / hours |
| `L` | Toggle language: English / Chinese |
| `T` | Toggle theme: light / dark |
| `C` | Cycle accent color: blue → orange → green |
| `M` | Go to Metronome › Metronome |
| `P` | Go to Metronome › Practice (tempo-ramp drills) |
| `G` | Go to Report › Goals |
| `A` | Toggle accent on beat 1 (Metronome tab) |
| `S` | Stop the active practice timer |
| `R` / `Y` | Copyable report for today / yesterday |
| `Space` | Start/stop the focused practice item; play/pause a running drill |
| `↑` / `↓` | Move focus between practice items |
| `?` | Toggle the shortcuts help modal |

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

## Roadmap

Ideas not yet built, roughly in the order they'd add the most:

- Record what a tempo-ramp drill actually achieved (reached BPM, completion) and chart tempo progress per item — today only minutes are logged
- Recurring goals ("5 hours every week") alongside the current fixed-window target-hours goals
- Data export / import (JSON backup, CSV of logs)
- Session timeline on the daily report — `loggedAt` is already exact per log, but no view shows it
- Practice reminders via PWA notifications
- Chinese-language voice command patterns, and an STT fallback for browsers without the Web Speech API
- Point the on-device LLM at weekly-review analysis (plateau detection, next-tempo suggestions) rather than encouragement alone

## Documentation

- [CLAUDE.md](./CLAUDE.md) — the engineering reference: data model, sync correctness rules, architecture, gotchas
- [docs/superpowers/plans/](./docs/superpowers/plans/) and [docs/superpowers/specs/](./docs/superpowers/specs/) — per-feature design docs and implementation plans
- [docs/WAKE_WORD.md](./docs/WAKE_WORD.md), [docs/VOICE_COMMANDS_IMPLEMENTATION.md](./docs/VOICE_COMMANDS_IMPLEMENTATION.md) — voice subsystem notes

## Browser Support

- **Chrome (desktop & Android)** — full support, including wake-word hands-free mode
- **Safari / iOS** — PWA install, metronome, practice tracking, sync, TTS feedback; wake-word detection unavailable
- **Other Chromium browsers** — most features; wake word requires Chrome

## License

MIT

## Acknowledgments

Built with [Claude Code](https://claude.com/claude-code).
