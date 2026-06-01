import { useLanguage } from '../contexts/LanguageContext';

export default function AppHeader({ user, onOpenSettings }) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100">
        {t('appName')}
      </h1>
      <button
        onClick={onOpenSettings}
        className="w-9 h-9 rounded-full bg-blue-600 dark:bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors shrink-0"
        aria-label={t('accessibility.openSettings')}
        data-settings-button
      >
        {(user?.name || user?.email || '?')[0].toUpperCase()}
      </button>
    </div>
  );
}
