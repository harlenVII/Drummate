import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, act, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { useState } from 'react';

vi.mock('../src/services/backends/firebaseBackend', () => ({
  default: {
    getUser: () => null,
    onAuthChange: () => () => {},
    refreshAuth: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    isAbortError: () => false,
    isNetworkError: () => false,
    pushAllLocal: vi.fn().mockResolvedValue(),
    pushAllLocalLogs: vi.fn().mockResolvedValue(),
    pushAllLocalNotes: vi.fn().mockResolvedValue(),
    pushAllLocalPractices: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('../src/services/database', () => ({
  wipeAllLocalData: vi.fn().mockResolvedValue(),
}));

function Probe() {
  const ctx = useAuth();
  return (
    <div>
      <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
      <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
      <button onClick={() => ctx.enterVisitorMode()}>enter</button>
      <button onClick={() => ctx.exitVisitorModeLogOff()}>logOff</button>
    </div>
  );
}

describe('AuthContext visitor mode', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('enterVisitorMode sets flag, persists, wipes Dexie', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('enter').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBe('true');
    expect(wipeAllLocalData).toHaveBeenCalledOnce();
  });

  it('exitVisitorModeLogOff wipes Dexie and clears flag', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('logOff').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(wipeAllLocalData).toHaveBeenCalledOnce();
  });

  it('restores isVisitor=true from localStorage on mount', () => {
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
  });
});

describe('signUpAsVisitor — success', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('transitions visitor→authenticated, migrates data, clears VISITOR_KEY', async () => {
    const firebaseBackend = (await import('../src/services/backends/firebaseBackend')).default;
    firebaseBackend.signUp.mockResolvedValue({ id: 'user-1', email: 'a@b.com', name: 'Alice' });
    globalThis.localStorage.setItem('drummate_visitor', 'true');

    function T() {
      const ctx = useAuth();
      return (
        <div>
          <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
          <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
          <button onClick={() => ctx.signUpAsVisitor('a@b.com', 'pass', 'Alice')}>go</button>
        </div>
      );
    }
    render(<AuthProvider><T /></AuthProvider>);

    await act(async () => { screen.getByText('go').click(); });

    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('user-1');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBeNull();
    expect(firebaseBackend.pushAllLocal).toHaveBeenCalledWith('user-1');
  });
});

describe('signUpAsVisitor — failure', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps visitor state intact when Firebase signUp throws', async () => {
    const firebaseBackend = (await import('../src/services/backends/firebaseBackend')).default;
    firebaseBackend.signUp.mockRejectedValue(new Error('Email already in use'));
    globalThis.localStorage.setItem('drummate_visitor', 'true');

    function T() {
      const ctx = useAuth();
      const [err, setErr] = useState('');
      return (
        <div>
          <span data-testid="isVisitor">{String(ctx.isVisitor)}</span>
          <button onClick={() => ctx.signUpAsVisitor('a@b.com', 'pass', 'Alice').catch(e => setErr(e.message))}>go</button>
          <span data-testid="error">{err}</span>
        </div>
      );
    }
    render(<AuthProvider><T /></AuthProvider>);

    await act(async () => { screen.getByText('go').click(); });

    expect(screen.getByTestId('isVisitor').textContent).toBe('true');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBe('true');
    expect(screen.getByTestId('error').textContent).toBe('Email already in use');
  });
});

describe('AuthProvider bootstrap (auth-init effect)', () => {
  let backend;
  let origGetUser;
  let origIsNetworkError;
  const origOnLineDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator),
    'onLine',
  );

  const setOnLine = (value) =>
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });

  beforeEach(async () => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
    backend = (await import('../src/services/backends/firebaseBackend')).default;
    origGetUser = backend.getUser;
    origIsNetworkError = backend.isNetworkError;
  });

  afterEach(() => {
    backend.getUser = origGetUser;
    backend.isNetworkError = origIsNetworkError;
    if (origOnLineDescriptor) {
      Object.defineProperty(navigator, 'onLine', origOnLineDescriptor);
    } else {
      setOnLine(true);
    }
  });

  function BootProbe() {
    const { user, authReady, sessionExpired } = useAuth();
    return (
      <div>
        <span data-testid="user">{user ? user.id : 'null'}</span>
        <span data-testid="ready">{String(authReady)}</span>
        <span data-testid="expired">{String(sessionExpired)}</span>
      </div>
    );
  }

  it('offline with a cached user: ready immediately, trusts cache, no refresh', async () => {
    setOnLine(false);
    backend.getUser = () => ({ id: 'cached' });
    await act(async () => {
      render(<AuthProvider><BootProbe /></AuthProvider>);
    });
    expect(screen.getByTestId('user').textContent).toBe('cached');
    expect(screen.getByTestId('ready').textContent).toBe('true');
    expect(backend.refreshAuth).not.toHaveBeenCalled();
  });

  it('online with a cached user: revalidates and adopts the refreshed user', async () => {
    setOnLine(true);
    backend.getUser = () => ({ id: 'cached' });
    backend.refreshAuth.mockResolvedValue({ id: 'refreshed' });
    await act(async () => {
      render(<AuthProvider><BootProbe /></AuthProvider>);
    });
    expect(backend.refreshAuth).toHaveBeenCalledOnce();
    expect(screen.getByTestId('user').textContent).toBe('refreshed');
    expect(screen.getByTestId('ready').textContent).toBe('true');
  });

  it('online network error during revalidation: keeps cached user, no sign-out', async () => {
    setOnLine(true);
    backend.getUser = () => ({ id: 'cached' });
    backend.isNetworkError = (err) => err?.code === 'auth/network-request-failed';
    backend.refreshAuth.mockRejectedValue({ code: 'auth/network-request-failed' });
    await act(async () => {
      render(<AuthProvider><BootProbe /></AuthProvider>);
    });
    expect(screen.getByTestId('user').textContent).toBe('cached');
    expect(screen.getByTestId('ready').textContent).toBe('true');
    expect(screen.getByTestId('expired').textContent).toBe('false');
    expect(backend.signOut).not.toHaveBeenCalled();
  });

  it('online auth error during revalidation: signs out and flags session expired', async () => {
    setOnLine(true);
    backend.getUser = () => ({ id: 'cached' });
    backend.refreshAuth.mockRejectedValue({ code: 'auth/user-token-expired' });
    await act(async () => {
      render(<AuthProvider><BootProbe /></AuthProvider>);
    });
    expect(backend.signOut).toHaveBeenCalledOnce();
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('expired').textContent).toBe('true');
    expect(screen.getByTestId('ready').textContent).toBe('true');
  });
});
