import { describe, it, expect, vi } from 'vitest';
import { runWithOfflineQueue } from '../src/services/backends/offlineQueue.js';

const base = {
  isOffline: () => false,
  isOnline: () => true,
};

describe('runWithOfflineQueue', () => {
  it('queues the payload and skips onlineFn when offline', async () => {
    const queueFn = vi.fn();
    const onlineFn = vi.fn();
    await runWithOfflineQueue({
      ...base, isOffline: () => true,
      action: 'create_item', buildPayload: () => ({ uid: 'a' }), onlineFn, queueFn,
    });
    expect(onlineFn).not.toHaveBeenCalled();
    expect(queueFn).toHaveBeenCalledWith('create_item', { uid: 'a' });
  });

  it('runs onlineFn and does not queue on success', async () => {
    const queueFn = vi.fn();
    const onlineFn = vi.fn().mockResolvedValue(undefined);
    await runWithOfflineQueue({
      ...base, action: 'x', buildPayload: () => ({}), onlineFn, queueFn,
    });
    expect(onlineFn).toHaveBeenCalledTimes(1);
    expect(queueFn).not.toHaveBeenCalled();
  });

  it('queues the SAME payload when onlineFn throws and connectivity is lost', async () => {
    const queueFn = vi.fn();
    const onlineFn = vi.fn().mockRejectedValue(new Error('network'));
    await runWithOfflineQueue({
      ...base, isOnline: () => false,
      action: 'create_log', buildPayload: () => ({ uid: 'l', itemName: 'Paradiddle' }), onlineFn, queueFn,
    });
    expect(queueFn).toHaveBeenCalledWith('create_log', { uid: 'l', itemName: 'Paradiddle' });
  });

  it('rethrows when onlineFn throws but still online', async () => {
    const queueFn = vi.fn();
    const onlineFn = vi.fn().mockRejectedValue(new Error('permission-denied'));
    await expect(runWithOfflineQueue({
      ...base, action: 'x', buildPayload: () => ({}), onlineFn, queueFn,
    })).rejects.toThrow('permission-denied');
    expect(queueFn).not.toHaveBeenCalled();
  });

  it('builds the payload lazily — never on the happy online path', async () => {
    const buildPayload = vi.fn(() => ({ uid: 'a' }));
    const onlineFn = vi.fn().mockResolvedValue(undefined);
    await runWithOfflineQueue({
      ...base, action: 'x', buildPayload, onlineFn, queueFn: vi.fn(),
    });
    expect(buildPayload).not.toHaveBeenCalled();
  });

  it('supports async buildPayload', async () => {
    const queueFn = vi.fn();
    await runWithOfflineQueue({
      ...base, isOffline: () => true,
      action: 'delete_item', buildPayload: async () => ({ uid: 'z', displayName: 'Flam' }),
      onlineFn: vi.fn(), queueFn,
    });
    expect(queueFn).toHaveBeenCalledWith('delete_item', { uid: 'z', displayName: 'Flam' });
  });
});
