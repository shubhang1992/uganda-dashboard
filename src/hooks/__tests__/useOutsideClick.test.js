// Unit tests for useOutsideClick.
//
// Covers the behaviour the hook exists to guarantee — fire on outside
// mousedown / Escape, treat any supplied ref as "inside" — plus the
// listener-churn guard (M-C4): when the caller passes a STABLE refs array, a
// re-render must not tear down and re-add the document listeners. Callers that
// pass a fresh array literal each render (the old NotificationBell bug) would
// re-subscribe on every repaint, including each 30s poll; the fix memoises the
// array, so this test pins the contract from the hook side.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOutsideClick } from '../useOutsideClick';

let addSpy;
let removeSpy;

beforeEach(() => {
  addSpy = vi.spyOn(document, 'addEventListener');
  removeSpy = vi.spyOn(document, 'removeEventListener');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRef() {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return { node, ref: { current: node } };
}

describe('useOutsideClick', () => {
  it('fires onOutside for a mousedown outside every supplied ref', () => {
    const { ref } = makeRef();
    const onOutside = vi.fn();
    renderHook(() => useOutsideClick(true, onOutside, [ref]));

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the mousedown is inside a supplied ref', () => {
    const { node, ref } = makeRef();
    const onOutside = vi.fn();
    renderHook(() => useOutsideClick(true, onOutside, [ref]));

    act(() => {
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('fires onOutside on Escape', () => {
    const { ref } = makeRef();
    const onOutside = vi.fn();
    renderHook(() => useOutsideClick(true, onOutside, [ref]));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive (no listeners registered)', () => {
    const { ref } = makeRef();
    const onOutside = vi.fn();
    addSpy.mockClear();
    renderHook(() => useOutsideClick(false, onOutside, [ref]));
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('does NOT re-subscribe on re-render when refs + handler are stable (M-C4)', () => {
    const { ref } = makeRef();
    const onOutside = vi.fn();
    const stableRefs = [ref];
    const { rerender } = renderHook(
      ({ active, cb, refs }) => useOutsideClick(active, cb, refs),
      { initialProps: { active: true, cb: onOutside, refs: stableRefs } },
    );

    const addsAfterMount = addSpy.mock.calls.length;
    // Re-render with the SAME refs array + handler identity.
    rerender({ active: true, cb: onOutside, refs: stableRefs });
    // No additional add/remove churn — the effect's deps are unchanged.
    expect(addSpy.mock.calls.length).toBe(addsAfterMount);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('re-subscribes when the refs array identity changes (fresh literal each render)', () => {
    const { ref } = makeRef();
    const onOutside = vi.fn();
    const { rerender } = renderHook(
      ({ refs }) => useOutsideClick(true, onOutside, refs),
      { initialProps: { refs: [ref] } },
    );

    const addsAfterMount = addSpy.mock.calls.length;
    // A new array literal (the pre-fix NotificationBell behaviour) forces a
    // teardown + re-subscribe.
    rerender({ refs: [ref] });
    expect(addSpy.mock.calls.length).toBeGreaterThan(addsAfterMount);
    expect(removeSpy).toHaveBeenCalled();
  });
});
