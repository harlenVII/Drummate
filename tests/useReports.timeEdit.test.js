import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Signed-in counterpart to useReports.test.js: handleManualTimeAdjust must
// push every row it changed and delete every row it removed.
const { pushLog, deleteLogRemote } = vi.hoisted(() => ({
  pushLog: vi.fn(() => Promise.resolve()),
  deleteLogRemote: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/services/backends/firebaseBackend', () => ({ default: { pushLog, deleteLogRemote } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { db, addItem, addLog } from '../src/services/database';
import { getDateRangeUtc } from '../src/utils/tzDateHelpers';
import { setTimezone } from '../src/services/timezoneService';
import { useReports } from '../src/hooks/useReports';

const TZ = 'America/Los_Angeles';
const DATE = '2026-05-01';

beforeEach(async () => {
  await setTimezone(TZ);
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
  pushLog.mockClear();
  deleteLogRemote.mockClear();
});

describe('useReports.handleManualTimeAdjust (signed in)', () => {
  it('pushes the rows it changed and deletes the rows it removed', async () => {
    const item = await addItem('Paradiddle', 'fundamentals');
    const { startMs } = getDateRangeUtc(DATE, TZ);
    const early = await addLog(item.id, 300, { loggedAt: startMs + (21 * 60 + 7) * 60000 });
    const late = await addLog(item.id, 300, { loggedAt: startMs + (21 * 60 + 45) * 60000 });
    const { result } = renderHook(() => useReports({ onNavigateToSubpage: vi.fn() }));

    await act(async () => { await result.current.handleManualTimeAdjust(item.id, -480, DATE); });

    expect(deleteLogRemote).toHaveBeenCalledTimes(1);
    expect(deleteLogRemote.mock.calls[0][0]).toMatchObject({ id: late });
    expect(deleteLogRemote.mock.calls[0][1]).toBe('u1');
    expect(pushLog).toHaveBeenCalledTimes(1);
    expect(pushLog.mock.calls[0][0]).toMatchObject({ id: early, duration: 120 });
    expect(pushLog.mock.calls[0][1]).toBe('u1');
  });
});
