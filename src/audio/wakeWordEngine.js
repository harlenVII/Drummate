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

import { WakeWordEngine } from 'openwakeword-wasm-browser';

const WAKE_WORD = 'hey_jarvis';

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
        baseAssetUrl: '/models',
        detectionThreshold: 0.5,
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
      await engine.start();
      listening = true;
    },

    /** Stop listening and release the microphone. */
    async stop() {
      if (!listening) return;
      await engine.stop();
      listening = false;
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
