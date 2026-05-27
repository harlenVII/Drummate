// Node 25 introduces a native `localStorage` getter on the global object that
// conflicts with jsdom's localStorage in vitest. We redefine globalThis.localStorage
// to point at jsdom's internal _localStorage so tests can call .clear() etc.
if (typeof window !== 'undefined' && window._localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: window._localStorage,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
