/**
 * sttService.js — Speech-to-Text via Web Speech API.
 *
 * Wraps SpeechRecognition in a promise-based API.
 * Returns null if SpeechRecognition is not available.
 */

export function createSttService() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  return {
    /**
     * Listen for a single utterance and resolve with the transcript string.
     * Rejects with error code: 'no-speech' | 'not-allowed' | 'network' | 'timeout' | 'aborted'
     */
    listenOnce({ language = 'en-US', timeoutMs = 7000 } = {}) {
      return new Promise((resolve, reject) => {
        const recognition = new SpeechRecognition();
        recognition.lang = language;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        let resolved = false;
        let timer = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          try {
            recognition.abort();
          } catch {
            // already stopped
          }
        };

        recognition.onresult = (event) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          const transcript = event.results[0][0].transcript;
          resolve(transcript);
        };

        recognition.onerror = (event) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(event.error);
        };

        recognition.onend = () => {
          if (!resolved) {
            resolved = true;
            reject('no-speech');
          }
        };

        // Safety timeout
        timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            recognition.abort();
            reject('timeout');
          }
        }, timeoutMs);

        recognition.start();
      });
    },
  };
}
