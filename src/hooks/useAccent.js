import { useSyncExternalStore } from 'react';
import { subscribeTheme, getAccent } from '../services/themeService';
import { DEFAULT_ACCENT } from '../constants/accentPalettes';

// Reactive current accent scheme. Companion to useIsDarkMode — the two axes
// share themeService's listener set, so either one changing re-renders both.
export function useAccent() {
  return useSyncExternalStore(
    subscribeTheme,
    getAccent,
    () => DEFAULT_ACCENT,
  );
}
