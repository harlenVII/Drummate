function EncouragementButton({ status, onPress }) {
  const isLoading = status === 'downloading' || status === 'loading' || status === 'generating';

  return (
    <button
      onClick={onPress}
      className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-lg transition-all duration-200 active:scale-95"
      aria-label="AI Coach"
    >
      {isLoading ? (
        <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.09 6.26L20.18 9.27l-5.09 3.9L16.82 20 12 16.27 7.18 20l1.73-6.83L3.82 9.27l6.09-1.01z" />
        </svg>
      )}

      {status === 'error' && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[10px] font-bold">
          !
        </span>
      )}
    </button>
  );
}

export default EncouragementButton;
