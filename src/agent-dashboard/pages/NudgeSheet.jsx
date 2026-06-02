import { useState } from 'react';
import { useSendAgentNudge } from '../../hooks/useTickets';
import { toCanonicalUGPhone } from '../../utils/phone';
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

/**
 * NudgeSheet — editable reminder composer for the "Yet to contribute" drill-down.
 * Single recipient → WhatsApp / SMS deep links + in-app Platform message. Bulk
 * (more than one) → Platform message only (OS deep links are single-recipient).
 *
 * Mount with a `key` derived from the recipient ids so each open starts with a
 * fresh draft + status (the parent controls this).
 */
export default function NudgeSheet({ open, onClose, recipients = [], agentId }) {
  const [message, setMessage] = useState(() => defaultMessage(recipients));
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const nudge = useSendAgentNudge(agentId);

  const isBulk = recipients.length > 1;
  const single = recipients.length === 1 ? recipients[0] : null;
  const canDeepLink = !!single && !!toCanonicalUGPhone(single.phone);
  const trimmed = message.trim();

  async function sendPlatform() {
    if (!trimmed) return;
    setStatus('sending');
    try {
      // Sequential on purpose — demo volumes are tiny and it keeps the in-memory
      // ticket store writes deterministic.
      for (const r of recipients) {
        await nudge.mutateAsync({ subscriberId: r.id, body: trimmed });
      }
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  const title = isBulk
    ? `Nudge ${recipients.length} subscribers`
    : `Nudge ${single?.name ?? 'subscriber'}`;

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {status === 'sent' ? (
        <div className={styles.body}>
          <p className={styles.sent}>
            ✓ Reminder sent{isBulk ? ` to ${recipients.length} subscribers` : ''} via platform message.
          </p>
          <button type="button" className={styles.done} onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className={styles.body}>
          <label className={styles.label} htmlFor="nudge-msg">Reminder message</label>
          <textarea
            id="nudge-msg"
            className={styles.textarea}
            rows={5}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setStatus(null); }}
            placeholder="Write a short reminder…"
          />

          <div className={styles.channels}>
            {canDeepLink && (
              <a
                className={`${styles.channel} ${styles.whatsapp}`}
                href={waLink(single.phone, trimmed)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                aria-disabled={!trimmed}
              >
                WhatsApp
              </a>
            )}
            {canDeepLink && (
              <a
                className={`${styles.channel} ${styles.sms}`}
                href={smsLink(single.phone, trimmed)}
                onClick={onClose}
                aria-disabled={!trimmed}
              >
                Text / SMS
              </a>
            )}
            <button
              type="button"
              className={`${styles.channel} ${styles.platform}`}
              onClick={sendPlatform}
              disabled={status === 'sending' || !trimmed}
            >
              {status === 'sending' ? 'Sending…' : 'Platform message'}
            </button>
          </div>

          {isBulk && (
            <p className={styles.note}>
              WhatsApp and SMS open one chat at a time — use them from a single subscriber.
              Platform message reaches all {recipients.length} selected at once.
            </p>
          )}
          {!isBulk && !canDeepLink && (
            <p className={styles.note}>No phone on file — send an in-app platform message instead.</p>
          )}
          {status === 'error' && (
            <p className={styles.error}>Couldn&apos;t send the platform message. Please try again.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
