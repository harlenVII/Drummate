# Voice Command Integration for Drummate — Technical Research

## Constraints

1. **All commands are structured intents** — e.g., "set tempo to 120", "generate daily report of yesterday"
2. **PWA support is a must** — must work installed on iOS Safari, Chrome Android, and desktop
3. **Wake word activation required** — hands-free "Hey Drummate" trigger, no UI button
4. **Encouragement feature** — after generating a daily report, Drummate speaks personalized encouraging words based on the practice data

---

## Architecture Overview

The full system needs **four capabilities**:

```
[Microphone always on]
    → 1. WAKE WORD detection ("Hey Drummate")
    → 2. SPEECH-TO-TEXT (transcribe user's command)
    → 3. INTENT PARSING (extract action + parameters)
    → 4. TEXT-TO-SPEECH (speak encouragement back to user)
```

Plus one **generation capability**:

```
[Practice data from IndexedDB]
    → 5. ENCOURAGEMENT GENERATION (create personalized message)
    → 4. TEXT-TO-SPEECH (speak it aloud)
```

---

## Is an LLM Necessary?

### Per-capability breakdown:

| Capability | LLM needed? | Best non-LLM alternative | Notes |
|-----------|-------------|--------------------------|-------|
| Wake word | No | Picovoice Porcupine | Purpose-built, ~1 MB |
| Speech-to-text | No | Whisper Tiny (WASM) | ~50–100 MB |
| Intent parsing | No | Regex / keyword matcher | Structured commands are trivially parseable |
| Text-to-speech | No | Browser `speechSynthesis` API | Built-in, zero download, works in iOS PWA |
| **Encouragement generation** | **It depends** | **Template engine** | See comparison below |

### The encouragement question: Templates vs LLM

#### Option A: Template Engine (No LLM)

```javascript
// Example template system
const templates = [
  "Great session! You practiced {totalTime} across {itemCount} skills today.",
  "Nice work on {longestItem} — {longestTime} of focused practice!",
  "{totalTime} today! That's {delta} more than yesterday. Keep it up!",
  "You've been consistent with {streakDays} days in a row. Impressive!",
  "Solid {longestItem} session. Every minute of practice counts!",
];
// Pick random template, fill in data from report
```

**Advantages:**
- Zero additional download
- Instant generation (<1ms)
- Predictable, safe output — no hallucinations
- Easy to translate (just add Chinese templates)
- Works offline on every device

**Disadvantages:**
- Gets repetitive after ~2 weeks of daily use
- Limited to scenarios you've pre-written
- Can't comment on nuanced patterns ("I notice you've been skipping rudiments lately")
- Adding variety requires writing more templates manually
- Feels mechanical — users may sense the pattern

**Practical capacity:** ~50–100 well-crafted templates with conditional logic can cover most scenarios for months before feeling stale.

#### Option B: Small On-Device LLM

```javascript
// Example: SmolLM2 135M generating encouragement
const prompt = `Based on this drum practice report, write one short encouraging sentence:
- Total: 45 minutes
- Rudiments: 20 min (44%)
- Paradiddles: 15 min (33%)
- Fills: 10 min (22%)
- Yesterday total: 30 min`;
// → "45 minutes today — that's 50% more than yesterday! Your rudiments are really coming along."
```

| Model | Download size | WASM (no WebGPU) | Quality |
|-------|-------------|------------------|---------|
| **SmolLM2 135M** | ~138 MB (Q8) | Yes, works everywhere | Basic but functional |
| **SmolLM2 360M** | ~200 MB (Q8) | Yes | Better variety |
| **Qwen2.5 0.5B** | ~300 MB (Q4) | Yes, but slower | Good natural language |
| **Phi-3 Mini 3.8B** | ~1.8 GB (Q4) | Too slow on CPU | Excellent quality |

**Advantages:**
- Every response is unique and natural
- Can notice patterns across data ("You doubled your rudiments time this week!")
- Scales to more complex insights without more code
- Feels genuinely personalized
- Foundation for Phase 8 (practice recommendations)

**Disadvantages:**
- 138–300 MB additional download on top of Whisper (~100 MB)
- 2–5 second generation time on mobile (WASM CPU)
- 3–10 second cold start when model first loads
- Small models can produce awkward or generic text
- Occasional hallucination ("You practiced 2 hours!" when it was 45 min)
- Needs prompt engineering to get consistent quality
- Higher battery drain

#### Option C: Hybrid (Recommended)

Use **templates as primary**, with an **optional LLM enhancement** that users can enable:

```
[Default — always works]
Template engine → speechSynthesis → instant encouragement

[Optional — user opts in]
Small LLM (SmolLM2 135M) → speechSynthesis → richer encouragement
Downloaded on demand, cached in IndexedDB
```

**Why this is the best approach:**
- App works great out of the box with zero AI download
- Power users who want richer responses can opt into the LLM
- Progressive enhancement — doesn't penalize users on slow connections
- You build the template system first (simpler), LLM second (additive)
- If the LLM is slow or fails, templates are the fallback

---

## Viable Solutions (Updated)

> Solution 3 (Push-to-Talk) removed per user requirement for wake word activation.

### Solution 1: Porcupine + Whisper + Regex + Templates

```
[Always on] → [Porcupine] → "Hey Drummate" detected
           → [Whisper Tiny WASM] → "generate daily report"
           → [Regex Parser] → { action: "report.generate", date: "today" }
           → [App generates report from IndexedDB]
           → [Template engine] → "Great session! 45 minutes across 3 skills today!"
           → [speechSynthesis] → speaks aloud
```

