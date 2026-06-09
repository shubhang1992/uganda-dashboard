// SignupContext — signupNonce idempotency-key behaviour (P5).
//
// The whole signup-dedup story (0042 p_nonce) depends on the nonce being STABLE
// across retries + reloads of one attempt, but DISTINCT per new subscriber.
// A reload that minted a fresh nonce would defeat dedup ("stale nonce = no
// dedupe" in the risk register), so the persistence/rehydration test below is
// the load-bearing one.

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SignupProvider, useSignup } from './SignupContext';
import { SIGNUP_STORAGE_KEY } from './signupState';

const wrapper = ({ children }) => <SignupProvider>{children}</SignupProvider>;

beforeEach(() => {
  localStorage.clear();
});

describe('SignupContext — signupNonce', () => {
  it('generates a non-empty nonce that is stable across patches', () => {
    const { result } = renderHook(() => useSignup(), { wrapper });
    const nonce = result.current.signupNonce;
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);

    act(() => result.current.patch({ fullName: 'Asha' }));
    // Patches must NOT churn the nonce — a retry of the same attempt reuses it.
    expect(result.current.signupNonce).toBe(nonce);
  });

  it('reset() mints a fresh nonce so the next subscriber gets a distinct key', () => {
    const { result } = renderHook(() => useSignup(), { wrapper });
    const first = result.current.signupNonce;
    act(() => result.current.reset());
    expect(result.current.signupNonce).not.toBe(first);
    expect(result.current.signupNonce.length).toBeGreaterThan(0);
  });

  it('rotateSignupNonce() mints a fresh nonce but PRESERVES other state (post-success spend)', () => {
    // Called after a successful create so the spent nonce can never be replayed
    // for a different subscriber (e.g. Close-without-reset → re-enter). Unlike
    // reset(), it must keep the rest of the signup state intact.
    const { result } = renderHook(() => useSignup(), { wrapper });
    act(() => result.current.patch({ fullName: 'Asha' }));
    const before = result.current.signupNonce;
    act(() => result.current.rotateSignupNonce());
    expect(result.current.signupNonce).not.toBe(before);
    expect(result.current.signupNonce.length).toBeGreaterThan(0);
    expect(result.current.fullName).toBe('Asha'); // other state untouched

    // Durable IMMEDIATELY (no debounce wait): a fast unmount (e.g. Close right
    // after a successful create) must not drop the rotation, so localStorage
    // reflects the fresh nonce synchronously.
    expect(JSON.parse(localStorage.getItem(SIGNUP_STORAGE_KEY)).signupNonce)
      .toBe(result.current.signupNonce);
  });

  it('persists the nonce so a reload reuses the SAME key (dedup survives refresh)', async () => {
    const first = renderHook(() => useSignup(), { wrapper });
    const nonce = first.result.current.signupNonce;

    // Force a write and flush the 300ms persist debounce.
    act(() => first.result.current.patch({ fullName: 'Asha' }));
    await new Promise((r) => setTimeout(r, 350));
    expect(JSON.parse(localStorage.getItem(SIGNUP_STORAGE_KEY)).signupNonce).toBe(nonce);
    first.unmount();

    // Second mount simulates a reload — loadPersisted must rehydrate the nonce.
    const second = renderHook(() => useSignup(), { wrapper });
    expect(second.result.current.signupNonce).toBe(nonce);
  });
});
