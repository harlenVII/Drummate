function ReportNavHeader({ onPrev, onNext, nextDisabled, prevLabel, nextLabel, compactMode = false, children }) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onPrev}
        className={`${compactMode ? 'p-1' : 'p-2'} text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors`}
        aria-label={prevLabel}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className={`${compactMode ? 'text-base' : 'text-lg'} font-semibold text-gray-800 dark:text-slate-100`}>
        {children}
      </span>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`${compactMode ? 'p-1' : 'p-2'} transition-colors ${
          nextDisabled
            ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
            : 'text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
        }`}
        aria-label={nextLabel}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default ReportNavHeader;
