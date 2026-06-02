import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../src/components/ErrorBoundary';

function Boom() { throw new Error('kaboom'); }

describe('ErrorBoundary', () => {
  it('renders fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders children when no error', () => {
    render(<ErrorBoundary><div>safe</div></ErrorBoundary>);
    expect(screen.getByText('safe')).toBeInTheDocument();
  });
});