| Aspect | Details |
|--------|---------|
| **Download** | ~100 MB (Porcupine 1 MB + Whisper ~100 MB) |
| **Encouragement** | Template-based, instant, always works |
| **TTS** | Browser built-in `speechSynthesis` (0 KB) |
| **Offline** | Yes |
| **PWA** | Yes, all browsers |
| **LLM required** | No |

---

### Solution 2: Porcupine + Whisper + Regex + LLM + TTS

```
[Always on] → [Porcupine] → "Hey Drummate" detected
           → [Whisper Tiny WASM] → "generate daily report"
           → [Regex Parser] → { action: "report.generate", date: "today" }
           → [App generates report from IndexedDB]
           → [SmolLM2 135M] → "Awesome — 45 min today, 50% more than yesterday! Your rudiments really improved."
           → [speechSynthesis] → speaks aloud
```

| Aspect | Details |
|--------|---------|
| **Download** | ~240 MB (Porcupine 1 MB + Whisper ~100 MB + SmolLM2 ~138 MB) |
| **Encouragement** | LLM-generated, unique each time |
| **TTS** | Browser built-in `speechSynthesis` (0 KB) |
| **Offline** | Yes |
| **PWA** | Yes (WASM fallback, no WebGPU required for SmolLM2 135M) |
| **LLM required** | Yes |

---

### Solution 3: Picovoice Rhino + Templates

```
[Always on] → [Porcupine] → "Hey Drummate" detected
           → [Rhino] → { action: "report.generate", date: "today" }
           → [App generates report from IndexedDB]
           → [Template engine] → "Nice work! 45 min today!"
           → [speechSynthesis] → speaks aloud
```

| Aspect | Details |
|--------|---------|
| **Download** | ~3 MB (Porcupine 1 MB + Rhino 2 MB) |
| **Encouragement** | Template-based |
| **TTS** | Browser built-in `speechSynthesis` (0 KB) |
| **Offline** | Yes |
| **PWA** | Yes |
| **LLM required** | No |
| **Trade-off** | Smallest download, but commands locked to Picovoice-defined intents |

---

### Solution 4: Picovoice Rhino + LLM

```
[Always on] → [Porcupine] → "Hey Drummate" detected
           → [Rhino] → { action: "report.generate", date: "today" }
           → [App generates report from IndexedDB]
           → [SmolLM2 135M] → "You crushed it today — 45 minutes!"
           → [speechSynthesis] → speaks aloud
```

| Aspect | Details |
|--------|---------|
| **Download** | ~141 MB (Porcupine 1 MB + Rhino 2 MB + SmolLM2 ~138 MB) |
| **Encouragement** | LLM-generated |
| **TTS** | Browser built-in `speechSynthesis` (0 KB) |
| **Offline** | Yes |
| **PWA** | Yes |
| **LLM required** | Yes |

---

## Comparison

| | Sol 1: Whisper + Templates | Sol 2: Whisper + LLM | Sol 3: Rhino + Templates | Sol 4: Rhino + LLM |
|--|---------------------------|---------------------|-------------------------|-------------------|
| **Total download** | ~100 MB | ~240 MB | ~3 MB | ~141 MB |
| **Encouragement quality** | Repetitive after weeks | Unique every time | Repetitive after weeks | Unique every time |
| **Encouragement latency** | <1ms | 2–5s (mobile WASM) | <1ms | 2–5s (mobile WASM) |
| **Command flexibility** | Medium (regex) | Medium (regex) | Low (predefined) | Low (predefined) |
| **Adding new commands** | Edit regex code | Edit regex code | Retrain on Picovoice | Retrain on Picovoice |
| **Vendor dependency** | Picovoice (wake word) | Picovoice (wake word) | Picovoice (full) | Picovoice (full) |
| **Complexity** | Medium | High | Low–Medium | Medium–High |
| **Device support** | All | All (WASM) | All | All (WASM) |
| **Future-proof** | Add LLM later | Ready for Phase 8 | Add LLM later | Ready for Phase 8 |

---

## TTS: Browser speechSynthesis API

Good news — the **output** side (TTS) works well in PWA mode, unlike the input side (Speech Recognition):

| Platform | speechSynthesis in PWA | Notes |
|----------|----------------------|-------|
| iOS Safari PWA | Yes | Must trigger from user action; 36 voices available |
| Chrome Android | Yes | Full support |
| Desktop browsers | Yes | Full support, many voices |

**Usage:**
```javascript
const utterance = new SpeechSynthesisUtterance("Great practice today!");
utterance.rate = 1.0;
utterance.pitch = 1.0;
speechSynthesis.speak(utterance);
```

No model download needed. If you want higher-quality or offline-guaranteed TTS, **Piper TTS** (WASM, ~75 MB, 904 voices, MIT license) is the best alternative.

---

## Example Command Vocabulary

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

---

## Recommendation

### Recommended path: Solution 1 now → Solution 2 later

**Phase 1 — Ship voice commands (Solution 1):**
- Porcupine wake word + Whisper WASM + Regex + Template encouragement
- ~100 MB download, works everywhere, no LLM needed
- Build 50–100 encouragement templates with conditional logic
- Use browser `speechSynthesis` for TTS

**Phase 2 — Add LLM encouragement (upgrade to Solution 2):**
- Add SmolLM2 135M as opt-in download (~138 MB extra)
- Template system stays as fallback
- Progressive enhancement: LLM generates richer, more varied encouragement
- This also becomes the foundation for Phase 8 (practice insights)

### Bottom line: Is LLM a must?

**No, not for v1.** A well-crafted template system with 50–100 templates covering different scenarios (improved vs declined, streak milestones, item-specific praise, time-of-day variations) can feel personalized for weeks. But an LLM will feel meaningfully better after ~1 month of daily use when templates start repeating. The good news: the architecture is the same either way — you're just swapping the text generation step.

---

*Last updated: 2026-02-11*
