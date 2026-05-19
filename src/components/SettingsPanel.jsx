import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { useLanguage } from '../contexts/LanguageContext';
import { getTimezone, setTimezone } from '../services/timezoneService';
import firebaseBackend from '../services/backends/firebaseBackend';
import { db } from '../services/database';

// Curated 24-city list: one common city per UTC offset (plus Kolkata at +5:30
// for India's population). Offsets shown are standard time; actual offset
// shifts ±1h under DST for zones that observe it.
const TIMEZONE_OPTIONS = [
  { value: 'Pacific/Midway',         label: 'Midway (UTC-11)' },
  { value: 'Pacific/Honolulu',       label: 'Honolulu (UTC-10)' },
  { value: 'America/Anchorage',      label: 'Anchorage (UTC-9)' },
  { value: 'America/Los_Angeles',    label: 'Seattle (UTC-8)' },
  { value: 'America/Denver',         label: 'Denver (UTC-7)' },
  { value: 'America/Chicago',        label: 'Chicago (UTC-6)' },
  { value: 'America/New_York',       label: 'New York (UTC-5)' },
  { value: 'America/Halifax',        label: 'Halifax (UTC-4)' },
  { value: 'America/Sao_Paulo',      label: 'São Paulo (UTC-3)' },
  { value: 'Atlantic/South_Georgia', label: 'South Georgia (UTC-2)' },
  { value: 'Atlantic/Azores',        label: 'Azores (UTC-1)' },
  { value: 'Europe/London',          label: 'London (UTC+0)' },
  { value: 'Europe/Paris',           label: 'Paris (UTC+1)' },
  { value: 'Europe/Athens',          label: 'Athens (UTC+2)' },
  { value: 'Europe/Moscow',          label: 'Moscow (UTC+3)' },
  { value: 'Asia/Dubai',             label: 'Dubai (UTC+4)' },
  { value: 'Asia/Karachi',           label: 'Karachi (UTC+5)' },
  { value: 'Asia/Kolkata',           label: 'Kolkata (UTC+5:30)' },
  { value: 'Asia/Dhaka',             label: 'Dhaka (UTC+6)' },
  { value: 'Asia/Bangkok',           label: 'Bangkok (UTC+7)' },
  { value: 'Asia/Shanghai',          label: 'Beijing (UTC+8)' },
  { value: 'Asia/Tokyo',             label: 'Tokyo (UTC+9)' },
  { value: 'Australia/Sydney',       label: 'Sydney (UTC+10)' },
  { value: 'Pacific/Auckland',       label: 'Auckland (UTC+12)' },
];

