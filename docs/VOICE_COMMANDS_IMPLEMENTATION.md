# Voice Command Pipeline — Implementation

This document describes the implemented voice command pipeline. For the original research and design options, see [VOICE_COMMANDS_RESEARCH.md](./VOICE_COMMANDS_RESEARCH.md).

---

## Architecture

```
User says "Drummate"
    → 1. WAKE WORD detection (openWakeWord ONNX)     — already built
    → 2. SPEECH-TO-TEXT (Web Speech API)              — sttService.js
    → 3. INTENT PARSING (regex/keyword matcher)       — intentParser.js
    → 4. ACTION DISPATCH (dispatchVoiceCommand)       — App.jsx
    → 5. VOICE FEEDBACK (speechSynthesis)             — voiceFeedback.js
```

### State Machine

```
idle → listening → processing → feedback → idle
                 ↘ error → idle (after 2.5s)
```

| State | Duration | UI |
|-------|----------|----|
| `idle` | Default | No indicator |
| `listening` | Up to 7s (STT timeout) | Green pulsing pill: "Listening for command..." |
| `processing` | ~instant | Blue pill: shows transcript text |
| `feedback` | 2.5s | Blue pill (voice speaks confirmation) |
| `error` | 2.5s | Red pill: "Didn't understand" |

---

## Design Decision: Web Speech API (not Whisper)

The research doc recommended Whisper Tiny WASM (~100 MB), but the implementation uses the browser-native `SpeechRecognition` API instead:

| | Web Speech API (chosen) | Whisper WASM (deferred) |
|--|------------------------|------------------------|
| **Download** | 0 KB | ~100 MB |
| **Latency** | <1s | 1–3s |
| **Browser** | Chrome only | Any (once loaded) |
| **Offline** | Chrome has built-in models | Fully offline |
| **Accuracy** | Very good for short commands | Better for noisy/accented speech |

**Rationale:** The app is already Chrome-only gated for hands-free mode (ONNX WASM compatibility). Chrome includes built-in speech recognition models. For short structured commands, Web Speech API is accurate and instant with zero download overhead. Whisper remains a future upgrade path for cross-browser or offline support.

---

## Files

### New Files

| File | Purpose |
|------|---------|
| `src/services/sttService.js` | Web Speech API wrapper — `createSttService()` returns `{ listenOnce() }` |
| `src/services/intentParser.js` | Regex intent extraction — `parseIntent(text)` + `findBestItemMatch(query, items)` |
| `src/services/voiceFeedback.js` | Browser speechSynthesis — `speak(text, opts)`, `getLang()`, `cancelSpeech()` |
| `src/components/FloatingVoiceIndicator.jsx` | Floating pill overlay showing listening/processing/error states |

### Modified Files

| File | Changes |
|------|---------|
| `src/App.jsx` | Added `dispatchVoiceCommand`, STT pipeline in wake word callback, `FloatingVoiceIndicator` mount, new state vars (`listeningState`, `voiceTranscript`, `sttServiceRef`) |
| `src/components/SettingsPanel.jsx` | Added `listeningState` and `voiceTranscript` props, richer status display |
| `src/contexts/LanguageContext.jsx` | Added `handsFree.listening`, `handsFree.commandError`, `handsFree.commandConfirm` keys (EN + ZH) |

---

## Speech-to-Text: `sttService.js`

Promise-based wrapper around `window.SpeechRecognition`:

```javascript
const sttService = createSttService(); // returns null if unsupported
const transcript = await sttService.listenOnce({
  language: 'en-US',  // or 'zh-CN'
  timeoutMs: 7000,
});
```

- `continuous: false` — captures one utterance, then resolves
- `interimResults: false` — only returns the final transcript
- 7-second timeout guard for edge cases where `onend` doesn't fire
- Rejects with: `'no-speech'`, `'not-allowed'`, `'network'`, `'timeout'`, `'aborted'`

---

## Intent Parser: `intentParser.js`

Pure function — no side effects, no imports, no state.

### `parseIntent(text)` → `{ action, ...params }`

Strips leading "drummate" from transcript (mic may capture tail of wake word), then matches regex patterns in priority order.

### Supported Commands

