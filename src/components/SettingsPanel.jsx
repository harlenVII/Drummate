import { useLanguage } from '../contexts/LanguageContext';

function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  user,
  handsFreeMode,
  onToggleHandsFree,
  wakeWordLoading,
  wakeWordDetected,
  wakeWordError,
}) {
  const { t } = useLanguage();
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{t('settings')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile card */}
        <div className="px-5 py-5 flex items-center gap-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-semibold shrink-0">
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            {user?.name && (
              <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
            )}
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Settings content */}
        <div className="flex-1 px-5 py-6 flex flex-col gap-6">
          {/* Language */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{t('language')}</span>
            <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
              {['en', 'zh'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => language !== lang && toggleLanguage()}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    language === lang
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {lang === 'en' ? 'EN' : '中文'}
                </button>
              ))}
            </div>
          </div>

          {/* Hands-Free Mode */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{t('handsFree.title')}</span>
                {handsFreeMode && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                )}
              </div>
              <button
                onClick={onToggleHandsFree}
                disabled={wakeWordLoading || !isChrome}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  handsFreeMode ? 'bg-blue-600' : 'bg-gray-300'
                } ${wakeWordLoading || !isChrome ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                role="switch"
                aria-checked={handsFreeMode}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    handsFreeMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {!isChrome ? (
              <p className="text-xs text-red-500">{t('handsFree.unsupportedBrowser')}</p>
            ) : (
              <>
                {wakeWordLoading && (
                  <p className="text-xs text-blue-500">{t('handsFree.loading')}</p>
                )}

                {wakeWordDetected && (
                  <p className="text-xs text-green-600 font-medium">{t('handsFree.detected')}</p>
                )}

                {wakeWordError === 'mic_permission' && (
                  <p className="text-xs text-red-500">{t('handsFree.micPermission')}</p>
                )}

                {wakeWordError && wakeWordError !== 'mic_permission' && (
                  <p className="text-xs text-red-500">{t('handsFree.error')}</p>
                )}

                {!wakeWordLoading && !wakeWordError && (
                  <p className="text-xs text-gray-400">{t('handsFree.description')}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sign out at bottom */}
        <div className="px-5 py-6 border-t border-gray-200">
          <button
            onClick={signOut}
            className="w-full py-2.5 text-sm font-medium text-red-500 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    </>
  );
}

export default SettingsPanel;
