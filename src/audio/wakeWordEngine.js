/**
 * Wake Word Engine — thin wrapper around openwakeword-wasm-browser.
 *
 * Usage:
 *   const engine = createWakeWordEngine();
 *   await engine.load();          // downloads ONNX models (~5 MB)
 *   await engine.start();         // must be called from user gesture
 *   engine.onDetected(callback);  // fires when wake word heard
 *   await engine.stop();          // releases mic
 */

import * as ort from 'onnxruntime-web';
import { WakeWordEngine } from 'openwakeword-wasm-browser';

// Configure ORT before any session is created:
// - Load WASM runtime from CDN to avoid Vite bundling/import issues
// - Single-threaded to reduce complexity
// - Service worker caches these files after first load for offline use
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/';

const WAKE_WORD = 'drummate';

export function createWakeWordEngine() {
  let engine = null;
  let loaded = false;
  let listening = false;
  let detectCallback = null;
  let errorCallback = null;
  let unsubDetect = null;
  let unsubError = null;

  return {
    /** Download and initialize ONNX models. Call once. */
    async load() {
      if (loaded) return;

      engine = new WakeWordEngine({
        keywords: [WAKE_WORD],
        modelFiles: { drummate: 'drummate.onnx' },
        baseAssetUrl: '/models',
        detectionThreshold: 0.4,
        cooldownMs: 2000,
        executionProviders: ['wasm'],
        debug: false,
      });

      await engine.load();
      loaded = true;

      // Wire up events after load
      unsubDetect = engine.on('detect', (event) => {
        console.log(`[WakeWord] Detected "${event.keyword}" (score: ${event.score.toFixed(3)})`);
        if (detectCallback) detectCallback(event);
      });

      unsubError = engine.on('error', (err) => {
        console.error('[WakeWord] Error:', err);
        if (errorCallback) errorCallback(err);
      });
    },

    /** Start listening for the wake word. Must be called from a user gesture. */
    async start() {
      if (!loaded) throw new Error('Wake word engine not loaded. Call load() first.');
      if (listening) return;
      // Safari: switch audio session to allow mic capture (metronome sets it to 'playback')
      if (navigator.audioSession) {
        try { navigator.audioSession.type = 'play-and-record'; } catch { /* ignore */ }
      }
      await engine.start();
      listening = true;
    },

    /** Stop listening and release the microphone. */
    async stop() {
      if (!listening) return;
      await engine.stop();
      listening = false;
      // Safari: restore audio session to playback-only (for silent mode bypass)
      if (navigator.audioSession) {
        try { navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
      }
    },

    /** Register a callback for wake word detection. */
    onDetected(callback) {
      detectCallback = callback;
    },

    /** Register a callback for errors. */
    onError(callback) {
      errorCallback = callback;
    },

    /** Clean up everything. */
    destroy() {
      if (unsubDetect) unsubDetect();
      if (unsubError) unsubError();
      if (listening && engine) {
        engine.stop().catch(() => {});
      }
      engine = null;
      loaded = false;
      listening = false;
      detectCallback = null;
      errorCallback = null;
    },

    get isLoaded() { return loaded; },
    get isListening() { return listening; },
  };
}
