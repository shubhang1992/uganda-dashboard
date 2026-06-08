// Pending-KYC panel = pending-invite manager. "Pending KYC" means the employer
// shared a sign-up link but the invitee hasn't completed registration yet
// (the only real "awaiting verification" data — members who finish signup are
// always KYC-complete). Driven by `usePendingInvites` (real, RLS-scoped) +
// `useCancelInvite`. Tabs split active vs lapsed invites; rows are multi-select
// with a bulk "Send reminder" (demo: a mock toast — no real SMS, CLAUDE.md §10a)
// and a "Copy link" that re-surfaces the real `/invite/{token}` URL to re-share.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useToast } from '../../contexts/ToastContext';
import { usePendingInvites, useCancelInvite } from '../../hooks/useEmployer';
import { formatNumber } from '../../utils/currency';
import { formatRelativeTime } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './PendingKyc.module.css';

const TABS = [
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'expired', label: 'Expired' },
];

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'this person';
const inviteName = (inv) => inv.prefill?.fullName || 'Invited member';
const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

/** Split pending invites into still-active vs lapsed (past `expiresAt`). Kept a
 *  module function so the clock read isn't an impure call inside a memo. */
function splitInvitesByExpiry(invites) {
  const now = Date.now();
  const awaiting = [];
  const expired = [];
  for (const inv of invites) {
    const exp = inv.expiresAt ? new Date(inv.expiresAt).getTime() : Infinity;
    (Number.isFinite(exp) && exp <= now ? expired : awaiting).push(inv);
  }
  return { awaiting, expired };
}

export default function PendingKyc({ splitMode = false }) {
  const { kycOpen, setKycOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();

  const { data: invites = [], isLoading, isError, error, refetch } = usePendingInvites(employerId);
  const cancelInvite = useCancelInvite(employerId);

  const [tab, setTab] = useState('awaiting');
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    if (kycOpen) return undefined;
    const t = setTimeout(() => { setSelected(new Set()); setTab('awaiting'); }, 400);
    return () => clearTimeout(t);
  }, [kycOpen]);

  // Split by expiry client-side — a pending invite past its `expiresAt` is lapsed.
  const { awaiting, expired } = useMemo(() => splitInvitesByExpiry(invites), [invites]);

  const rows = tab === 'awaiting' ? awaiting : expired;
  const selectedInTab = useMemo(() => rows.filter((i) => selected.has(i.token)), [rows, selected]);
  const allSelected = rows.length > 0 && rows.every((i) => selected.has(i.token));

  const toggle = useCallback((token) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token); else next.add(token);
      return next;
    });
  }, []);

  function switchTab(next) {
    setTab(next);
    setSelected(new Set());
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((i) => i.token)));
  }

  async function copyLink(inv) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      addToast('success', `Invite link for ${firstName(inviteName(inv))} copied — share it to remind them.`);
    } catch {
      addToast('error', 'Could not copy the link.');
    }
  }
  function sendReminder() {
    if (selectedInTab.length === 0) return;
    const n = selectedInTab.length;
    addToast('success', `Reminder sent to ${formatNumber(n)} ${n === 1 ? 'person' : 'people'} to complete sign-up.`);
    setSelected(new Set());
  }
  function cancel(inv) {
    if (cancelInvite.isPending) return;
    cancelInvite.mutate(inv.token, {
      onSuccess: () => addToast('success', `Invite for ${firstName(inviteName(inv))} cancelled.`),
      onError: (e) => addToast('error', e?.message || 'Could not cancel the invite.'),
    });
  }

  const isCold = isLoading && invites.length === 0;

  return (
    <EmployerSlidePanel
      open={kycOpen}
      onClose={() => setKycOpen(false)}
      title="Pending KYC"
      eyebrow="Awaiting sign-up"
      width={580}
      splitMode={splitMode}
    >
      <p className={styles.intro}>
        People you&apos;ve invited who haven&apos;t completed sign-up yet. Select
        anyone and send a reminder, or copy their invite link to share again.
      </p>

      {isCold ? (
        <SkeletonRow count={4} variant="compact" label="Loading pending KYC" />
      ) : isError ? (
        <ErrorCard title="We couldn't load invites" message={error} onRetry={refetch} />
      ) : invites.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="No pending invites"
          body="Everyone you've invited has completed sign-up. Invite staff from Onboard members."
        />
      ) : (
        <>
          <div className={styles.tablist} role="tablist" aria-label="Pending invites">
            {TABS.map((t) => {
              const count = t.key === 'awaiting' ? awaiting.length : expired.length;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`kyc-tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`kyc-panel-${t.key}`}
                  tabIndex={tab === t.key ? 0 : -1}
                  className={styles.tab}
                  data-active={tab === t.key || undefined}
                  onClick={() => switchTab(t.key)}
                >
                  {t.label}<span className={styles.tabCount}>{count}</span>
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`kyc-panel-${tab}`} aria-labelledby={`kyc-tab-${tab}`}>
            {rows.length === 0 ? (
              <EmptyState
                kind="no-data"
                title={tab === 'awaiting' ? 'None awaiting' : 'None expired'}
                body={tab === 'awaiting' ? 'No active pending invites right now.' : 'No invites have lapsed.'}
              />
            ) : (
              <>
                <div className={styles.listHead}>
                  <label className={styles.selectAll}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                    Select all
                  </label>
                  <span className={styles.listCount}>{formatNumber(rows.length)} {rows.length === 1 ? 'invite' : 'invites'}</span>
                </div>
                <ul className={styles.list}>
                  {rows.map((inv) => {
                    const checked = selected.has(inv.token);
                    return (
                      <li key={inv.token} className={styles.row} data-selected={checked || undefined}>
                        <input
                          type="checkbox"
                          className={styles.check}
                          checked={checked}
                          onChange={() => toggle(inv.token)}
                          aria-label={`Select ${inviteName(inv)}`}
                        />
                        <span className={styles.main}>
                          <span className={styles.name}>{inviteName(inv)}</span>
                          <span className={styles.subline}>
                            {inv.prefill?.phone || '—'}
                            {inv.createdAt ? ` · invited ${formatRelativeTime(inv.createdAt)}` : ''}
                          </span>
                        </span>
                        <button type="button" className={styles.linkBtn} onClick={() => copyLink(inv)}>Copy link</button>
                        <button type="button" className={styles.cancelBtn} onClick={() => cancel(inv)} disabled={cancelInvite.isPending}>Cancel</button>
                      </li>
                    );
                  })}
                </ul>
                {selectedInTab.length > 0 && (
                  <div className={styles.footer}>
                    <span className={styles.footerCount}>{formatNumber(selectedInTab.length)} selected</span>
                    <button type="button" className={styles.reminderBtn} onClick={sendReminder}>
                      Send reminder ({formatNumber(selectedInTab.length)})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </EmployerSlidePanel>
  );
}
