// DataScopeContext — the distributor-isolation guarantee is load-bearing.
//
// The admin Platform Overview scope filter and the SHARED OverlayPanel both read
// this context. The critical invariant: OUTSIDE a provider (every non-admin role,
// e.g. distributor) the hook must return a frozen distributor-only default with
// employerAware === false, so the shared OverlayPanel renders exactly as before
// and never fires the admin-only employer query.

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DataScopeProvider, useDataScope } from './DataScopeContext';
import { SCOPES } from '../constants/scopes';

describe('DataScopeContext', () => {
  it('returns a distributor-only default with employerAware=false outside a provider', () => {
    const { result } = renderHook(() => useDataScope());
    expect(result.current.scope).toBe(SCOPES.DISTRIBUTORS);
    expect(result.current.employerAware).toBe(false);
    // setScope is a safe no-op outside a provider (never throws).
    expect(() => act(() => result.current.setScope(SCOPES.ALL))).not.toThrow();
    expect(result.current.scope).toBe(SCOPES.DISTRIBUTORS);
  });

  it('defaults to ALL and is employerAware inside a provider', () => {
    const wrapper = ({ children }) => <DataScopeProvider>{children}</DataScopeProvider>;
    const { result } = renderHook(() => useDataScope(), { wrapper });
    expect(result.current.scope).toBe(SCOPES.ALL);
    expect(result.current.employerAware).toBe(true);
  });

  it('honours defaultScope and updates via setScope', () => {
    const wrapper = ({ children }) => (
      <DataScopeProvider defaultScope={SCOPES.DISTRIBUTORS}>{children}</DataScopeProvider>
    );
    const { result } = renderHook(() => useDataScope(), { wrapper });
    expect(result.current.scope).toBe(SCOPES.DISTRIBUTORS);
    act(() => result.current.setScope(SCOPES.EMPLOYERS));
    expect(result.current.scope).toBe(SCOPES.EMPLOYERS);
  });
});
