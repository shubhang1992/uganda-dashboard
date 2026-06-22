import styles from './AgentMobileHero.module.css';

/**
 * AgentMobileHero — the light, centred hero card that de-domed agent mobile pages
 * lead with, replacing the old indigo `PageHeader variant="hero"` dome (the
 * persistent app bar now owns the title/back/actions). Eyebrow label, a big
 * indigo value, and an optional sub line / stat row (passed as children).
 */
export default function AgentMobileHero({ eyebrow, value, children, className = '' }) {
  return (
    <section className={`${styles.hero} ${className}`}>
      {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
      {value != null && <div className={styles.value}>{value}</div>}
      {children && <div className={styles.sub}>{children}</div>}
    </section>
  );
}
