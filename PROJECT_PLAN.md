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

---

## Upcoming Phases

### Phase 7 — Voice-Controlled Metronome & Voice Commands

Simple voice commands (no LLM) to control the metronome and practice timer hands-free.

| Task | Status |
|------|--------|
| Web Speech API integration | Not started |
| Command grammar (start/stop, set BPM, switch items) | Not started |
| Visual feedback for voice recognition state | Not started |
| Bilingual voice command support (EN/ZH) | Not started |

**Design doc:**
- [VOICE_COMMANDS_RESEARCH.md](./VOICE_COMMANDS_RESEARCH.md) — Simple structured commands (no LLM)

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
| Weekly summary view (total time, per-item breakdown) | Not started |
| Monthly summary view with calendar heatmap | Not started |
| Practice streak tracking (consecutive days) | Not started |
| Trend charts (time over weeks/months) | Not started |
| Personal best & milestone notifications | Not started |

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
