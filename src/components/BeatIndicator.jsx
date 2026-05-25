function BeatIndicator({ beats, currentBeat, isPlaying }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: beats }, (_, i) => {
        const isActive = isPlaying && currentBeat === i;
        const isAccent = i === 0;
        return (
          <div
            key={i}
            className={`w-5 h-5 rounded-full transition-all duration-100 ${
              isActive
                ? isAccent
                  ? 'bg-indigo-600 scale-125'
                  : 'bg-indigo-500 scale-125'
                : isAccent
                  ? 'bg-gray-300 dark:bg-slate-600'
                  : 'bg-gray-200 dark:bg-slate-700'
            }`}
          />
        );
      })}
    </div>
  );
}

export default BeatIndicator;
