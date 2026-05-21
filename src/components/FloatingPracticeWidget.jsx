import { useLanguage } from '../contexts/LanguageContext';
import { formatTime } from '../utils/formatTime';

function FloatingPracticeWidget({ itemName, elapsedTime, onStop, onNavigate }) {
  const { t } = useLanguage();

  if (!itemName) return null;

  const handleStopClick = (e) => {
    e.stopPropagation();
    onStop();
  };

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-blue-600 text-white shadow-lg max-w-[280px] hover:bg-blue-700 active:scale-95 transition-all duration-150"
      aria-label={itemName}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-medium truncate min-w-0">{itemName}</span>
      <span className="text-sm font-mono tabular-nums shrink-0">{formatTime(elapsedTime)}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={handleStopClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStopClick(e);
          }
        }}
        aria-label={t('stopPractice')}
        className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 cursor-pointer"
      >
        <span className="block w-2.5 h-2.5 bg-white rounded-sm" />
      </span>
    </button>
  );
}

export default FloatingPracticeWidget;
