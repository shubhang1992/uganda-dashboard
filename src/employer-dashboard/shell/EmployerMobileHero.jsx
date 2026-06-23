import styles from './EmployerMobileHero.module.css';

/**
 * EmployerMobileHero — the light, centred hero card the employer mobile pages
 * lead with (the persistent app bar owns the title/back/actions). Eyebrow label,
 * a big indigo value, and an optional sub line / stat row (passed as children).
 * Clone of AgentMobileHero so the employer mobile pages match the agent/subscriber
 * design language.
 */
export default function EmployerMobileHero({ eyebrow, value, children, className = '' }) {
  return (
    <section className={`${styles.hero} ${className}`}>
      {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
      {value != null && <div className={styles.value}>{value}</div>}
      {children && <div className={styles.sub}>{children}</div>}
    </section>
  );
}
