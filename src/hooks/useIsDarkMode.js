import { useSyncExternalStore } from 'react';
import { subscribeTheme, getTheme } from '../services/themeService';

// Reactive `true` when the app theme is dark. Subscribes to themeService so
// components re-render on theme toggles (the L/D shortcut and Settings both
// route through setTheme). Replaces ad-hoc `document.documentElement
// .classList.contains('dark')` reads that were not reactive.
export function useIsDarkMode() {
  return useSyncExternalStore(
    subscribeTheme,
    () => getTheme() === 'dark',
    () => false,
  );
}
