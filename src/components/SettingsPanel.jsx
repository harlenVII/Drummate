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

function SectionLabel({ children, first = false }) {
  return (
    <h3
      className={`text-xs font-bold tracking-wider uppercase text-gray-400 dark:text-slate-500 px-5 pb-2 ${
        first ? 'pt-3' : 'pt-5'
      }`}
    >
      {children}
    </h3>
  );
}

function Row({ label, subtitle, control }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 min-h-[40px] gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-slate-200">{label}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 line-clamp-1">{subtitle}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function PillGroup({ options, value, onSelect }) {
  return (
    <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => value !== opt.value && onSelect(opt.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false, tone = 'indigo' }) {
  const onBg = tone === 'amber' ? 'bg-amber-500' : 'bg-blue-600 dark:bg-indigo-600';
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? onBg : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SettingsPanel({
  isOpen,
  onClose,
  signOut,
  language,
  toggleLanguage,
  theme,
  onThemeChange,
  user,
  timeUnit,
  onToggleTimeUnit,
  groupByCategory,
  onToggleGroupByCategory,
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
  const currentTzInList = TIMEZONE_OPTIONS.some((o) => o.value === currentTz);

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
  const kokoroDisabled = (!aiCoachEnabled && !handsFreeMode) || kokoroLangUnsupported;
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

  // Natural Voice subtitle: status-aware, falls back to description.
  let naturalVoiceSubtitle = kokoroEffective ? null : t('naturalVoice.description');
  let naturalVoiceMessage = null;
  let naturalVoiceMessageTone = '';
  if (kokoroLangUnsupported) {
    naturalVoiceSubtitle = t('naturalVoice.unsupportedLang');
  } else if (kokoroDisabled) {
    naturalVoiceSubtitle = t('naturalVoice.requires');
  } else if (kokoroStatus === 'downloading') {
    naturalVoiceMessage = t('naturalVoice.downloading');
    naturalVoiceMessageTone = 'text-blue-500 dark:text-indigo-500';
  } else if (kokoroStatus === 'ready' && kokoroEffective) {
    naturalVoiceMessage = t('naturalVoice.ready');
    naturalVoiceMessageTone = 'text-green-600';
  } else if (kokoroStatus === 'error') {
    naturalVoiceMessage = t('naturalVoice.error');
    naturalVoiceMessageTone = 'text-red-500';
  }

  // Hands-Free subtitle: status-aware, falls back to description.
  let handsFreeSubtitle = t('handsFree.description');
  let handsFreeMessage = null;
  let handsFreeMessageTone = '';
  if (!isChrome) {
    handsFreeSubtitle = t('handsFree.unsupportedBrowser');
  } else if (wakeWordError === 'mic_permission') {
    handsFreeMessage = t('handsFree.micPermission');
    handsFreeMessageTone = 'text-red-500';
  } else if (wakeWordError) {
    handsFreeMessage = t('handsFree.error');
    handsFreeMessageTone = 'text-red-500';
  } else if (wakeWordLoading) {
    handsFreeMessage = t('handsFree.loading');
    handsFreeMessageTone = 'text-blue-500 dark:text-indigo-500';
  } else if (listeningState === 'error') {
    handsFreeMessage = t('handsFree.commandError');
    handsFreeMessageTone = 'text-red-500';
  } else if (listeningState === 'processing' && voiceTranscript) {
    handsFreeMessage = `"${voiceTranscript}"`;
    handsFreeMessageTone = 'text-blue-600 dark:text-indigo-600 font-medium';
  } else if (wakeWordDetected && listeningState === 'listening') {
    handsFreeMessage = t('handsFree.listening');
    handsFreeMessageTone = 'text-green-600 font-medium';
  } else if (wakeWordDetected && listeningState === 'idle') {
    handsFreeMessage = t('handsFree.detected');
    handsFreeMessageTone = 'text-green-600 font-medium';
  }

  const handsFreeBadge = handsFreeMode ? (
    <span className="relative inline-flex h-2 w-2 ml-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  ) : null;

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
        className={`fixed top-0 right-0 h-full w-72 bg-white dark:bg-slate-900 z-50 shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">{t('settings')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            aria-label="Close settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile */}
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-base font-semibold shrink-0">
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            {user?.name && (
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">{user.name}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto pb-2">
          {/* === DISPLAY === */}
          <SectionLabel first>{t('settingsSection.display')}</SectionLabel>

          <Row
            label={t('language')}
            control={
              <PillGroup
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'zh', label: '中文' },
                ]}
                value={language}
                onSelect={() => toggleLanguage()}
              />
            }
          />

          <Row
            label={t('theme')}
            control={
              <PillGroup
                options={[
                  { value: 'light', label: t('themeLight') },
                  { value: 'dark', label: t('themeDark') },
                ]}
                value={theme}
                onSelect={(v) => onThemeChange(v)}
              />
            }
          />

          <Row
            label={t('timeUnit')}
            control={
              <PillGroup
                options={[
                  { value: 'minutes', label: t('timeUnitMin') },
                  { value: 'hours', label: t('timeUnitHr') },
                ]}
                value={timeUnit}
                onSelect={() => onToggleTimeUnit()}
              />
            }
          />

          {/* === REPORTS === */}
          <SectionLabel>{t('settingsSection.reports')}</SectionLabel>

          <Row
            label={t('timezone')}
            control={
              <div className="relative flex items-center">
                <select
                  value={currentTz}
                  onChange={handleTimezoneChange}
                  className="appearance-none bg-transparent border-none text-sm text-gray-700 dark:text-slate-300 pr-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:rounded-sm text-right"
                >
                  {!currentTzInList && <option value={currentTz}>{currentTz}</option>}
                  {TIMEZONE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="absolute right-0 text-gray-400 dark:text-slate-500 pointer-events-none text-xs">▾</span>
              </div>
            }
          />

          <Row
            label={t('groupByCategory')}
            control={<Toggle checked={groupByCategory} onChange={onToggleGroupByCategory} />}
          />

          {/* === AI & VOICE === */}
          <SectionLabel>{t('settingsSection.aiVoice')}</SectionLabel>

          <Row
            label={t('aiCoach.title')}
            subtitle={!aiCoachEnabled ? t('aiCoach.description') : undefined}
            control={<Toggle checked={aiCoachEnabled} onChange={onToggleAiCoach} />}
          />

          <Row
            label={t('naturalVoice.title')}
            subtitle={naturalVoiceSubtitle}
            control={
              <Toggle
                checked={kokoroEffective}
                onChange={onToggleKokoro}
                disabled={kokoroStatus === 'downloading' || kokoroDisabled}
              />
            }
          />
          {kokoroStatus === 'downloading' && (
            <div className="px-5 pb-2 flex flex-col gap-1">
              <p className={`text-xs ${naturalVoiceMessageTone}`}>{naturalVoiceMessage}</p>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 dark:bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${kokoroProgress.percentage}%` }}
                />
              </div>
            </div>
          )}
          {naturalVoiceMessage && kokoroStatus !== 'downloading' && (
            <p className={`px-5 pb-2 text-xs ${naturalVoiceMessageTone}`}>{naturalVoiceMessage}</p>
          )}

          <Row
            label={
              <span className="inline-flex items-center">
                {t('handsFree.title')}
                {handsFreeBadge}
              </span>
            }
            subtitle={handsFreeSubtitle}
            control={
              <Toggle
                checked={handsFreeMode}
                onChange={onToggleHandsFree}
                disabled={wakeWordLoading || !isChrome}
              />
            }
          />
          {handsFreeMessage && (
            <p className={`px-5 pb-2 text-xs ${handsFreeMessageTone}`}>{handsFreeMessage}</p>
          )}

          {/* === SYNC === */}
          <SectionLabel>{t('settingsSection.sync')}</SectionLabel>

          <Row
            label={t('offline.settingsRow')}
            subtitle={t('offline.settingsHint')}
            control={
              <Toggle
                checked={offlineMode}
                tone="amber"
                onChange={() => {
                  if (offlineMode) {
                    onGoOnline();
                  } else {
                    onEnterOfflineMode();
                    onClose();
                  }
                }}
              />
            }
          />
          {offlineMode && pendingCount > 0 && (
            <button
              onClick={onShowPending}
              className="block w-full px-5 pb-2 text-right text-xs text-blue-600 dark:text-indigo-400 hover:underline"
            >
              {t('offline.settingsPendingRow', { count: pendingCount })} →
            </button>
          )}
        </div>

        {/* Sign Out footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 text-center">
          <button
            onClick={signOut}
            className="text-sm font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    </>
  );
}

export default SettingsPanel;
