import { useState } from 'react';
import { useSendMessage } from '../../hooks/useTickets';
import { SENDER_ROLE } from '../../data/ticketsSeed';
import styles from '../pages/InboxPage.module.css';

const BODY_MAX = 1000;

// ─── Agent reply composer ────────────────────────────────────────────────────
// There is no Phase 0 composer primitive — each interactive role builds its own
// small textarea + Send pair and hands it to ThreadView's footer. Send wires to
// useSendMessage({ sender: 'agent', body }); a closed ticket disables the input
// (the agent reopens first via the header action).
export function ReplyComposer({ ticketId, disabled }) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(ticketId);
  const trimmed = body.trim();
  const canSend = !disabled && !sendMessage.isPending && trimmed !== '';

  // Clear the draft when switching threads so one ticket's reply never bleeds
  // into another. Reset during render on the ticketId change (React's
  // "you might not need an effect" pattern, as used in RaiseIssueSheet) rather
  // than in an effect, which avoids the extra commit + a cascading-render lint.
  const [lastTicketId, setLastTicketId] = useState(ticketId);
  if (ticketId !== lastTicketId) {
    setLastTicketId(ticketId);
    setBody('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    try {
      await sendMessage.mutateAsync({ sender: SENDER_ROLE.AGENT, body: trimmed });
      setBody('');
    } catch {
      // Optimistic update rolled back by the hook; keep the draft so the agent
      // can retry without retyping.
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.composerInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disabled ? 'Reopen this ticket to reply' : 'Type a reply to your subscriber…'}
        rows={1}
        maxLength={BODY_MAX}
        disabled={disabled || sendMessage.isPending}
        aria-label="Reply to subscriber"
      />
      <button type="submit" className={styles.composerSend} disabled={!canSend} aria-label="Send reply">
        {sendMessage.isPending ? (
          <span className={styles.composerSpinner} aria-hidden="true" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M4 12l15-7-5 15-3.5-5.5L4 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </form>
  );
}