function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  user,
  timeUnit,
  onToggleTimeUnit,
  kokoroEnabled,
  kokoroStatus,
  kokoroProgress,
  onToggleKokoro,
  aiCoachEnabled,
  onToggleAiCoach,
  handsFreeMode,
  onToggleHandsFree,
  wakeWordLoading,
  wakeWordDetected,
  wakeWordError,
  listeningState,
  voiceTranscript,
  userId,
  onTimezoneChange,
  offlineMode,
  onEnterOfflineMode,
  onGoOnline,
  onShowPending,
}) {
  const { t } = useLanguage();
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);

  const currentTz = getTimezone();
  const currentTzInList = TIMEZONE_OPTIONS.some(o => o.value === currentTz);

  const handleTimezoneChange = async (e) => {
    const newTz = e.target.value;
    try {
      await setTimezone(newTz, firebaseBackend, userId);
      if (onTimezoneChange) onTimezoneChange();
    } catch (err) {
      console.error('Failed to set timezone', err);
    }
  };
  const kokoroLangUnsupported = language === 'zh';
  const kokoroDisabled = !aiCoachEnabled && !handsFreeMode || kokoroLangUnsupported;
  const kokoroEffective = kokoroEnabled && !kokoroLangUnsupported;

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const sub = liveQuery(() => db.syncQueue.count()).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error('SettingsPanel pendingCount liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, [isOpen]);

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

          {/* Timezone */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">{t('timezone')}</span>
            <select
              value={currentTz}
              onChange={handleTimezoneChange}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white max-w-[60%]"
            >
              {!currentTzInList && (
                <option value={currentTz}>{currentTz}</option>
              )}
              {TIMEZONE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Time Unit */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{t('timeUnit')}</span>
            <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
              {['minutes', 'hours'].map((unit) => (
                <button
                  key={unit}
                  onClick={() => timeUnit !== unit && onToggleTimeUnit()}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    timeUnit === unit
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t(unit)}
                </button>
              ))}
            </div>
          </div>

          {/* AI Coach */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{t('aiCoach.title')}</span>
              <button
                onClick={onToggleAiCoach}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  aiCoachEnabled ? 'bg-blue-600' : 'bg-gray-300'
                } cursor-pointer`}
                role="switch"
                aria-checked={aiCoachEnabled}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    aiCoachEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {!aiCoachEnabled && (
              <p className="text-xs text-gray-400">{t('aiCoach.description')}</p>
            )}
          </div>

          {/* Natural Voice (AI) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{t('naturalVoice.title')}</span>
              <button
                onClick={onToggleKokoro}
                disabled={kokoroStatus === 'downloading' || kokoroDisabled}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  kokoroEffective ? 'bg-blue-600' : 'bg-gray-300'
                } ${kokoroStatus === 'downloading' || kokoroDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                role="switch"
                aria-checked={kokoroEffective}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    kokoroEffective ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {kokoroStatus === 'downloading' && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-blue-500">{t('naturalVoice.downloading')}</p>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${kokoroProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {kokoroStatus === 'ready' && kokoroEffective && (
              <p className="text-xs text-green-600">{t('naturalVoice.ready')}</p>
            )}

            {kokoroStatus === 'error' && (
              <p className="text-xs text-red-500">{t('naturalVoice.error')}</p>
            )}

            {kokoroDisabled && (
              <p className="text-xs text-gray-400">
                {kokoroLangUnsupported ? t('naturalVoice.unsupportedLang') : t('naturalVoice.requires')}
              </p>
            )}

            {!kokoroDisabled && kokoroStatus === 'idle' && !kokoroEnabled && (
              <p className="text-xs text-gray-400">{t('naturalVoice.description')}</p>
            )}

            {!kokoroDisabled && kokoroStatus === 'idle' && !kokoroEnabled && (
              <p className="text-xs text-gray-400">{t('naturalVoice.size')}</p>
            )}
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

                {wakeWordDetected && listeningState === 'listening' && (
                  <p className="text-xs text-green-600 font-medium">{t('handsFree.listening')}</p>
                )}

                {listeningState === 'processing' && voiceTranscript && (
                  <p className="text-xs text-blue-600 font-medium">&ldquo;{voiceTranscript}&rdquo;</p>
                )}

                {wakeWordDetected && listeningState === 'idle' && (
                  <p className="text-xs text-green-600 font-medium">{t('handsFree.detected')}</p>
                )}

                {listeningState === 'error' && (
                  <p className="text-xs text-red-500">{t('handsFree.commandError')}</p>
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

        {/* Offline mode */}
        <div className="px-5 py-4 border-t border-gray-200 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              {t('offline.settingsRow')}
            </span>
            <button
              onClick={() => {
                if (offlineMode) {
                  onGoOnline();
                } else {
                  onEnterOfflineMode();
                  onClose();
                }
              }}
              role="switch"
              aria-checked={offlineMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                offlineMode ? 'bg-amber-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  offlineMode ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">{t('offline.settingsHint')}</p>
          {offlineMode && (
            <button
              onClick={onShowPending}
              className="text-left text-sm text-blue-600 hover:underline"
            >
              {t('offline.settingsPendingRow', { count: pendingCount })}
            </button>
          )}
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
