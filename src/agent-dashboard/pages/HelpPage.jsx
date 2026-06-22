import { SUPPORT_WHATSAPP_URL, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_EMAIL } from '../../config/env';
import { useAgentAppBar } from '../shell/agentAppBarContext';
import styles from './HelpPage.module.css';

const PhoneIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const WhatsAppIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M3 21l1.6-4A8 8 0 1 1 12 20a8 8 0 0 1-4-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const SparkIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.5 5L19 8.5 13.5 10 12 15l-1.5-5L5 8.5 10.5 7z" />
  </svg>
);
const MailIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 7l8 5 8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FAQS = [
  'How do commissions get paid out?',
  'How do I onboard a member offline?',
  'Helping a member withdraw or claim',
  'What makes a subscriber "dormant"?',
];

/**
 * HelpPage — the agent support page, reached from the Profile hub. Lead contact
 * channels (call / WhatsApp / Ask Co-Pilot / email) plus a short FAQ. The persistent
 * app bar provides the "Help" title + back arrow, so the page is just flat cards.
 */
export default function HelpPage() {
  const { openAskAI } = useAgentAppBar();

  return (
    <div className={styles.page}>
      <section className={`${styles.card} ${styles.cardGrad}`}>
        <div className={styles.heroEye}>We&apos;re here for you</div>
        <div className={styles.heroTitle}>How can we help?</div>
        <div className={styles.heroSub}>Reach the support team or ask Co-Pilot anything.</div>
      </section>

      <section className={`${styles.card} ${styles.contactCard}`}>
        <a className={styles.row} href="tel:0800100200">
          <span className={styles.rowIc}>{PhoneIcon}</span>
          <span className={styles.rowText}>
            <b>Call support</b>
            <small>0800-100-200 · toll free</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </a>
        <a className={styles.row} href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
          <span className={`${styles.rowIc} ${styles.green}`}>{WhatsAppIcon}</span>
          <span className={styles.rowText}>
            <b>WhatsApp the team</b>
            <small>{SUPPORT_WHATSAPP_DISPLAY}</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </a>
        <button type="button" className={styles.row} onClick={() => openAskAI()}>
          <span className={styles.rowIc}>{SparkIcon}</span>
          <span className={styles.rowText}>
            <b>Ask Co-Pilot</b>
            <small>Instant answers about your book</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </button>
        <a className={styles.row} href={`mailto:${SUPPORT_EMAIL}`}>
          <span className={styles.rowIc}>{MailIcon}</span>
          <span className={styles.rowText}>
            <b>Email us</b>
            <small>{SUPPORT_EMAIL}</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </a>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHd}>Popular topics</div>
        {FAQS.map((q) => (
          <button type="button" key={q} className={styles.faq}>
            {q}
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </section>
    </div>
  );
}
