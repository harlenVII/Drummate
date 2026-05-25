import { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const SHORTCUTS = [
  { keys: ['1', '2', '3', '4'], descEn: 'Switch to Practice / Metronome / Report / Notes', descZh: '切换到练习 / 节拍器 / 报告 / 笔记' },
  { keys: ['M', 'H'],           descEn: 'Time unit: Minutes / Hours',                      descZh: '时间单位：分钟 / 小时' },
  { keys: ['E', 'C'],           descEn: 'Language: English / Chinese',                      descZh: '语言：英文 / 中文' },
  { keys: ['L', 'D'],           descEn: 'Theme: Light / Dark',                              descZh: '主题：浅色 / 深色' },
  { keys: ['S'],                descEn: 'Stop active timer',                                descZh: '停止计时器' },
  { keys: ['?'],                descEn: null,                                               descZh: null },
];

function Kbd({ label }) {
  return (
    <kbd className="font-mono text-xs bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200">
      {label}
    </kbd>
  );
}

function KeyboardShortcutsModal({ isOpen, onClose }) {
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
          <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-gray-800 dark:text-slate-100">
            {t('shortcuts.title')}
          </h2>
        </div>

        <div className="px-5 py-3">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map(({ keys, descEn, descZh }) => {
                const desc = descEn === null
                  ? t('shortcuts.showHideHelp')
                  : (language === 'zh' ? descZh : descEn);
                return (
                  <tr key={keys.join('+')} className="border-b border-gray-100 dark:border-slate-700 last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className="text-gray-400 dark:text-slate-500 mx-1">/</span>}
                          <Kbd label={k} />
                        </span>
                      ))}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-slate-300">{desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
