import { useRef, useState, useCallback, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { createSttService } from '../services/sttService';
import { parseIntent, findBestItemMatch } from '../services/intentParser';

export function useVoiceControl({
  metronome, items, activeItemId, handleStart, handleStop,
  handleTabChange, handleSubpageChange, speakText, navigate,
}) {
  const { language, toggleLanguage } = useLanguage();

  // Wake word (hands-free mode) state
  const wakeWordEngineRef = useRef(null);
  const sttServiceRef = useRef(null);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [wakeWordLoading, setWakeWordLoading] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [wakeWordError, setWakeWordError] = useState(null);
  const [listeningState, setListeningState] = useState('idle'); // 'idle'|'listening'|'processing'|'feedback'|'error'
  const [voiceTranscript, setVoiceTranscript] = useState(null);

  // Voice command dispatcher — called after STT transcription
  const dispatchVoiceCommand = useCallback(async (intent) => {
    switch (intent.action) {
      case 'metronome.start': {
        if (metronome.isPlaying) {
          speakText(language === 'zh' ? '已经在播放' : 'Metronome is already running');
          return;
        }
        const engine = metronome.engineRef.current;
        if (!engine) return;
        engine.setSequence(null);
        metronome.noSleepRef.current.enable();
        await engine.start();
        metronome.setIsPlaying(true);
        navigate('metronome', 'metronome');
        speakText(language === 'zh' ? '节拍器已启动' : 'Metronome started');
        break;
      }

      case 'metronome.stop': {
        const engine = metronome.engineRef.current;
        if (engine && metronome.isPlaying) {
          engine.stop();
          metronome.setIsPlaying(false);
          metronome.setCurrentBeat(-1);
          metronome.noSleepRef.current.disable();
          speakText(language === 'zh' ? '节拍器已停止' : 'Metronome stopped');
        } else {
          speakText(language === 'zh' ? '节拍器没有在运行' : 'Metronome is not running');
        }
        break;
      }

      case 'metronome.setTempo': {
        const bpm = Math.max(30, Math.min(300, intent.value));
        metronome.setBpm(bpm);
        metronome.engineRef.current?.setBpm(bpm);
        speakText(language === 'zh' ? `速度已设置为 ${bpm}` : `Tempo set to ${bpm}`);
        break;
      }

      case 'metronome.adjustTempo': {
        const currentBpm = metronome.engineRef.current?.bpm ?? metronome.bpm;
        const newBpm = Math.max(30, Math.min(300, currentBpm + intent.delta));
        metronome.setBpm(newBpm);
        metronome.engineRef.current?.setBpm(newBpm);
        const direction = intent.delta > 0
          ? (language === 'zh' ? '加速' : 'Increased')
          : (language === 'zh' ? '减速' : 'Decreased');
        speakText(language === 'zh' ? `${direction}到 ${newBpm}` : `${direction} tempo to ${newBpm}`);
        break;
      }

      case 'metronome.setTimeSignature': {
        metronome.setTimeSignature(intent.value);
        metronome.engineRef.current?.setBeatsPerMeasure(intent.value[0]);
        speakText(language === 'zh'
          ? `拍号设为 ${intent.value[0]} 比 ${intent.value[1]}`
          : `Time signature set to ${intent.value[0]} over ${intent.value[1]}`);
        break;
      }

      case 'metronome.setSubdivision': {
        metronome.setSubdivision(intent.value);
        speakText(language === 'zh' ? `切换到${intent.value}` : `Switched to ${intent.value}`);
        break;
      }

      case 'practice.start': {
        const match = findBestItemMatch(intent.itemQuery, items);
        if (!match) {
          speakText(language === 'zh'
            ? `找不到练习项目：${intent.itemQuery}`
            : `No practice item found for: ${intent.itemQuery}`);
          return;
        }
        navigate('practice');
        await handleStart(match.id);
        speakText(language === 'zh' ? `开始练习 ${match.name}` : `Starting practice: ${match.name}`);
        break;
      }

      case 'practice.stop': {
        if (activeItemId == null) {
          speakText(language === 'zh' ? '没有正在进行的练习' : 'No practice session is running');
          return;
        }
        await handleStop();
        speakText(language === 'zh' ? '练习已保存' : 'Practice session saved');
        break;
      }

      case 'report.generate': {
        handleTabChange('report');
        speakText(language === 'zh' ? '打开报告' : 'Opening report');
        break;
      }

      case 'navigate': {
        if (intent.subpage) {
          handleTabChange(intent.tab);
          handleSubpageChange(intent.subpage);
        } else {
          handleTabChange(intent.tab);
        }
        speakText(language === 'zh' ? `切换到${intent.tab}` : `Navigating to ${intent.tab}`);
        break;
      }

      case 'toggleLanguage': {
        toggleLanguage();
        speakText('Language switched');
        break;
      }

      case 'unknown':
      default: {
        speakText(language === 'zh' ? '我没听懂，请再说一遍' : "Sorry, I didn't understand that");
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, metronome.isPlaying, metronome.bpm, items, activeItemId, handleStart, handleStop, handleTabChange, handleSubpageChange, toggleLanguage, speakText, navigate]);

  // Wake word toggle handler
  const handleToggleHandsFree = useCallback(async () => {
    if (handsFreeMode) {
      // Turning off
      if (wakeWordEngineRef.current) {
        await wakeWordEngineRef.current.stop();
      }
      setHandsFreeMode(false);
      setWakeWordDetected(false);
      setWakeWordError(null);
      return;
    }

    // Turning on — only supported in Chrome (ONNX WASM issues on Safari/Firefox)
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
    if (!isChrome) {
      setWakeWordError('unsupported_browser');
      return;
    }

    setWakeWordError(null);
    try {
      if (!wakeWordEngineRef.current) {
        const { createWakeWordEngine } = await import('../audio/wakeWordEngine');
        wakeWordEngineRef.current = createWakeWordEngine();
      }

      if (!wakeWordEngineRef.current.isLoaded) {
        setWakeWordLoading(true);
        await wakeWordEngineRef.current.load();
        setWakeWordLoading(false);
      }

      // Initialize STT service if not already done
      if (!sttServiceRef.current) {
        sttServiceRef.current = createSttService();
      }

      // eslint-disable-next-line no-unused-vars
      wakeWordEngineRef.current.onDetected(async ({ keyword, score }) => {
        setWakeWordDetected(true);

        if (!sttServiceRef.current) {
          setTimeout(() => setWakeWordDetected(false), 2000);
          return;
        }

        setListeningState('listening');
        setVoiceTranscript(null);

        try {
          const sttLang = language === 'zh' ? 'zh-CN' : 'en-US';
          const transcript = await sttServiceRef.current.listenOnce({
            language: sttLang,
            timeoutMs: 7000,
          });

          setListeningState('processing');
          setVoiceTranscript(transcript);

          const intent = parseIntent(transcript);
          await dispatchVoiceCommand(intent);

          setListeningState('feedback');
          setTimeout(() => {
            setListeningState('idle');
            setWakeWordDetected(false);
            setVoiceTranscript(null);
          }, 2500);
        } catch (err) {
          const noSpeech = err === 'no-speech' || err === 'timeout';
          setListeningState('error');
          if (!noSpeech) {
            console.error('STT error:', err);
          }
          setTimeout(() => {
            setListeningState('idle');
            setWakeWordDetected(false);
            setVoiceTranscript(null);
          }, 2500);
        }
      });

      wakeWordEngineRef.current.onError((err) => {
        console.error('Wake word error:', err);
        setWakeWordError(err.message || 'Unknown error');
      });

      await wakeWordEngineRef.current.start();
      setHandsFreeMode(true);
    } catch (err) {
      setWakeWordLoading(false);
      if (err.name === 'NotAllowedError') {
        setWakeWordError('mic_permission');
      } else {
        setWakeWordError(err.message || 'Failed to start');
      }
      console.error('Failed to start hands-free mode:', err);
    }
  }, [handsFreeMode, language, dispatchVoiceCommand]);

  // Clean up wake word engine on unmount
  useEffect(() => {
    return () => {
      if (wakeWordEngineRef.current) {
        wakeWordEngineRef.current.destroy();
        wakeWordEngineRef.current = null;
      }
    };
  }, []);

  return {
    handsFreeMode, wakeWordLoading, wakeWordDetected, wakeWordError,
    listeningState, voiceTranscript, handleToggleHandsFree,
  };
}
