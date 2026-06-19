import { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal';
import { getInitials } from '../../utils/dashboard';
import { toCanonicalUGPhone, formatUGPhone } from '../../utils/phone';
import { checkInMessage } from './subscriber/messageDrafts';
import styles from './MessageLauncher.module.css';

function waLink(phone, message) {
  const digits = toCanonicalUGPhone(phone).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
function smsLink(phone, message) {
  return `sms:${toCanonicalUGPhone(phone)}?body=${encodeURIComponent(message)}`;
}

// ── Channel glyphs (18px, stroke on a 20px grid) ────────────────────────────
const WhatsAppIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M10 3a7 7 0 00-6 10.6L3 17l3.5-1A7 7 0 1010 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.6 7.4c.2-.5.4-.5.7-.5l.5.0c.2 0 .4.0.5.5l.5 1.2c.1.2 0 .4-.1.5l-.4.4c-.1.1-.1.3 0 .4a4 4 0 002 2c.1.1.3.1.4 0l.4-.5c.1-.1.3-.2.5-.1l1.2.5c.2.1.3.2.3.4 0 .8-.6 1.4-1.3 1.4A6 6 0 016 9.2c0-.7.5-1.5 1.6-1.8z" fill="currentColor" />
  </svg>
);
const SmsIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M4 4h12a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0116 13H8.5L5 16v-3H4a1.5 1.5 0 01-1.5-1.5v-6A1.5 1.5 0 014 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M6.5 8h7M6.5 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const PlatformIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M4 5.5A1.5 1.5 0 015.5 4h9A1.5 1.5 0 0116 5.5v6A1.5 1.5 0 0114.5 13H8l-3.5 3v-3H5.5A1.5 1.5 0 014 11.5v-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 7.5h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const ChevronIcon = (
  <svg viewBox="0 0 12 12" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CloseIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * MessageLauncher — a small channel picker for "Message <subscriber>" on the
 * subscriber profile. Three ways to reach them:
 *   • WhatsApp / Text   → hand off to the phone's WhatsApp / Messages app via
 *     deep links (phone-gated; a friendly check-in draft is prefilled).
 *   • Platform chat      → deep-link into the agent inbox with this subscriber's
 *     conversation already open (?subscriberId=…&open=1). The inbox opens their
 *     most recent thread, or a fresh-conversation composer if they have none.
 *
 * No inline composing here — the platform conversation is composed in the inbox
 * thread window; WhatsApp / Text are composed in their own apps.
 */
export default function MessageLauncher({ open, onClose, subscriber }) {
  const navigate = useNavigate();
  const headingId = useId();

  const phone = subscriber?.phone;
  const phoneOk = !!toCanonicalUGPhone(phone);
  const draft = checkInMessage([subscriber]);
  const first = (subscriber?.name || 'them').trim().split(/\s+/)[0] || 'them';

  function goPlatform() {
    onClose?.();
    navigate(`/dashboard/inbox?subscriberId=${subscriber.id}&open=1`);
  }

  const options = [
    {
      key: 'whatsapp',
      enabled: phoneOk,
      href: phoneOk ? waLink(phone, draft) : undefined,
      external: true,
      icon: WhatsAppIcon,
      iconClass: styles.waIcon,
      title: 'WhatsApp',
      sub: phoneOk ? 'Opens WhatsApp on your phone' : 'No phone number on file',
    },
    {
      key: 'sms',
      enabled: phoneOk,
      href: phoneOk ? smsLink(phone, draft) : undefined,
      icon: SmsIcon,
      iconClass: styles.smsIcon,
      title: 'Text message',
      sub: phoneOk ? 'Opens your Messages app' : 'No phone number on file',
    },
    {
      key: 'platform',
      enabled: true,
      onClick: goPlatform,
      icon: PlatformIcon,
      iconClass: styles.platformIcon,
      title: 'Platform chat',
      sub: 'Open the in-app conversation',
    },
  ];

  return (
    <Modal open={open} onClose={onClose} labelledBy={headingId} size="sm">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <span className={styles.avatar} data-gender={subscriber?.gender} aria-hidden="true">
            {getInitials(subscriber?.name || '')}
          </span>
          <div className={styles.headText}>
            <h2 id={headingId} className={styles.name}>{subscriber?.name}</h2>
            {phoneOk && <p className={styles.phone}>{formatUGPhone(phone)}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            {CloseIcon}
          </button>
        </header>

        <p className={styles.caption}>How would you like to reach {first}?</p>

        <div className={styles.options}>
          {options.map((opt) => {
            const inner = (
              <>
                <span className={`${styles.optIcon} ${opt.iconClass}`} aria-hidden="true">{opt.icon}</span>
                <span className={styles.optText}>
                  <span className={styles.optTitle}>{opt.title}</span>
                  <span className={styles.optSub}>{opt.sub}</span>
                </span>
                {opt.enabled && <span className={styles.chev} aria-hidden="true">{ChevronIcon}</span>}
              </>
            );
            if (!opt.enabled) {
              return (
                <button key={opt.key} type="button" className={styles.option} disabled>
                  {inner}
                </button>
              );
            }
            if (opt.href) {
              return (
                <a
                  key={opt.key}
                  className={styles.option}
                  href={opt.href}
                  onClick={onClose}
                  {...(opt.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {inner}
                </a>
              );
            }
            return (
              <button key={opt.key} type="button" className={styles.option} onClick={opt.onClick}>
                {inner}
              </button>
            );
          })}
        </div>

        {!phoneOk && (
          <p className={styles.note}>
            No phone number on file — reach {first} through the in-app platform chat.
          </p>
        )}
      </div>
    </Modal>
  );
}
