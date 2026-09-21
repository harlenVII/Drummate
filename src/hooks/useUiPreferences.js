import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/safeStorage';
import {
  getTheme, setTheme as setThemeService,
  getAccent, setAccent as setAccentService,
} from '../services/themeService';

export function useUiPreferences() {
  const [timeUnit, setTimeUnit] = useState(() => {
    const saved = getItem('drummate_time_unit');
    return saved === 'hours' ? 'hours' : 'minutes';
  });
  const [groupByCategory, setGroupByCategory] = useState(() => {
    const saved = getItem('drummate_group_by_category');
    return saved === null ? true : saved === 'true';
  });
  const [compactMode, setCompactMode] = useState(() => {
    return getItem('drummate_compact_mode') === 'true';
  });
  const [theme, setThemeState] = useState(getTheme);
  const [accent, setAccentState] = useState(getAccent);

  useEffect(() => {
    setItem('drummate_time_unit', timeUnit);
  }, [timeUnit]);

  useEffect(() => {
    setItem('drummate_group_by_category', String(groupByCategory));
  }, [groupByCategory]);

  useEffect(() => {
    setItem('drummate_compact_mode', String(compactMode));
  }, [compactMode]);

  const setTheme = useCallback((next) => {
    setThemeService(next);
    setThemeState(next);
  }, []);

  const setAccent = useCallback((next) => {
    setAccentService(next);
    setAccentState(next);
  }, []);

  return {
    timeUnit, setTimeUnit,
    groupByCategory, setGroupByCategory,
    compactMode, setCompactMode,
    theme, setTheme,
    accent, setAccent,
  };
}
