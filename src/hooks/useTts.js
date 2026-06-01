import { useRef, useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { speak, getLang, cancelSpeech } from '../services/voiceFeedback';
import { getItem, setItem } from '../utils/safeStorage';

export function useTts() {
  const { language } = useLanguage();

  // Kokoro TTS state
  const ttsServiceRef = useRef(null);
  const [kokoroEnabled, setKokoroEnabled] = useState(() => {
    return getItem('drummate_kokoro_tts') === 'true';
  });
  const [kokoroStatus, setKokoroStatus] = useState('idle'); // 'idle'|'downloading'|'ready'|'error'
  const [kokoroProgress, setKokoroProgress] = useState({ percentage: 0 });

  // TTS wrappers — use Kokoro if enabled and ready, else speechSynthesis
  const speakText = useCallback((text, lang) => {
    if (kokoroEnabled && ttsServiceRef.current?.isReady && ttsServiceRef.current.supportsLanguage(language)) {
      ttsServiceRef.current.speak(text, language).catch((err) => {
        console.error('Kokoro TTS error, falling back to system voice:', err);
        speak(text, { lang: lang || getLang(language) });
      });
    } else {
      speak(text, { lang: lang || getLang(language) });
    }
  }, [kokoroEnabled, language]);

  const stopSpeech = useCallback(() => {
    cancelSpeech();
    if (ttsServiceRef.current) ttsServiceRef.current.stop();
  }, []);

  // Load Kokoro TTS model
  const loadKokoroTts = useCallback(async () => {
    try {
      setKokoroStatus('downloading');
      const { createTtsService } = await import('../services/ttsService');
      ttsServiceRef.current = createTtsService();
      await ttsServiceRef.current.load(({ percentage }) => {
        setKokoroProgress({ percentage });
      });
      setKokoroStatus('ready');
    } catch (err) {
      console.error('Kokoro TTS load error:', err);
      setKokoroStatus('error');
    }
  }, []);

  // Toggle handler for Kokoro TTS setting
  const handleToggleKokoro = useCallback(async () => {
    if (kokoroEnabled) {
      setKokoroEnabled(false);
      setItem('drummate_kokoro_tts', 'false');
      return;
    }
    setKokoroEnabled(true);
    setItem('drummate_kokoro_tts', 'true');
    if (!ttsServiceRef.current?.isReady) {
      await loadKokoroTts();
    }
  }, [kokoroEnabled, loadKokoroTts]);

  // Auto-load Kokoro TTS on mount if enabled
  useEffect(() => {
    if (!kokoroEnabled) return;
    if (ttsServiceRef.current?.isReady) return;
    (async () => {
      try {
        const { isTtsCached } = await import('../services/ttsService');
        if (await isTtsCached()) {
          await loadKokoroTts();
        }
      } catch { /* TTS preload is best-effort */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup ttsService on unmount
  useEffect(() => () => {
    if (ttsServiceRef.current) { ttsServiceRef.current.destroy(); ttsServiceRef.current = null; }
  }, []);

  return {
    ttsServiceRef,
    kokoroEnabled, setKokoroEnabled,
    kokoroStatus, kokoroProgress,
    speakText, stopSpeech, loadKokoroTts, handleToggleKokoro,
  };
}
