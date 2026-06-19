import { useId, useState } from 'react';
import { useSendAgentNudge } from '../../hooks/useTickets';
import { toCanonicalUGPhone, formatUGPhone } from '../../utils/phone';
import Modal from '../../components/Modal';
import styles from './NudgeSheet.module.css';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

function defaultMessage(recipients) {
  const lead = recipients.length === 1 ? `Hi ${firstName(recipients[0].name)}, ` : 'Hi, ';
  return `${lead}friendly reminder to make your pension contribution this month. Every contribution grows your future savings — reach out if you need any help. Thank you!`;
}

function waLink(phone, message) {
  const digits = toCanonicalUGPhone(phone).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
function smsLink(phone, message) {
  return `sms:${toCanonicalUGPhone(phone)}?body=${encodeURIComponent(message)}`;
}
function telLink(phone) {
  return `tel:${toCanonicalUGPhone(phone)}`;
}
function mailLink(email, message) {
  const subject = 'A message from your Universal Pensions agent';
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

// ── Channel glyphs (stroke, 20px grid) ──────────────────────────────────────
const WhatsAppIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M10 3a7 7 0 00-6 10.6L3 17l3.5-1A7 7 0 1010 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.6 7.4c.2-.5.4-.5.7-.5l.5.0c.2 0 .4.0.5.5l.5 1.2c.1.2 0 .4-.1.5l-.4.4c-.1.1-.1.3 0 .4a4 4 0 002 2c.1.1.3.1.4 0l.4-.5c.1-.1.3-.2.5-.1l1.2.5c.2.1.3.2.3.4 0 .8-.6 1.4-1.3 1.4A6 6 0 016 9.2c0-.7.5-1.5 1.6-1.8z" fill="currentColor" />
  </svg>
);
const SmsIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M4 4h12a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0116 13H8.5L5 16v-3H4a1.5 1.5 0 01-1.5-1.5v-6A1.5 1.5 0 014 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M6.5 8h7M6.5 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const CallIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M5.5 3h2l1 3-1.6 1.2a9 9 0 004.9 4.9L17 11l-.6 2v2c0 .8-.7 1.5-1.5 1.4A12.5 12.5 0 013.6 5C3.5 4.2 4.2 3.5 5 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
const EmailIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="14" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3.5 6l6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SendIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M3 10l14-6-5 14-2.8-5.6L3 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
const CloseIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * NudgeSheet — a contact/message composer for a subscriber (or a bulk set).
 * Single recipient → WhatsApp / SMS / Call / Email deep links (when phone/email
 * are on file) + an in-app Platform message. Bulk (more than one) → Platform
 * message only (OS deep links are single-recipient).
 *
 * Mount with a `key` derived from the recipient ids so each open starts fresh.
 * `composeDefault(recipients) => string` overrides the starting draft. Optional
 * `title` / `composeLabel` / `sentNoun` override the copy (default = the
 * contribution-reminder "Nudge" wording used by the drill-down callers).
 */
export default function NudgeSheet({
  open,
  onClose,
  recipients = [],
  agentId,
  composeDefault = defaultMessage,
  title: titleProp,
  composeLabel = 'Reminder message',
  sentNoun = 'Reminder',
}) {
  const headingId = useId();
  const [message, setMessage] = useState(() => composeDefault(recipients));
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const nudge = useSendAgentNudge(agentId);

  const isBulk = recipients.length > 1;
  const single = recipients.length === 1 ? recipients[0] : null;
  const phoneOk = !!single && !!toCanonicalUGPhone(single.phone);
  const emailOk = !!single && !!single.email;
  const trimmed = message.trim();

  async function sendPlatform() {
    if (!trimmed) return;
    setStatus('sending');
    try {
      for (const r of recipients) {
        await nudge.mutateAsync({ subscriberId: r.id, body: trimmed });
      }
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  const title = titleProp ?? (isBulk
    ? `Nudge ${recipients.length} subscribers`
    : `Nudge ${single?.name ?? 'subscriber'}`);
  const contactLine = single
    ? [phoneOk && formatUGPhone(single.phone), single.email].filter(Boolean).join('  ·  ')
    : null;

  return (
    <Modal open={open} onClose={onClose} labelledBy={headingId} size="sm">
      <div className={styles.body}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id={headingId} className={styles.heading}>{title}</h2>
            {contactLine && <p className={styles.sub}>{contactLine}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            {CloseIcon}
          </button>
        </header>

        {status === 'sent' ? (
          <div className={styles.sentWrap}>
            <p className={styles.sent}>
              ✓ {sentNoun} sent{isBulk ? ` to ${recipients.length} subscribers` : ''} via platform message.
            </p>
            <button type="button" className={styles.done} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="nudge-msg">{composeLabel}</label>
              <textarea
                id="nudge-msg"
                className={styles.textarea}
                rows={4}
                value={message}
                onChange={(e) => { setMessage(e.target.value); setStatus(null); }}
                placeholder="Write a short message…"
              />
            </div>

            {single && (phoneOk || emailOk) && (
              <div className={styles.channels}>
                {phoneOk && (
                  <a
                    className={styles.channel}
                    href={waLink(single.phone, trimmed)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    aria-disabled={!trimmed}
                  >
                    <span className={`${styles.cIcon} ${styles.waIcon}`}>{WhatsAppIcon}</span>
                    WhatsApp
                  </a>
                )}
                {phoneOk && (
                  <a
                    className={styles.channel}
                    href={smsLink(single.phone, trimmed)}
                    onClick={onClose}
                    aria-disabled={!trimmed}
                  >
                    <span className={styles.cIcon}>{SmsIcon}</span>
                    Text / SMS
                  </a>
                )}
                {phoneOk && (
                  <a className={styles.channel} href={telLink(single.phone)} onClick={onClose}>
                    <span className={styles.cIcon}>{CallIcon}</span>
                    Call
                  </a>
                )}
                {emailOk && (
                  <a
                    className={styles.channel}
                    href={mailLink(single.email, trimmed)}
                    onClick={onClose}
                    aria-disabled={!trimmed}
                  >
                    <span className={styles.cIcon}>{EmailIcon}</span>
                    Email
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              className={styles.platform}
              onClick={sendPlatform}
              disabled={status === 'sending' || !trimmed}
            >
              <span className={styles.cIcon}>{SendIcon}</span>
              {status === 'sending' ? 'Sending…' : 'Send platform message'}
            </button>

            {isBulk && (
              <p className={styles.note}>
                WhatsApp, SMS, call and email reach one subscriber at a time. The platform
                message reaches all {recipients.length} selected at once.
              </p>
            )}
            {single && !phoneOk && !emailOk && (
              <p className={styles.note}>No phone or email on file — send an in-app platform message instead.</p>
            )}
            {status === 'error' && (
              <p className={styles.error}>Couldn&apos;t send the platform message. Please try again.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
