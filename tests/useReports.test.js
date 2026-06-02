import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// useReports reads logs via Dexie.liveQuery, which requires a real Dexie
// context to schedule its querier — so we use fake-indexeddb and the real db
// rather than mocking the database module.
vi.mock('../src/services/backends/firebaseBackend', () => ({ default: { pushLog: vi.fn() } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import { db, addAdjustmentLog } from '../src/services/database';
import { useReports } from '../src/hooks/useReports';

beforeEach(async () => {
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
});

describe('useReports', () => {
  it('handleReportDateChange updates date and reactively loads that day\'s logs', async () => {
    // Seed an adjustment log on a specific date.
    await addAdjustmentLog(1, 600, '2026-01-15');

    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage: vi.fn() }));

    await act(async () => { result.current.handleReportDateChange('2026-01-15'); });
    expect(result.current.reportDate).toBe('2026-01-15');

    // liveQuery re-subscribes on the new anchor and emits that day's logs.
    await waitFor(() => {
      expect(result.current.reportLogs).toHaveLength(1);
      expect(result.current.reportLogs[0].duration).toBe(600);
    });
  });

  it('handleDayClick navigates to daily', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { result.current.handleDayClick('2026-01-10'); });
    expect(result.current.reportDate).toBe('2026-01-10');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('daily');
  });

  it('handleWeekClick sets weekStart and navigates to weekly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { result.current.handleWeekClick('2026-01-05'); });
    expect(result.current.weekStart).toBe('2026-01-05');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('weekly');
  });

  it('handleMonthClick sets monthStart and navigates to monthly', async () => {
    const onNavigateToSubpage = vi.fn();
    const { result } = renderHook(() =>
      useReports({ loadData: vi.fn(), onNavigateToSubpage }));
    await act(async () => { result.current.handleMonthClick('2026-03-01'); });
    expect(result.current.monthStart).toBe('2026-03-01');
    expect(onNavigateToSubpage).toHaveBeenCalledWith('monthly');
  });
});
