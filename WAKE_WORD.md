# Phase 1: Wake Word Detection

## Context
Adding "Hands-Free Mode" to Drummate — a toggle that activates wake word listening using openWakeWord (ONNX) in the browser. Phase 1 focuses on wake word detection only (no STT or intent parsing yet). Uses `hey_jarvis` as a placeholder model until a custom "Drummate" model is trained.

## Steps

### 1. Install dependencies
```bash
npm install openwakeword-wasm-browser onnxruntime-web
```

### 2. Download ONNX model files to `public/models/`
From the `dnavarrom/openwakeword_wasm` repo or openWakeWord v0.5.1 release:
- `melspectrogram.onnx` (shared, always required)
- `embedding_model.onnx` (shared, always required)
- `silero_vad.onnx` (VAD, always required)
- `hey_jarvis_v0.1.onnx` (placeholder wake word)

### 3. Create wake word service — `src/audio/wakeWordEngine.js`
Thin wrapper around `WakeWordEngine` from the npm package:
- `initWakeWord()` — instantiate engine, call `engine.load()`, wire up events
- `startListening()` — call `engine.start()` (must be from user gesture)
- `stopListening()` — call `engine.stop()`
- `onDetected(callback)` — subscribe to `'detect'` events
- Export a singleton (similar pattern to `metronomeEngineRef` in App.jsx)

No Web Worker optimization yet — the npm package runs inference on the main thread via AudioWorklet. Optimization is a follow-up.

### 4. Add state to `App.jsx`
- `handsFreeMode` state (boolean, default `false`)
- `wakeWordEngineRef` (useRef, singleton)
- `wakeWordReady` state (boolean — models loaded)
- `wakeWordDetected` state (for UI feedback, briefly `true` on detection)
- Toggle handler: when enabled → load models (if first time) + `startListening()`; when disabled → `stopListening()`
- On detection → `console.log` + brief visual/audio feedback (placeholder for future STT pipeline)
- Cleanup on unmount

### 5. Add i18n keys to `LanguageContext.jsx`
- `handsFreeMode` / "Hands-Free Mode" / "免提模式"
- `handsFreeDescription` / "Say 'Hey Jarvis' to activate" / "说 'Hey Jarvis' 来激活"
- `wakeWordDetected` / "Listening..." / "正在听..."
- `micPermissionNeeded` / "Microphone permission required" / "需要麦克风权限"

### 6. Add toggle UI to `SettingsPanel.jsx`
- Toggle switch for "Hands-Free Mode" below the language selector
- Description text explaining the wake word
- Mic indicator icon when active (small pulsing dot or mic icon)
- Loading state while models download (~15-25 MB first time)
- Error state if mic permission denied

### 7. Update Vite PWA config — `vite.config.js`
- Add `**/*.onnx` and `**/*.wasm` to workbox `globPatterns` so models are cached offline

### 8. Verify build
- `npm run build` must succeed
- Test toggle on/off, mic permission flow, detection event

## Files Modified
- `package.json` — new dependencies
- `public/models/` — 4 ONNX files (new directory)
- `src/audio/wakeWordEngine.js` — new file, wake word service
- `src/App.jsx` — state + ref + toggle handler
- `src/components/SettingsPanel.jsx` — toggle UI
- `src/contexts/LanguageContext.jsx` — i18n keys
- `vite.config.js` — workbox glob pattern update

## Verification
1. `npm run build` succeeds
2. Toggle "Hands-Free Mode" on → mic permission prompt → models load → listening state shown
3. Say "Hey Jarvis" → console.log fires + brief UI feedback
4. Toggle off → mic released, listening stops
5. Toggle on again → no re-download (models cached)
6. Metronome still works normally while hands-free mode is active (separate AudioContexts)
