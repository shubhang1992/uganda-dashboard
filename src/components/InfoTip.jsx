import { useId, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './InfoTip.module.css';

/**
 * InfoTip — a small explain-on-hover/focus tooltip for an inline figure.
 *
 * The bubble is rendered through a portal to <body> so it is never clipped by an
 * ancestor's `overflow: hidden` (the desktop MetricTile clips its glow), and it
 * is position:fixed at the trigger's measured rect.
 *
 * Accessibility (WCAG 1.4.13 — content on hover/focus):
 *   • reveals on BOTH hover and keyboard focus (the trigger is tabbable), so it
 *     is not hover-only,
 *   • dismissable with Escape while it stays open,
 *   • described via aria-describedby so screen readers announce the explanation
 *     when the trigger gains focus.
 *
 * Presentational/inline only — pass the visible figure as `children` and the
 * explanation node as `content`. The trigger is a real <button> (natively
 * focusable + announced), styled as inline text. Desktop Home use today; kept
 * generic. `style` passes through to the trigger so the caller can colour it
 * (the dotted-underline affordance follows that colour via currentColor).
 */
export default function InfoTip({ children, content, className = '', style }) {
  const id = useId();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: r.left + r.width / 2 });
  }, []);

  const show = useCallback(() => { place(); setOpen(true); }, [place]);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => place();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    // capture:true catches scrolls on the inner shell viewport, not just window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  return (
    <button
      type="button"
      ref={triggerRef}
      className={`${styles.trigger} ${className}`}
      style={style}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && createPortal(
        <span
          role="tooltip"
          id={id}
          className={styles.bubble}
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        >
          {content}
        </span>,
        document.body,
      )}
    </button>
  );
}
