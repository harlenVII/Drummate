# Drummate — Project Plan

## Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Core Practice Tracker (timer, items, logs) | Done |
| 2 | Reports & Date Navigation | Done |
| 3 | Metronome (BPM dial, time signatures, subdivisions) | Done |
| 4 | Rhythm Sequencer | Done |
| 5 | Bilingual Support (EN/ZH) | Done |
| 6 | Data Sync Across Devices | Done |
| 9 | Weekly/Monthly Analytics | Done |

---

## Upcoming Phases

### Phase 7 — Voice-Controlled Metronome & Voice Commands

Simple voice commands (no LLM) to control the metronome and practice timer hands-free.

| Task | Status |
|------|--------|
| Wake word detection ("Drummate" via openWakeWord ONNX) | Done |
| Web Speech API integration (STT after wake word) | Done |
| Intent parser (regex-based command extraction) | Done |
| Voice command dispatch (metronome, practice, navigation) | Done |
| Voice feedback (speechSynthesis confirmations) | Done |
| Visual feedback for voice recognition state (FloatingVoiceIndicator) | Done |
| Fuzzy matching for practice item names (Levenshtein) | Done |
| Bilingual voice feedback (EN/ZH) | Done |
| Chinese-language command patterns (ZH regex) | Not started |
| Whisper WASM fallback for offline/cross-browser STT | Not started |

**Design docs:**
- [VOICE_COMMANDS_RESEARCH.md](./VOICE_COMMANDS_RESEARCH.md) — Research & design options
- [VOICE_COMMANDS_IMPLEMENTATION.md](./VOICE_COMMANDS_IMPLEMENTATION.md) — Implementation details
- [WAKE_WORD.md](./WAKE_WORD.md) — Wake word engine setup

---

### Phase 8 — On-Device LLM for Practice Insights & Encouragement

On-device LLM agent for intelligent features: encouragement, ambiguous command interpretation, and practice insights. Includes customized TTS with user's voice.

| Task | Status |
|------|--------|
| On-device LLM integration (WebLLM / browser inference) | Not started |
| Practice insight generation from session data | Not started |
| Encouragement messages during/after practice | Not started |
| Ambiguous voice command fallback to LLM | Not started |
| Custom TTS model with user's voice | Not started |

**Design doc:**
- [VOICE_AI_AGENT_RESEARCH.md](./VOICE_AI_AGENT_RESEARCH.md) — On-device LLM agent research

---

### Phase 9 — Weekly/Monthly Analytics & Streak Tracking

Rich analytics dashboard with practice trends, streaks, and goal tracking.

| Task | Status |
|------|--------|
| Weekly summary view (total time, per-item breakdown) | Done |
| Monthly summary view with calendar heatmap | Done |
| ~~Practice streak tracking (consecutive days)~~ | Removed |
| Trend charts (time over weeks/months) | Done |
| Personal best & milestone notifications | Deferred |

**Design doc:** _To be created_

---

### Phase 10 — Leaderboard Across Users

Social leaderboard to compare practice time with other Drummate users.

| Task | Status |
|------|--------|
| Backend API for aggregated user stats | Not started |
| Leaderboard UI (daily/weekly/all-time) | Not started |
| Privacy controls (opt-in, display name) | Not started |
| Achievement badges | Not started |

**Design doc:** _To be created_

**Depends on:** Phase 6 (Data Sync) — requires server-side user accounts
