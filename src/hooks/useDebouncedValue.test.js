// Unit tests for `useDebouncedValue`. Uses `vi.useFakeTimers()` per the
// react-best-practices skill — debounce tests must drive `setTimeout`
// deterministically rather than waiting on wall-clock delays.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value on first render', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');

    rerender({ value: 'b' });
    // Still old value — timer not elapsed.
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('cancels the previous timer when value changes again before delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('a');

    // Rapid change — the previous timer should be cancelled, the new
    // one should start fresh from `c`.
    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('c');
  });

  it('honours a new delay value mid-flight', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 500 } },
    );

    rerender({ value: 'b', delay: 100 });
    // Effect re-fires with the new (shorter) delay → 100ms is enough.
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('b');
  });

  it('uses the default 300ms delay when omitted', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('b');
  });

  it('treats a zero delay as effectively immediate (next microtask)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 0), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe('b');
  });

  it('coerces negative or NaN delays to 0', () => {
    const { result, rerender } = renderHook(({ delay }) => useDebouncedValue('x', delay), {
      initialProps: { delay: -100 },
    });
    expect(result.current).toBe('x');
    rerender({ delay: NaN });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe('x');
  });

  it('handles non-primitive values (object identity)', () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: a },
    });
    rerender({ value: b });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(b);
  });
});
