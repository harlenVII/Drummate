import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function VisitorSignUpModal({ onClose }) {
  const { signUpAsVisitor } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successName, setSuccessName] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signUpAsVisitor(email, password, name);
      setSuccessName(name || t('auth.name'));
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err.message || t('auth.syncing'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {successName ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-3">🎉</div>
            <p className="text-gray-800 dark:text-slate-100 font-medium text-sm">
              {t('settings.visitorSignUpSuccess', { name: successName })}
            </p>
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-indigo-900/30 border border-blue-200 dark:border-indigo-700 rounded-xl text-blue-700 dark:text-indigo-200 text-sm">
              {t('settings.visitorSignUpNotice')}
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-4">
              {t('auth.signUp')}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.name')}
                autoComplete="name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-base text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 focus:border-transparent"
              />
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
                autoComplete="new-password"
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
                {submitting ? t('auth.syncing') : t('auth.signUp')}
              </button>
            </form>
            <p className="mt-4 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-500 dark:text-slate-400 hover:underline"
              >
                {t('auth.guestCancel')}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
