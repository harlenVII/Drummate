import { useLanguage } from '../contexts/LanguageContext';

function EncouragementModal({ isOpen, status, progress, message, error, onClose, onDownload, onRegenerate }) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        {/* State: Download consent */}
        {status === 'idle' && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">{t('llmCoach.downloadTitle')}</h2>
            <p className="text-sm text-gray-600 mb-2">{t('llmCoach.downloadBody')}</p>
            <p className="text-sm text-gray-500 mb-1">{t('llmCoach.downloadSize')}</p>
            <p className="text-xs text-gray-400 mb-5">{t('llmCoach.downloadPrivacy')}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={onDownload}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                {t('llmCoach.downloadButton')}
              </button>
            </div>
          </>
        )}

        {/* State: Downloading */}
        {status === 'downloading' && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">{t('llmCoach.downloading')}</h2>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center mb-1">{progress.text}</p>
            <p className="text-xs text-gray-400 text-center">{t('llmCoach.downloadOnce')}</p>
          </>
        )}

        {/* State: Loading model into memory */}
        {status === 'loading' && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">{t('llmCoach.loading')}</h2>
            <div className="flex justify-center py-4">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </>
        )}

        {/* State: Generating */}
        {status === 'generating' && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">{t('llmCoach.modalTitle')}</h2>
            <div className="flex justify-center py-6">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">{t('llmCoach.generating')}</p>
          </>
        )}

        {/* State: Message ready */}
        {status === 'ready' && message && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-4">{t('llmCoach.modalTitle')}</h2>
            <p className="text-base text-gray-700 leading-relaxed mb-6">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {t('close')}
              </button>
              <button
                onClick={onRegenerate}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                {t('llmCoach.regenerate')}
              </button>
            </div>
          </>
        )}

        {/* State: Error */}
        {status === 'error' && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">{t('llmCoach.errorTitle')}</h2>
            <p className="text-sm text-gray-600 mb-5">
              {error || t('llmCoach.errorGeneric')}
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {t('close')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default EncouragementModal;
