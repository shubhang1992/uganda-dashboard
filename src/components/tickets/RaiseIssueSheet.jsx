// RaiseIssueSheet — Phase 0 of the subscriber support inbox.
//
// The subscriber-facing "Raise an issue" composer. Rendered as a portaled
// bottom-sheet dialog via the shared <Modal> primitive (focus trap, scroll
// lock, ESC + backdrop dismissal all live there). The sheet only captures the
// new ticket fields and hands them off through `onSubmit`; the parent owns the
// service call, optimistic insert, and closing the sheet on success.
//
// Field vocabulary comes straight from the frozen ticketing contract in
// `ticketsSeed.js` — TICKET_CATEGORY / TICKET_PRIORITY are contract constants
// (Object.freeze'd enums), not mock data, so importing them here is allowed and
// keeps the category/priority values in lockstep with the seed and services.

import { useState } from 'react';
import Modal from '../Modal';
import { PillChip, PillChipGroup } from '../PillChip';
import { TICKET_CATEGORY, TICKET_PRIORITY } from '../../data/ticketsSeed';
import styles from './RaiseIssueSheet.module.css';

// Title-Case display labels for each contract category value. Keyed by the
// enum value (not the key) so the labels stay correct even if the enum keys are
// ever renamed — the values are the frozen part of the contract.
const CATEGORY_LABELS = {
  [TICKET_CATEGORY.CONTRIBUTIONS]: 'Contributions',
  [TICKET_CATEGORY.WITHDRAWALS]: 'Withdrawals',
  [TICKET_CATEGORY.CLAIMS]: 'Claims',
  [TICKET_CATEGORY.NOMINEES]: 'Nominees',
  [TICKET_CATEGORY.SCHEDULE]: 'Schedule',
  [TICKET_CATEGORY.ACCOUNT]: 'Account',
  [TICKET_CATEGORY.OTHER]: 'Other',
};

// Render order for the category chips — explicit so the grid layout stays
// stable rather than depending on object key iteration order.
const CATEGORY_ORDER = [
  TICKET_CATEGORY.CONTRIBUTIONS,
  TICKET_CATEGORY.WITHDRAWALS,
  TICKET_CATEGORY.CLAIMS,
  TICKET_CATEGORY.NOMINEES,
  TICKET_CATEGORY.SCHEDULE,
  TICKET_CATEGORY.ACCOUNT,
  TICKET_CATEGORY.OTHER,
];

const SUBJECT_MAX = 120;
const BODY_MAX = 1000;

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {() => void} props.onClose
 * @param {(payload: { subject: string, category: string, priority: string, body: string }) => Promise<unknown>} props.onSubmit
 *   Resolves once the ticket is created; the parent closes the sheet on success.
 * @param {boolean}  [props.submitting] — true while the parent's create call is in flight.
 */
export default function RaiseIssueSheet({ open, onClose, onSubmit, submitting = false }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(TICKET_CATEGORY.OTHER);
  const [priority, setPriority] = useState(TICKET_PRIORITY.NORMAL);
  const [body, setBody] = useState('');

  // Reset local state every time the sheet (re)opens so a previously abandoned
  // draft never bleeds into a fresh issue. Defaults: category 'other', priority
  // 'normal'. We track the previous `open` value and reset *during render* on
  // the false→true edge — React's recommended "reset state when a prop changes"
  // pattern (https://react.dev/learn/you-might-not-need-an-effect), which avoids
  // the extra commit + flicker an effect would introduce.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSubject('');
      setCategory(TICKET_CATEGORY.OTHER);
      setPriority(TICKET_PRIORITY.NORMAL);
      setBody('');
    }
  }

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canSubmit = !submitting && trimmedSubject !== '' && trimmedBody !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await onSubmit({
        subject: trimmedSubject,
        category,
        priority,
        body: trimmedBody,
      });
      // Parent closes on success, but call onClose defensively in case it
      // relies on the child to dismiss after a resolved submit.
      onClose?.();
    } catch {
      // Leave the sheet open with the draft intact so the subscriber can retry.
      // The parent surfaces the failure (toast / inline error) from its own
      // mutation handler — the composer just keeps the user's text.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose?.();
      }}
      title="Raise an issue"
      size="md"
      dismissOnBackdrop={!submitting}
    >
      <form className={styles.sheet} onSubmit={handleSubmit}>
        <div className={styles.header}>
          <div className={styles.title}>Raise an issue</div>
          <div className={styles.subtitle}>
            Send a message to your agent. We&rsquo;ll reply right here in your inbox.
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="raise-issue-subject">
              Subject
            </label>
            <input
              id="raise-issue-subject"
              type="text"
              className={styles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. When can I withdraw my savings?"
              maxLength={SUBJECT_MAX}
              autoComplete="off"
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="raise-issue-category-label">
              Category
            </span>
            <PillChipGroup label="Category" layout="grid" columns={2}>
              {CATEGORY_ORDER.map((value) => (
                <PillChip
                  key={value}
                  selected={category === value}
                  onClick={() => setCategory(value)}
                  disabled={submitting}
                >
                  {CATEGORY_LABELS[value]}
                </PillChip>
              ))}
            </PillChipGroup>
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="raise-issue-priority-label">
              Priority
            </span>
            <PillChipGroup label="Priority" layout="row">
              <PillChip
                selected={priority === TICKET_PRIORITY.NORMAL}
                onClick={() => setPriority(TICKET_PRIORITY.NORMAL)}
                disabled={submitting}
              >
                Normal
              </PillChip>
              <PillChip
                selected={priority === TICKET_PRIORITY.URGENT}
                onClick={() => setPriority(TICKET_PRIORITY.URGENT)}
                disabled={submitting}
              >
                Urgent
              </PillChip>
            </PillChipGroup>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="raise-issue-body">
              How can we help?
            </label>
            <textarea
              id="raise-issue-body"
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your issue in a little detail so your agent can help faster."
              rows={4}
              maxLength={BODY_MAX}
              disabled={submitting}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => onClose?.()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
            {submitting ? 'Sending…' : 'Send to my agent'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
