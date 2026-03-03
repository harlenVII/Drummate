# Voice Commands for Drummate — Simple Commands (No LLM)

This document covers **structured voice commands** that map directly to app actions. These are fast, deterministic, and require no LLM.

For the on-device LLM agent (encouragement generation, ambiguous command handling, practice insights), see [VOICE_AI_AGENT_RESEARCH.md](./VOICE_AI_AGENT_RESEARCH.md).

---

## Scope

Commands that have a **clear intent and predictable structure**:

- "start the metronome" → start playback
- "set tempo to 120" → change BPM
- "stop" → stop whatever is running
- "generate daily report" → show today's report

These don't need AI — regex/keyword matching responds in <100ms.

---

## Constraints

1. **PWA support** — must work in iOS Safari PWA, Chrome Android, and desktop
2. **Wake word activation** — "Drummate" trigger word, no UI button
3. **Offline** — all processing on-device, no server calls
4. **Fast** — command response in <1 second
5. **Open source** — no vendor lock-in, no user/device limits
6. **Free for distribution** — ~50 users, some in China, non-commercial

---

## Architecture

```
[Microphone listening — "Hands-Free Mode" enabled by user]
    → 1. WAKE WORD detection ("Drummate")   — see Wake Word section
    → 2. SPEECH-TO-TEXT (transcribe command)  — Whisper Tiny (WASM)
    → 3. INTENT PARSING (extract action)     — Regex / keyword matcher
    → 4. ACTION DISPATCH                     — App executes the command
    → 5. VOICE FEEDBACK (optional)           — Browser speechSynthesis
```

### Component Breakdown

| Component | Technology | Download | Latency |
|-----------|-----------|----------|---------|
| Wake word | openWakeWord or TF.js Speech Commands | 5–15 MB | Real-time |
| Speech-to-text | Whisper Tiny (WASM) | ~100 MB | 1–3s |
| Intent parsing | Regex / keyword matcher | 0 KB | <1ms |
| Voice feedback | Browser `speechSynthesis` | 0 KB | Instant |
| **Total** | | **~105–115 MB** | **1–3s end-to-end** |

---

## Wake Word Detection

### Why Not Picovoice Porcupine?

Picovoice Porcupine was the initial choice but is **not viable** for this project:

- **Not open source** — proprietary engine, requires AccessKey
- **Free tier limited to 3 active devices** — we need ~50 users
- **AccessKey phones home** — engines call Picovoice servers to validate, not purely on-device. Users in China may have connectivity issues.
- **Paid plans start at ~$6,000** — not feasible for a free personal project

### Option A: openWakeWord + onnxruntime-web (Recommended)

**License:** Apache 2.0 — no user limits, no server calls, fully open source.

