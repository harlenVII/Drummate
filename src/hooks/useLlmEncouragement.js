import { useRef, useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getItem } from '../utils/safeStorage';

export function useLlmEncouragement({ items, totals, activeItemId, elapsedTime, speakText }) {
  const { language } = useLanguage();

  // AI Coach toggle (off by default)
  const [aiCoachEnabled, setAiCoachEnabled] = useState(() => {
    return getItem('drummate_ai_coach_enabled') === 'true';
  });

  // LLM encouragement state
  const llmServiceRef = useRef(null);
  const [llmStatus, setLlmStatus] = useState('idle'); // 'idle'|'downloading'|'loading'|'ready'|'generating'|'error'
  const [llmProgress, setLlmProgress] = useState({ text: '', percentage: 0 });
  const [llmMessage, setLlmMessage] = useState(null);
  const [llmError, setLlmError] = useState(null);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  // LLM encouragement handlers
  const generateEncouragement = useCallback(async () => {
    if (!llmServiceRef.current?.isReady) return;
    try {
      setLlmStatus('generating');
      setLlmMessage(null);
      const { buildPracticeContext } = await import('../utils/practiceStats');
      const context = await buildPracticeContext({ items, totals, activeItemId, elapsedTime });
      const message = await llmServiceRef.current.generateEncouragement(context, language);
      setLlmMessage(message);
      setLlmStatus('ready');
      speakText(message);
    } catch (err) {
      console.error('LLM generation error:', err);
      setLlmStatus('error');
      setLlmError(err.message);
    }
  }, [items, totals, activeItemId, elapsedTime, language, speakText]);

  const loadAndGenerate = useCallback(async (fromCache) => {
    try {
      const { createLlmService } = await import('../services/llmService');
      llmServiceRef.current = createLlmService();
      setLlmError(null);
      if (fromCache) {
        setLlmStatus('loading');
      } else {
        setLlmStatus('downloading');
      }
      await llmServiceRef.current.load(fromCache ? null : ({ text, percentage }) => {
        setLlmProgress({ text, percentage });
      });
      setLlmStatus('generating');
      const { buildPracticeContext } = await import('../utils/practiceStats');
      const context = await buildPracticeContext({ items, totals, activeItemId, elapsedTime });
      const message = await llmServiceRef.current.generateEncouragement(context, language);
      setLlmMessage(message);
      setLlmStatus('ready');
      speakText(message);
    } catch (err) {
      console.error('LLM load/generate error:', err);
      setLlmStatus('error');
      setLlmError(err.message);
    }
  }, [items, totals, activeItemId, elapsedTime, language, speakText]);

  const handleLlmDownload = useCallback(() => {
    loadAndGenerate(false);
  }, [loadAndGenerate]);

  const handleEncouragementPress = useCallback(async () => {
    // If already in a transient state, just show the modal
    if (llmStatus === 'generating' || llmStatus === 'downloading' || llmStatus === 'loading') {
      setLlmModalOpen(true);
      return;
    }
    // If ready with a message, just show it
    if (llmStatus === 'ready' && llmMessage) {
      setLlmModalOpen(true);
      return;
    }
    // If ready but no message, generate one
    if (llmServiceRef.current?.isReady) {
      setLlmModalOpen(true);
      generateEncouragement();
      return;
    }
    // Check if model is already cached — if so, load directly (no consent)
    try {
      const { isModelCached } = await import('../services/llmService');
      if (await isModelCached()) {
        setLlmModalOpen(true);
        loadAndGenerate(true);
        return;
      }
    } catch {
      // Fall through to show download consent
    }
    // Not cached — show download consent
    setLlmModalOpen(true);
  }, [llmStatus, llmMessage, generateEncouragement, loadAndGenerate]);

  // Cleanup llmService on unmount
  useEffect(() => () => {
    if (llmServiceRef.current) { llmServiceRef.current.destroy(); llmServiceRef.current = null; }
  }, []);

  return {
    aiCoachEnabled, setAiCoachEnabled,
    llmStatus, llmProgress, llmMessage, llmError, llmModalOpen, setLlmModalOpen,
    generateEncouragement, loadAndGenerate, handleLlmDownload, handleEncouragementPress,
  };
}
