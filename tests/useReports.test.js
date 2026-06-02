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
      useReports({ loadData: vi.fn(), onNavigateToSubpage: vi.fn() }));
    await act(async () => { await result.current.handleReportDateChange('2026-01-15'); });
    expect(result.current.reportDate).toBe('2026-01-15');
    expect(getLogsByDate).toHaveBeenCalledWith('2026-01-15');
  });

  it('handleDayClick navigates to daily', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleDayClick('2026-01-10'); });
    expect(result.current.reportDate).toBe('2026-01-10');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('daily');
  });

  it('handleWeekClick sets weekStart and navigates to weekly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleWeekClick('2026-01-05'); });
    expect(result.current.weekStart).toBe('2026-01-05');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('weekly');
  });

  it('handleMonthClick sets monthStart and navigates to monthly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { await result.current.handleMonthClick('2026-03-01'); });
    expect(result.current.monthStart).toBe('2026-03-01');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('monthly');
  });
});
