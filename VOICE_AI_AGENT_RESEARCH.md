# On-Device LLM Agent for Drummate — Research

This document covers the **on-device LLM agent** that handles tasks requiring intelligence beyond simple regex parsing: encouragement generation, ambiguous command interpretation, and future practice insights.

For simple structured voice commands (no LLM needed), see [VOICE_COMMANDS_RESEARCH.md](./VOICE_COMMANDS_RESEARCH.md).

---

## Scope

The LLM agent handles what regex cannot:

1. **Encouragement generation** — personalized messages based on practice data
2. **Ambiguous command interpretation** — commands the regex parser can't match
3. **Future: Practice insights** — "What should I practice?" recommendations based on history

---

## Constraints

1. **Fully on-device** — no cloud API calls, works offline
2. **PWA compatible** — must work in iOS Safari PWA
3. **Open source** — no vendor lock-in, no user/device limits, no server calls
4. **Reasonable download** — model should be <500 MB
5. **Acceptable latency** — 3–10 seconds for generative responses is OK (these are not time-critical)

---

## Architecture: Agent Pattern

The LLM acts as a unified "brain" — it receives text input and context, then decides what to do.

```
[From simple voice commands pipeline — "unknown" commands]
    → LLM Agent receives: transcribed text + optional practice data
    → LLM Agent outputs: structured JSON

[From report generation — encouragement request]
    → LLM Agent receives: practice report data
    → LLM Agent outputs: personalized encouragement text
```

### Integration with Simple Commands Pipeline

```
[Whisper STT] → transcribed text
       ↓
[Regex Parser] — tries fast matching first (<1ms)
       ↓
  ┌─ MATCHED → execute action immediately
  └─ UNKNOWN → forward to LLM Agent (3–10s)
                    ↓
              [LLM Agent + GBNF grammar]
                    ↓
              structured JSON response
                    ↓
              execute action or speak response
```

### Agent Prompt Design

The LLM receives a system prompt that defines two output formats:

```
You are DrumBot, a drum practice assistant. Given a user's voice command
and optionally their practice data, respond with JSON.

FORMAT 1 — Action (for commands):
{"type": "action", "action": "<action_name>", "params": {<parameters>}}

FORMAT 2 — Response (for encouragement, questions, insights):
{"type": "response", "text": "<your message to the user>"}

Available actions:
- setBpm: params {bpm: number}
- setTimeSignature: params {beats: number, noteValue: number}
- startMetronome: params {}
- stopMetronome: params {}
- startPractice: params {itemName: string}
- stopPractice: params {}
- setSubdivision: params {pattern: "quarter"|"eighth"|"triplet"|"sixteenth"}
- setSoundType: params {sound: "click"|"woodBlock"|"hiHat"|"rimshot"|"beep"}
- navigate: params {tab: "practice"|"metronome"|"report"}
- generateReport: params {date: string}
- unknown: params {}

Rules:
- For clear commands → FORMAT 1
- For encouragement, feedback, or questions → FORMAT 2
- If you cannot understand → {"type": "action", "action": "unknown", "params": {}}
```

### Example Interactions

```
User: "play at one twenty"
→ {"type": "action", "action": "setBpm", "params": {"bpm": 120}}

User: "how am I doing today?"
[context: 45 min total, 3 items practiced, 15 min more than yesterday]
→ {"type": "response", "text": "45 minutes across 3 exercises — that's 15 more than yesterday! Your consistency is paying off."}

User: "make it faster"
[context: current BPM is 100]
→ {"type": "action", "action": "setBpm", "params": {"bpm": 110}}

User: "what should I work on?"
[context: rudiments 5 min avg, fills 25 min avg this week]
→ {"type": "response", "text": "Your fills are strong this week. Maybe give rudiments some extra love — they've been getting less time lately."}
```

---

## Encouragement Latency: End-to-End Estimate

From **user stops talking** to **TTS starts speaking** (Qwen2.5-0.5B, WASM):

### Scenario A: Report-triggered ("generate daily report")

