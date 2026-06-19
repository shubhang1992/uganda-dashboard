/**
 * ui.jsx — shared presentational atoms for the employer DESKTOP pages.
 *
 * Thin wrappers over ui.module.css so every page (Overview, Employees, Runs,
 * Insurance, Analytics, Support, Settings) renders the mockup's component library
 * identically. Exports ONLY components (react-refresh safe); the accent palette
 * is module-internal.
 */

import { Link } from 'react-router-dom';
import styles from './ui.module.css';

// Tile / card accent palette — mockup-exact hexes (with global-token fallbacks).
// `ac` drives the 3px rail + chip glyph; `tint` is the chip-bg rgb.
const ACCENTS = {
  indigo: { ac: 'var(--color-indigo)', tint: '41,40,103' },
  indigoSoft: { ac: 'var(--color-indigo-soft)', tint: '94,99,168' },
  green: { ac: 'var(--color-green)', tint: '46,139,87' },
  teal: { ac: 'var(--color-teal)', tint: '47,143,157' },
  amber: { ac: 'var(--color-amber, #D97706)', tint: '217,119,6' },
};

function accentStyle(accent) {
  const a = ACCENTS[accent] || ACCENTS.indigo;
  return { '--ac': a.ac, '--tint': a.tint };
}

/** Page header — eyebrow + title + optional sub. Page-level actions live in
 *  toolrows/cards/footers, never here, so they never collide with the shell's
 *  floating Ask AI + notification bell (top-right). */
export function PageHead({ eyebrow, title, sub }) {
  return (
    <div className={styles.contentTop}>
      <div>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
        </div>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
    </div>
  );
}

export function Hero({ icon, eyebrow, value, children }) {
  return (
    <div className={styles.hero}>
      <div className={styles.heroChip}>{icon}</div>
      <div>
        <p className={styles.heroEyebrow}>{eyebrow}</p>
        <div className={styles.heroValue}>{value}</div>
        {children && <p className={styles.heroStats}>{children}</p>}
      </div>
    </div>
  );
}

export function MetricRow({ cols = 4, children }) {
  return <div className={cols === 3 ? styles.metrics3 : styles.metrics4}>{children}</div>;
}

export function Tile({ accent = 'indigo', icon, label, value, sub, onClick, to }) {
  const inner = (
    <>
      {icon && <div className={styles.tileChip}>{icon}</div>}
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
    </>
  );
  const style = accentStyle(accent);
  if (to) {
    return (
      <Link to={to} className={`${styles.tile} ${styles.tileInteractive}`} style={style}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${styles.tile} ${styles.tileInteractive}`} style={style}>
        {inner}
      </button>
    );
  }
  return (
    <div className={styles.tile} style={style}>
      {inner}
    </div>
  );
}

export function Card({ accent, className = '', children }) {
  const cls = `${styles.card} ${accent ? styles.cardAccent : ''} ${className}`.trim();
  return (
    <section className={cls} style={accent ? accentStyle(accent) : undefined}>
      {children}
    </section>
  );
}

export function SectionHead({ icon, iconTone = 'indigo', title, tag, action }) {
  return (
    <div className={styles.blockHead}>
      <span className={styles.blockTitle}>
        {icon && <span className={`${styles.blockIc} ${iconTone === 'teal' ? styles.blockIcTeal : ''}`}>{icon}</span>}
        {title}
      </span>
      {tag && <Tag>{tag}</Tag>}
      {action}
    </div>
  );
}

export function Tag({ children }) {
  return <span className={styles.tag}>{children}</span>;
}

const ST_TONE = {
  active: styles.stActive,
  done: styles.stDone,
  open: styles.stOpen,
  inactive: styles.stInactive,
  poor: styles.stPoor,
};

export function StatusBadge({ tone = 'inactive', dot = true, children }) {
  return (
    <span className={`${styles.st} ${ST_TONE[tone] || styles.stInactive}`}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

const BTN_VARIANT = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

export function Btn({ variant = 'primary', size, to, className = '', children, ...props }) {
  const cls = `${styles.btn} ${BTN_VARIANT[variant] || styles.btnPrimary} ${size === 'sm' ? styles.btnSm : ''} ${className}`.trim();
  if (to) {
    return (
      <Link to={to} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...props}>
      {children}
    </button>
  );
}

/** Initials avatar from a member name (max 2 letters). */
export function Avatar({ name = '' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return <span className={styles.avatar} aria-hidden="true">{initials || '–'}</span>;
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange?.(!checked)}
    />
  );
}
