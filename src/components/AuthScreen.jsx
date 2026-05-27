import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function AuthScreen() {
  const { signIn, signUp, sessionExpired, enterVisitorMode, fromVisitorIntent } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(fromVisitorIntent === 'signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGuestConfirm, setShowGuestConfirm] = useState(false);

  useEffect(() => {
    if (fromVisitorIntent === 'signUp') setIsSignUp(true);
    if (fromVisitorIntent === 'signIn') setIsSignUp(false);
  }, [fromVisitorIntent]);

  const handleConfirmGuest = async () => {
    setShowGuestConfirm(false);
    await enterVisitorMode();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password, name);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err?.message || err?.data?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center bg-gray-100 dark:bg-slate-900 px-4 pt-20 pb-8">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🥁</span>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100">{t('appName')}</h1>
          </div>
          <button
            onClick={toggleLanguage}
            className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            {language === 'en' ? '中文' : 'EN'}
          </button>
        </div>

        {sessionExpired && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm text-center">
            {t('auth.sessionExpired')}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-6">
            {isSignUp ? t('auth.signUp') : t('auth.signIn')}
          </h2>

          {fromVisitorIntent && (
            <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-indigo-900/30 border border-blue-200 dark:border-indigo-700 rounded-xl text-blue-700 dark:text-indigo-200 text-sm">
              {fromVisitorIntent === 'signUp'
                ? t('auth.upgradeBannerSignUp')
                : t('auth.upgradeBannerSignIn')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.name')}
                autoComplete="name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email')}
              required
              inputMode="email"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password')}
              required
              minLength={8}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
            />

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              {submitting
                ? t('auth.syncing')
                : isSignUp ? t('auth.signUp') : t('auth.signIn')
              }
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-slate-400">
            {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-blue-500 dark:text-indigo-500 font-medium hover:underline"
            >
              {isSignUp ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </p>

          <div className="mt-6 flex items-center gap-3">
            <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
            <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500">
              {t('auth.dividerOr')}
            </span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
          </div>

          <button
            type="button"
            onClick={() => setShowGuestConfirm(true)}
            className="mt-4 w-full py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            {t('auth.continueAsGuest')}
          </button>
        </div>
      </div>

      {showGuestConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl">
            <p className="text-sm text-gray-700 dark:text-slate-200 mb-6">
              {t('auth.guestWipeWarning')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowGuestConfirm(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600"
              >
                {t('auth.guestCancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmGuest}
                className="flex-1 py-3 bg-blue-500 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-blue-600 dark:hover:bg-indigo-600"
              >
                {t('auth.guestConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
