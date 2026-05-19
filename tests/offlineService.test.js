import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('offlineService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults to false on first import', async () => {
    const m = await import('../src/services/offlineService.js');
    expect(m.getOfflineMode()).toBe(false);
  });

  it('setOfflineMode(true) flips the value', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode(true);
    expect(m.getOfflineMode()).toBe(true);
  });

  it('setOfflineMode(false) flips it back', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode(true);
    m.setOfflineMode(false);
    expect(m.getOfflineMode()).toBe(false);
  });

  it('coerces non-boolean values to boolean', async () => {
    const m = await import('../src/services/offlineService.js');
    m.setOfflineMode('truthy');
    expect(m.getOfflineMode()).toBe(true);
    m.setOfflineMode(0);
    expect(m.getOfflineMode()).toBe(false);
  });

  it('state does not leak across module resets', async () => {
    const m1 = await import('../src/services/offlineService.js');
    m1.setOfflineMode(true);
    vi.resetModules();
    const m2 = await import('../src/services/offlineService.js');
    expect(m2.getOfflineMode()).toBe(false);
  });
});