```
Metronome:
  "start the metronome"          → { action: 'metronome.start' }
  "stop"                         → { action: 'metronome.stop' }
  "set tempo to 120"             → { action: 'metronome.setTempo', value: 120 }
  "120 BPM"                      → { action: 'metronome.setTempo', value: 120 }
  "increase tempo by 10"         → { action: 'metronome.adjustTempo', delta: +10 }
  "slow down by 5"               → { action: 'metronome.adjustTempo', delta: -5 }
  "set time signature to 3/4"    → { action: 'metronome.setTimeSignature', value: [3, 4] }
  "switch to triplets"           → { action: 'metronome.setSubdivision', value: 'triplet' }

Practice:
  "start practicing rudiments"   → { action: 'practice.start', itemQuery: 'rudiments' }
  "stop the timer"               → { action: 'practice.stop' }

Reports:
  "show report"                  → { action: 'report.generate', date: 'today' }

Navigation:
  "go to metronome"              → { action: 'navigate', tab: 'metronome' }
  "switch to sequencer"          → { action: 'navigate', tab: 'metronome', subpage: 'sequencer' }

Settings:
  "switch language"              → { action: 'toggleLanguage' }

Unknown:
  anything else                  → { action: 'unknown', text: '...' }
```

### "Start" Ambiguity

- "start the metronome" / "start the beat" / "start the click" → `metronome.start`
- "start practicing X" / "start working on X" → `practice.start`
- Bare "start" alone → falls to `unknown` (safe default — no accidental triggers)

### Practice Item Fuzzy Matching

`findBestItemMatch(query, items)` uses a three-tier strategy:

1. **Exact match** — case-insensitive
2. **Substring match** — either direction (query contains name, or name contains query)
3. **Levenshtein distance** — accepts if edit distance <= 35% of item name length (min threshold: 2)

---

## Action Dispatch: `dispatchVoiceCommand` (in `App.jsx`)

Maps parsed intents to app handlers. Key patterns:

**Metronome start/stop** — calls engine directly + sets React state (mirrors `Metronome.jsx:handleTogglePlay`):
```
Start: engine.setSequence(null) → noSleep.enable() → engine.start() → setMetronomeIsPlaying(true)
Stop:  engine.stop() → setMetronomeIsPlaying(false) → setMetronomeCurrentBeat(-1) → noSleep.disable()
```

**Practice start** — fuzzy-matches spoken item name → calls `handleStart(item.id)`, navigates to practice tab.

**All actions** provide bilingual voice feedback via `speak()` (EN/ZH based on current language).

---

## Voice Feedback: `voiceFeedback.js`

Uses browser `speechSynthesis` API:

```javascript
speak('Tempo set to 120', { lang: 'en-US', rate: 1.05 });
```

- Cancels any in-progress speech before starting new utterance
- `getLang('en')` → `'en-US'`, `getLang('zh')` → `'zh-CN'`
- Works on all target platforms (Chrome desktop + Android)

---

## Floating Voice Indicator: `FloatingVoiceIndicator.jsx`

Positioned `fixed bottom-20` (above TabBar), `z-50`. Only renders when `handsFreeMode` is on and `listeningState !== 'idle'`.

| State | Color | Content |
|-------|-------|---------|
| `listening` | Green + pulse | "Listening for command..." |
| `processing` | Blue | Shows transcript in quotes |
| `feedback` | Blue | (voice is speaking) |
| `error` | Red | "Didn't understand" |

---

## Implementation Notes

### Microphone Coordination

The wake word engine holds a continuous `getUserMedia` stream. Chrome's `SpeechRecognition` time-multiplexes the same microphone — no conflict. The `parseIntent()` function strips a leading "drummate" from the transcript since the mic may capture the tail end of the wake word.

### Audio Session

`wakeWordEngine.js` sets `navigator.audioSession.type = 'play-and-record'` when hands-free is on, allowing mic + speaker to coexist. No additional audio session handling needed.

### NoSleep Coordination

Metronome start enables NoSleep, stop disables it — same pattern as `Metronome.jsx:handleTogglePlay`.

### Stale Closure Prevention

The `handleToggleHandsFree` callback depends on `language` and `dispatchVoiceCommand` (which itself depends on all relevant state). When language or app state changes, the callback is recreated and `onDetected` is re-registered with fresh closures on the next toggle cycle.

---

## Not Yet Implemented

- **Whisper WASM** — future upgrade for offline/cross-browser STT
- **Chinese-language command patterns** — regex currently English-only
- **Sequencer voice control** — complex (e.g., "add triplet to beat 3")
- **iOS Safari** — blocked by no `SpeechRecognition` API in Safari
- **Bare "start" disambiguation** — could use app state context (is metronome playing? is a practice item active?)

---

*Last updated: 2026-02-23*
