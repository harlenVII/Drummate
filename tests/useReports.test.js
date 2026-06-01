import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getLogsByDate = vi.fn(async () => []);
const getLogsByDateRange = vi.fn(async () => []);
vi.mock('../src/services/database', () => ({
  getLogsByDate: (...a) => getLogsByDate(...a),
  getLogsByDateRange: (...a) => getLogsByDateRange(...a),
  addAdjustmentLog: vi.fn(),
  reattributeLogsToDate: vi.fn(),
  db: { practiceLogs: { get: vi.fn() } },
}));
vi.mock('../src/services/backends/firebaseBackend', () => ({ default: { pushLog: vi.fn() } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import { useReports } from '../src/hooks/useReports';

describe('useReports', () => {
  beforeEach(() => { getLogsByDate.mockClear(); });

  it('handleReportDateChange updates date and loads that day', async () => {
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToDaily: vi.fn() }));
    await act(async () => { await result.current.handleReportDateChange('2026-01-15'); });
    expect(result.current.reportDate).toBe('2026-01-15');
    expect(getLogsByDate).toHaveBeenCalledWith('2026-01-15');
  });

  it('handleDayClick fires onNavigateToDaily', async () => {
    const onNavigateToDaily = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToDaily }));
    await act(async () => { await result.current.handleDayClick('2026-01-10'); });
    expect(onNavigateToDaily).toHaveBeenCalled();
    expect(result.current.reportDate).toBe('2026-01-10');
  });
});
