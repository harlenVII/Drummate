/**
 * ttsService.js — Kokoro.js TTS wrapper for natural on-device speech synthesis.
 * Uses WASM backend for iOS Safari compatibility.
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DTYPE = 'q8';
const DEVICE = 'wasm';

const VOICES = {
  en: 'af_bella',
  zh: 'zf_xiaobei',
};

/**
 * Check if the Kokoro TTS model is already cached in browser Cache API.
 */
export async function isTtsCached() {
  try {
    const cacheNames = await caches.keys();
    const tfCache = cacheNames.find((n) => n.startsWith('transformers'));
    if (!tfCache) return false;
    const cache = await caches.open(tfCache);
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes('Kokoro-82M'));
  } catch {
    return false;
  }
}

export function createTtsService() {
  let tts = null;
  let loaded = false;
  let audioCtx = null;
  let currentSource = null;
  let stopped = false;

  return {
    get isReady() {
      return loaded;
    },

    async load(progressCallback) {
      const { KokoroTTS } = await import('kokoro-js');

      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: DTYPE,
        device: DEVICE,
        progress_callback: (progress) => {
          if (progressCallback && progress.status === 'progress') {
            progressCallback({
              percentage: Math.round(progress.progress || 0),
            });
          }
        },
      });

      loaded = true;
    },

    async speak(text, language) {
      if (!tts || !loaded) return;

      // Stop any current playback
      this.stop();
      stopped = false;

      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const voice = VOICES[language] || VOICES.en;

      // Generate full audio in one pass — avoids per-sentence gaps caused by
      // WASM blocking the main thread between streaming chunks.
      const result = await tts.generate(text, { voice });
      if (stopped) return;

      const sampleRate = result.sampling_rate || 24000;
      const buffer = audioCtx.createBuffer(1, result.audio.length, sampleRate);
      buffer.getChannelData(0).set(result.audio);

      await new Promise((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          currentSource = null;
          resolve();
        };
        currentSource = source;
        source.start(0);
      });
    },

    stop() {
      stopped = true;
      if (currentSource) {
        try {
          currentSource.stop();
        } catch {}
        currentSource = null;
      }
    },

    destroy() {
      this.stop();
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
      tts = null;
      loaded = false;
    },
  };
}
