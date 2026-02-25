import { useLanguage } from '../contexts/LanguageContext';

const STATE_CONFIG = {
  listening: {
    en: 'Listening for command...',
    zh: '正在聆听指令...',
    color: 'bg-green-500',
    pulse: true,
  },
  processing: {
    en: 'Processing...',
    zh: '处理中...',
    color: 'bg-blue-500',
    pulse: false,
  },
  feedback: {
    en: null,
    zh: null,
    color: 'bg-blue-400',
    pulse: false,
  },
  error: {
    en: "Didn't understand",
    zh: '没有听懂',
    color: 'bg-red-500',
    pulse: false,
  },
};

function FloatingVoiceIndicator({ listeningState, transcript, errorText }) {
  const { language } = useLanguage();

  if (listeningState === 'idle') return null;

  const config = STATE_CONFIG[listeningState];
  if (!config) return null;

  const label = transcript
    ? `"${transcript}"`
    : errorText
      ? errorText
      : config[language] || config.en;

  if (!label) return null;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-white text-sm font-medium transition-all duration-200 ${config.color}`}
      role="status"
      aria-live="polite"
    >
      {config.pulse && (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
      )}
      <span className="max-w-[240px] truncate">{label}</span>
    </div>
  );
}

export default FloatingVoiceIndicator;