```
User stops talking
  → Whisper STT .............. 1–3s (iPhone) / 2–4s (Android)
  → Regex parse .............. <1ms
  → IndexedDB query .......... <50ms
  → Report shown on screen ... <50ms
  ─── user is now reading the report ───
  → LLM prompt build ......... <50ms
  → LLM time-to-first-token .. 1–3s (iPhone) / 3–6s (Android)
  → LLM generation (~50 tok) . 4–8s (iPhone) / 8–17s (Android)
  → TTS starts speaking
```

| Phase | iPhone (recent) | Android mid-range |
|-------|----------------|-------------------|
| Whisper STT | 1–3s | 2–4s |
| Regex + DB + show report | ~0.1s | ~0.1s |
| LLM inference (warm) | 5–11s | 11–23s |
| **Total to TTS** | **~6–14s** | **~13–27s** |

Report appears on screen at ~3s — user reads while LLM works. Perceived wait is just the LLM time.

### Scenario B: Direct question ("how am I doing today?")

Same total: **~6–14s (iPhone) / ~13–27s (Android)**. No early visual feedback.

### Cold Start Penalty (First Use After Page Load)

| | iPhone | Android mid-range |
|--|--------|-------------------|
| WASM init + model load from cache | +2–4s | +4–8s |

First encouragement after opening the app: **~8–18s (iPhone) / ~17–35s (Android)**.

---

## Technology Stack

### Inference Library: wllama

| Aspect | Details |
|--------|---------|
| **Backend** | WASM (works everywhere) + optional WebGPU acceleration |
| **Model format** | GGUF (standard llama.cpp format) |
| **Key feature** | **GBNF grammar-constrained decoding** — guarantees valid JSON output |
| **iOS Safari PWA** | Yes (WASM, no WebGPU needed) |
| **Bundle size** | ~2 MB (WASM runtime) |
| **Model caching** | OPFS or Cache API — download once, load from local storage |

**Why wllama over alternatives:**

| Library | WebGPU required? | GBNF grammar? | iOS PWA? |
|---------|-----------------|---------------|----------|
| **wllama** | No (WASM fallback) | **Yes** | **Yes** |
| web-llm (MLC) | Yes | No | No — iOS has no WebGPU |
| transformers.js | No | No | Yes, but no constrained decoding |
| llama-cpp-wasm | No | Yes | Yes, but less polished than wllama |

### GBNF Grammar for Structured Output

GBNF (GGML BNF) forces the model to only produce tokens that form valid JSON matching your schema. This is critical — without it, small models produce invalid JSON 10–40% of the time.

```
root       ::= "{" ws "\"type\"" ws ":" ws type-value ws "}"
type-value ::= action-obj | response-obj

action-obj ::= "\"action\"" ws "," ws
               "\"action\"" ws ":" ws action-name ws "," ws
               "\"params\"" ws ":" ws params

response-obj ::= "\"response\"" ws "," ws
                 "\"text\"" ws ":" ws string

action-name ::= "\"setBpm\"" | "\"startMetronome\"" | "\"stopMetronome\""
              | "\"setTimeSignature\"" | "\"startPractice\"" | "\"stopPractice\""
              | "\"setSubdivision\"" | "\"setSoundType\"" | "\"navigate\""
              | "\"generateReport\"" | "\"unknown\""

params  ::= "{" ws (param (ws "," ws param)*)? ws "}"
param   ::= string ws ":" ws (number | string)
number  ::= [0-9]+
string  ::= "\"" [^"]* "\""
ws      ::= [ \t\n]*
```

**Result:** 100% valid JSON guaranteed. The model's job is reduced to choosing the right action and filling in values — even a 0.5B model handles this reliably.

---

## Model Recommendation: Qwen2.5-0.5B-Instruct

| Aspect | Details |
|--------|---------|
| **Parameters** | 0.5 billion |
| **Download** | ~350 MB (Q4_K_M quantization) |
| **Memory usage** | ~600–800 MB |
| **Why this model** | Best instruction-following at this size; Qwen2.5 family trained for structured output |

### Performance on Mobile (WASM, no WebGPU)

| Metric | iPhone (recent) | Android mid-range |
|--------|----------------|-------------------|
| Model load from cache | 2–4s | 4–8s |
| Time to first token | 1–3s | 3–6s |
| Tokens/second | 6–12 tok/s | 3–6 tok/s |
| Memory usage | ~600–800 MB | ~600–800 MB |