[openWakeWord](https://github.com/dscripka/openWakeWord) is a purpose-built wake word engine with models exported as ONNX files, runnable in-browser via [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web).

#### How It Works

Three-stage ONNX pipeline, all running in-browser:

```
Raw PCM audio (16kHz, 80ms chunks)
    → 1. melspectrogram.onnx — converts audio to mel features
    → 2. embedding_model.onnx — produces 96-dim feature vectors
    → 3. drummate.onnx — classifies: wake word or not?
    + silero_vad.onnx — voice activity detection (filters silence)
```

#### Training "Drummate" Model

- Train via Python pipeline (Google Colab, ~1 hour)
- **100% synthetic data** — Piper TTS generates thousands of varied pronunciations, zero real recordings needed
- Outputs a small `.onnx` file (~200 KB)
- Bundle with your app — users download nothing extra

#### Accuracy

- Target: **<0.5 false activations per hour** (purpose-built for wake word detection)
- The "alexa" model reportedly outperforms Picovoice Porcupine on benchmarks
- Single words have slightly higher false-positive risk than multi-word phrases, but "Drummate" is unique enough to compensate

#### onnxruntime-web Browser Support

```bash
npm install onnxruntime-web
```

| Backend | iOS Safari | Android | Desktop | Notes |
|---------|-----------|---------|---------|-------|
| **WebGL** | **Yes** | Yes | Yes | Stable, works for embedding + classifier models |
| **WASM** | Yes (with workarounds) | Yes | Yes | Needed for mel spectrogram model (audio operators not supported in WebGL) |
| **WebGPU** | **No** | Partial | Yes | iOS Safari has WebGPU API since 18.2, but onnxruntime-web doesn't support it on iOS yet |

**Hybrid backend approach** (documented by [Deep Core Labs](https://deepcorelabs.com/open-wake-word-on-the-web/)):
- Mel spectrogram model → **WASM** (small model, fast even on CPU; uses audio operators unsupported by WebGL)
- Embedding + classifier models → **WebGL** (GPU accelerated)

#### Existing React Wrapper

[openwakeword_wasm](https://github.com/dnavarrom/openwakeword_wasm) (`openwakeword-wasm-browser` on npm) provides a working starting point:

```javascript
const engine = new WakeWordEngine({
  keywords: ['drummate'],
  baseAssetUrl: '/models',
  detectionThreshold: 0.5,
  executionProviders: ['wasm'],
});

await engine.load();
await engine.start();
engine.on('detect', ({ keyword, score }) => { /* wake word detected! */ });
```

**Assessment of the wrapper:** It's a proof-of-concept (~300 lines, 8 commits in one day, 1 star) but the code is clean and the pipeline implementation is correct. **Recommended approach: vendor the source** (copy `WakeWordEngine.js` into your project) rather than depend on the npm package. Key improvements needed:

1. **Move inference to a Web Worker** — currently runs on main thread, could cause metronome timing jitter
2. **Add WebGL backend** for embedding/classifier models (currently WASM only)
3. **Test on iOS Safari** — no iOS testing done by the author
4. **Coordinate AudioContext** — engine creates its own at 16kHz alongside metronome's

#### Download Size

| Component | Size |
|-----------|------|
| melspectrogram.onnx | ~small |
| embedding_model.onnx | ~10–15 MB |
| drummate.onnx (custom keyword) | ~200 KB |
| silero_vad.onnx | ~2 MB |
| onnxruntime-web WASM binary | ~5–8 MB (gzipped) |
| **Total** | **~15–25 MB** |

#### Integration Effort

~2–3 days of focused work:
- Vendor WakeWordEngine.js, adapt for Vite + React 19
- Move inference to Web Worker
- Configure Vite for WASM file serving
- Add `.onnx` and `.wasm` to PWA service worker cache
- Test on iOS Safari

---

### Option B: TensorFlow.js Speech Commands (Alternative)

**License:** Apache 2.0 — no limits.

[`@tensorflow-models/speech-commands`](https://www.npmjs.com/package/@tensorflow-models/speech-commands) — transfer learning on Google's speech commands model to recognize "Drummate."

#### How It Works

- Base model (~5–7 MB from CDN) trained on 20 English words
- Transfer learning: freeze base layers, retrain final layer for "Drummate"
- Can train **entirely in-browser** — no Python needed

#### Training Options

**Developer pre-trains (recommended):**
1. Collect ~50–100 samples from diverse speakers (English + Chinese accented)
2. Train in browser (~15 seconds)
3. Export weights (~10–50 KB), bundle in `public/`
4. End users load pre-trained model — no recording needed

**Optional user personalization:**
- Users record 5–10 samples to fine-tune for their voice
- Quick retrain (~5 seconds), saved to IndexedDB

#### Accuracy

| Metric | Controlled | Real-world |
|--------|-----------|------------|
| True positive rate | 85–95% | 70–85% |
| False positive rate | 1–5% per hour | 5–15% per hour |

Lower accuracy than openWakeWord — not purpose-built for wake word detection.

#### Chinese Accent Handling

Better than openWakeWord for accents because:
- Transfer learning lets you include Chinese-accented samples in training data
- Optional user personalization naturally adapts to any accent
- openWakeWord uses English-only synthetic TTS for training

#### iOS Safari

Reliable — TF.js WebGL backend is mature and well-tested on iOS Safari.

#### Download Size

~5–7 MB (base model) + ~50 KB (custom weights)

#### Integration Effort

~1–2 days — well-documented npm package with working examples.

---

### Wake Word Comparison

| | openWakeWord + ONNX RT Web | TF.js Speech Commands |
|--|---------------------------|----------------------|
| **Accuracy** | Higher (<0.5 false/hour) | Lower (5–15 false/hour) |
| **Training** | Python (Colab, synthetic) | In-browser (real recordings) |
| **User setup** | None — pre-trained | None if dev pre-trains; optional personalization |
| **Download** | ~15–25 MB | ~5–7 MB |
| **iOS Safari** | Works (hybrid WASM+WebGL) — needs testing | Works — battle-tested |
| **Chinese accents** | Weaker (English-only TTS) | Better (can include accent samples) |
| **Integration effort** | 2–3 days | 1–2 days |
| **Battery impact** | Moderate (efficient pipeline) | Moderate–High (15–30% extra/hour) |

### Recommendation

**Start with openWakeWord (Option A)** for better accuracy and no user training required. Fall back to TF.js Speech Commands (Option B) if iOS Safari testing reveals blocking issues.

Both options can be swapped without changing the rest of the pipeline (Whisper + Regex + speechSynthesis).

---

### iOS Limitation (Applies to ALL Wake Word Solutions)

**Wake word only works while the app is in the foreground.** iOS suspends microphone access when the PWA is backgrounded or the phone is locked. This is a platform-level restriction no engine can work around.

For Drummate this is acceptable — users are actively practicing with the app open.

**Recommended UX:**
- "Hands-Free Mode" toggle — not always-on by default (saves battery)
- Mic indicator when listening (privacy + UX)
- Manual toggle to enable/disable voice detection

---

## Speech-to-Text: Whisper Tiny (WASM)

- OpenAI Whisper Tiny model compiled to WASM
- ~100 MB download (one-time, cached)
- Runs entirely in-browser, no server needed
- Activated only after wake word detected (not always-on)
- Transcription takes 1–3 seconds for short commands

---

## Intent Parsing: Regex / Keyword Matcher

Fast, deterministic parsing for structured commands. No ML needed.

### Command Vocabulary

```
Metronome:
  "start the metronome"          → { action: "metronome.start" }
  "stop"                         → { action: "metronome.stop" }
  "set tempo to 120"             → { action: "metronome.setTempo", value: 120 }
  "increase BPM by 10"           → { action: "metronome.adjustTempo", delta: +10 }
  "decrease BPM by 5"            → { action: "metronome.adjustTempo", delta: -5 }
  "set time signature to 3/4"    → { action: "metronome.setTimeSignature", value: [3, 4] }
  "switch to triplets"           → { action: "metronome.setSubdivision", value: "triplet" }

Practice:
  "start practicing rudiments"   → { action: "practice.start", item: "rudiments" }
  "stop timer"                   → { action: "practice.stop" }

Reports:
  "generate daily report"        → { action: "report.generate", date: "today" }
  "generate report of yesterday" → { action: "report.generate", date: "yesterday" }
  "show report for January 5th"  → { action: "report.show", date: "2026-01-05" }

Navigation:
  "go to metronome"              → { action: "navigate", tab: "metronome" }
  "switch to practice"           → { action: "navigate", tab: "practice" }

Settings:
  "switch language"              → { action: "toggleLanguage" }
```

### Example Regex Patterns

```javascript
function parseIntent(text) {
  const t = text.toLowerCase().trim();

  // Metronome start
  if (/start\s+(the\s+)?(metronome|click|beat)/i.test(t))
    return { action: 'metronome.start' };

  // Stop (universal)
  if (/^(stop|pause|quiet)/i.test(t))
    return { action: 'metronome.stop' };

  // Set BPM
  const bpmMatch = t.match(/(?:set\s+)?(?:tempo|bpm)\s+(?:to\s+)?(\d+)/i);
  if (bpmMatch)
    return { action: 'metronome.setTempo', value: parseInt(bpmMatch[1]) };

  // Adjust BPM
  const adjustMatch = t.match(/(increase|decrease|raise|lower)\s+(?:the\s+)?(?:tempo|bpm)\s+(?:by\s+)?(\d+)/i);
  if (adjustMatch) {
    const delta = parseInt(adjustMatch[2]);
    const sign = /increase|raise/i.test(adjustMatch[1]) ? 1 : -1;
    return { action: 'metronome.adjustTempo', delta: sign * delta };
  }

  // Time signature
  const tsMatch = t.match(/(?:set\s+)?(?:time\s+signature)\s+(?:to\s+)?(\d+)\s*[\/over]\s*(\d+)/i);
  if (tsMatch)
    return { action: 'metronome.setTimeSignature', value: [parseInt(tsMatch[1]), parseInt(tsMatch[2])] };

  // Subdivision
  const subMap = { triplet: 'triplet', triplets: 'triplet', eighth: 'eighth', sixteenth: 'sixteenth', quarter: 'quarter' };
  const subMatch = t.match(/(?:switch\s+to|set)\s+(triplets?|eighth|sixteenth|quarter)/i);
  if (subMatch)
    return { action: 'metronome.setSubdivision', value: subMap[subMatch[1].toLowerCase()] };

  // Practice start
  const practiceMatch = t.match(/start\s+(?:practicing?\s+)?(.+)/i);
  if (practiceMatch && !/(metronome|click|beat)/i.test(practiceMatch[1]))
    return { action: 'practice.start', item: practiceMatch[1].trim() };

  // Report
  const reportMatch = t.match(/(?:generate|show|get)\s+(?:the\s+)?(?:daily\s+)?report\s*(?:of|for)?\s*(today|yesterday|.+)?/i);
  if (reportMatch)
    return { action: 'report.generate', date: reportMatch[1]?.trim() || 'today' };

  // Navigation
  const navMatch = t.match(/(?:go\s+to|switch\s+to|open)\s+(practice|metronome|report|sequencer)/i);
  if (navMatch)
    return { action: 'navigate', tab: navMatch[1].toLowerCase() };

  // Language toggle
  if (/switch\s+language|toggle\s+language|change\s+language/i.test(t))
    return { action: 'toggleLanguage' };

  // Unrecognized — could be forwarded to LLM agent if available
  return { action: 'unknown', text: t };
}
```

### Handling "Unknown" Commands

When regex can't parse a command, two options:

1. **Without LLM agent:** Voice feedback says "Sorry, I didn't understand that command"
2. **With LLM agent installed:** Forward to the on-device LLM for interpretation (see [VOICE_AI_AGENT_RESEARCH.md](./VOICE_AI_AGENT_RESEARCH.md))

---

## Voice Feedback: Browser speechSynthesis API

For confirming commands ("Tempo set to 120") and simple encouragement templates.

| Platform | speechSynthesis in PWA | Notes |
|----------|----------------------|-------|
| iOS Safari PWA | Yes | Must trigger from user action; 36 voices available |
| Chrome Android | Yes | Full support |
| Desktop browsers | Yes | Full support, many voices |

```javascript
function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}
```

For higher-quality or offline-guaranteed TTS, **Piper TTS** (WASM, ~75 MB, 904 voices, MIT license) is an alternative.

---

## Template-Based Encouragement (for Reports)

When a report is generated via voice command, the app can speak a template-based encouragement:

```javascript
const templates = [
  "Great session! You practiced {totalTime} across {itemCount} skills today.",
  "Nice work on {longestItem} — {longestTime} of focused practice!",
  "{totalTime} today! That's {delta} more than yesterday. Keep it up!",
  "You've been consistent with {streakDays} days in a row. Impressive!",
  "Solid {longestItem} session. Every minute of practice counts!",
];
```

- Zero download, instant (<1ms)
- Predictable, no hallucinations
- Easy to translate (add Chinese templates)
- 50–100 well-crafted templates cover months of daily use
- Can be upgraded to LLM-generated encouragement later (see [VOICE_AI_AGENT_RESEARCH.md](./VOICE_AI_AGENT_RESEARCH.md))

---

## Summary

| Aspect | Details |
|--------|---------|
| **Total download** | ~105–125 MB (wake word 5–25 MB + Whisper ~100 MB) |
| **End-to-end latency** | 1–3 seconds (wake word → action executed) |
| **Offline** | Yes, fully — no server calls |
| **PWA** | Yes, all platforms (foreground only for mic) |
| **LLM required** | No |
| **User/device limits** | None — fully open source |
| **Command flexibility** | Medium — adding commands = adding regex patterns |
| **Encouragement** | Template-based, instant |
| **Future upgrade path** | Unknown commands can be routed to LLM agent |

---

*Last updated: 2026-02-20*
