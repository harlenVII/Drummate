import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      <span data-testid="fromVisitorIntent">{String(ctx.fromVisitorIntent)}</span>
      <button onClick={() => ctx.enterVisitorMode()}>enter</button>
      <button onClick={() => ctx.exitVisitorModeForAuth('signUp')}>exitSignUp</button>
      <button onClick={() => ctx.exitVisitorModeForAuth('signIn')}>exitSignIn</button>
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

  it('exitVisitorModeForAuth("signUp") sets intent without wiping Dexie', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('exitSignUp').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('fromVisitorIntent').textContent).toBe('signUp');
    expect(globalThis.localStorage.getItem('drummate_visitor')).toBeNull();
    expect(wipeAllLocalData).not.toHaveBeenCalled();
  });

  it('exitVisitorModeForAuth("signIn") wipes Dexie immediately (before Firebase auth fires)', async () => {
    const { wipeAllLocalData } = await import('../src/services/database');
    globalThis.localStorage.setItem('drummate_visitor', 'true');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByText('exitSignIn').click();
    });
    expect(screen.getByTestId('isVisitor').textContent).toBe('false');
    expect(screen.getByTestId('fromVisitorIntent').textContent).toBe('signIn');
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
    expect(screen.getByTestId('fromVisitorIntent').textContent).toBe('null');
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