### Latency Estimates by Task

| Task | Output length | Time on mobile |
|------|-------------|----------------|
| Intent parsing (action) | ~30 tokens | 3–8s |
| Short encouragement | ~50 tokens | 5–12s |
| Detailed insight | ~100 tokens | 10–20s |

This latency is acceptable because:
- Simple commands are already handled by regex (<1ms) — the LLM only gets ambiguous/generative tasks
- Encouragement is spoken after a report is shown — user is already reading, a few seconds of delay is natural
- A "thinking..." indicator provides feedback while the model generates

### Alternative: Qwen2.5-1.5B-Instruct

| Aspect | 0.5B | 1.5B |
|--------|------|------|
| Download | ~350 MB | ~900 MB |
| Memory | ~600–800 MB | ~1.2–1.5 GB |
| Quality | Good for structured, basic for generation | Very good for both |
| iOS safety | Comfortable under memory limit | Tight — risk of OS killing PWA |

**Recommendation:** Start with 0.5B. Offer 1.5B as an optional "high quality" download for users with capable devices.

---

## iOS Compatibility Notes

### onnxruntime-web (used by wake word, not LLM)

| Backend | iOS Safari | Notes |
|---------|-----------|-------|
| WASM | Works with workarounds | Pin to v1.17.3, disable SIMD, single-thread |
| WebGL | Works | Stable, mature — use for embedding/classifier models |
| WebGPU | **Not working** | iOS 18.2 has the WebGPU API, but onnxruntime-web doesn't support it on iOS. [GitHub issue #22776](https://github.com/microsoft/onnxruntime/issues/22776) was closed without confirming WebGPU fix. |

### wllama (used by LLM agent)

| Backend | iOS Safari | Notes |
|---------|-----------|-------|
| WASM | Works | Standard llama.cpp WASM, well-tested |
| WebGPU | Not available on iOS | Falls back to WASM automatically |

**Bottom line:** Everything works on iOS via WASM/WebGL. WebGPU would be faster but isn't available yet. Performance is still acceptable for the use cases (wake word detection is lightweight; LLM latency is expected).

---

## Hallucination & Safety

Small models can hallucinate data. Mitigations:

1. **Inject exact data into the prompt** — don't ask the model to recall, give it the numbers
2. **Post-validate actions** — if the model says `{"bpm": 999}`, clamp to valid range (30–300)
3. **GBNF grammar** — prevents structural errors (invalid JSON, wrong field names)
4. **Fallback to templates** — if the model's encouragement looks wrong (too short, contains errors), fall back to a template

---

## Implementation Plan

### Phase 1: Opt-in Download & Setup

- Add "Download AI Assistant (~350 MB)" option in settings
- Download Qwen2.5-0.5B GGUF via wllama, cache in OPFS
- Show download progress, allow cancel
- Load model lazily — only when needed, not at app startup

### Phase 2: Encouragement Generation

- After report generation, pass practice data to LLM agent
- LLM generates personalized encouragement
- Speak via speechSynthesis
- Template fallback if LLM is slow or unavailable

### Phase 3: Ambiguous Command Handling

- Wire "unknown" results from regex parser to LLM agent
- LLM interprets natural phrasing ("make it faster", "play in waltz time")
- Returns structured action JSON via GBNF grammar

### Phase 4: Practice Insights (Future)

- "What should I practice?" → LLM analyzes practice history
- "How's my week going?" → LLM summarizes weekly trends
- Foundation for Phase 8 in the main development roadmap

---

## Comparison: With vs Without LLM Agent

| Aspect | Without LLM | With LLM Agent |
|--------|-------------|----------------|
| Simple commands | <1ms (regex) | <1ms (regex — unchanged) |
| Ambiguous commands | "Sorry, I didn't understand" | LLM interprets (3–8s) |
| Encouragement | Templates (instant, repetitive) | Generated (5–12s, unique) |
| Practice insights | Not available | Available (10–20s) |
| Download | ~105–125 MB | ~455–475 MB (+350 MB for model) |
| Works without download | Yes | Yes — degrades gracefully to templates |

---

*Last updated: 2026-02-20*
