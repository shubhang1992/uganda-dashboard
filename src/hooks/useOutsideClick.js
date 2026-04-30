import { useEffect } from 'react';

/**
 * Run a handler when the user clicks/touches outside any of the supplied refs,
 * or presses Escape. The handler is registered on `mousedown` (not `click`) so
 * outside-click runs before the trigger button's own click handler — preventing
 * the close-then-immediately-reopen race that ad-hoc document.addEventListener
 * patterns produce.
 *
 * @param {boolean} active - Only listen while this is true
 * @param {Function} onOutside - Called on outside click / Escape
 * @param {Array<React.RefObject<HTMLElement>>} refs - Refs to treat as "inside"
 */
export function useOutsideClick(active, onOutside, refs) {
  useEffect(() => {
    if (!active) return undefined;
    function handleMouseDown(e) {
      const inside = refs.some((ref) => ref?.current && ref.current.contains(e.target));
      if (!inside) onOutside(e);
    }
    function handleKey(e) {
      if (e.key === 'Escape') onOutside(e);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [active, onOutside, refs]);
}
