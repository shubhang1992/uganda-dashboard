import { useState } from 'react';
import { useSendAgentNudge } from '../../hooks/useTickets';
import { TICKET_CATEGORY, TICKET_STATUS } from '../../data/ticketsSeed';
import ThreadView from '../../components/tickets/ThreadView';
import styles from '../pages/InboxPage.module.css';

const SendIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <path d="M4 12l15-7-5 15-3.5-5.5L4 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── New-conversation surface ────────────────────────────────────────────────
// Opened when the agent picks "Platform chat" for a subscriber who has no
// existing thread. Renders the shared ThreadView with an empty log + a composer;
// the first send mints a real ticket via the same agent-nudge path the
// drill-down reminders use, then hands its id back so the inbox swaps to the
// live ThreadPanel for that ticket. A light header stub gives the empty thread a
// real subject/title (no badge drift — status is "open", which the created
// ticket also is).
const TICKET_STUB = { subject: 'Direct message', status: TICKET_STATUS.OPEN };

export function NewConversationPanel({ agentId, subscriberId, participantLabel, onBack, onCreated }) {
  const [body, setBody] = useState('');
  const nudge = useSendAgentNudge(agentId);
  const trimmed = body.trim();
  const canSend = !nudge.isPending && trimmed !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    try {
      const created = await nudge.mutateAsync({
        subscriberId,
        body: trimmed,
        subject: TICKET_STUB.subject,
        category: TICKET_CATEGORY.OTHER,
      });
      setBody('');
      onCreated?.(created.id);
    } catch {
      // Mutation failed — keep the draft so the agent can retry without retyping.
    }
  }

  const composer = (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.composerInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Write your first message to ${participantLabel}…`}
        rows={1}
        maxLength={1000}
        disabled={nudge.isPending}
        aria-label="New message"
      />
      <button type="submit" className={styles.composerSend} disabled={!canSend} aria-label="Send message">
        {nudge.isPending ? <span className={styles.composerSpinner} aria-hidden="true" /> : SendIcon}
      </button>
    </form>
  );

  return (
    <div className={styles.threadWrap}>
      <ThreadView
        ticket={TICKET_STUB}
        messages={[]}
        currentRole="agent"
        participantLabel={participantLabel}
        onBack={onBack}
        loading={false}
        footer={composer}
      />
    </div>
  );
}
