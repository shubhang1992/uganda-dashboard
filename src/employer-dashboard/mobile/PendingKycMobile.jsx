import { useState } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { usePendingInvites, useCancelInvite } from '../../hooks/useEmployer';
import { formatNumber } from '../../utils/currency';
import { formatRelativeTime } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import s from './employerMobile.module.css';

const inviteName = (inv) => inv.prefill?.fullName || 'Invited member';
const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || 'this person';
const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

function initials(name) {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

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

const SendIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
const CopyIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
  </svg>
);

/**
 * PendingKycMobile — pending-invite manager on the phone. Fresh body against
 * usePendingInvites + useCancelInvite (the PendingKyc panel couples its list to
 * EmployerSlidePanel chrome). Awaiting/Expired tabs, copy-link + cancel per
 * invite, and a bulk "Send reminder" (mock toast — demo scope).
 */
export default function PendingKycMobile() {
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();
  const { data: invites = [], isLoading, isError, error, refetch } = usePendingInvites(employerId);
  const cancelInvite = useCancelInvite(employerId);
  const [tab, setTab] = useState('awaiting');

  const { awaiting, expired } = splitInvitesByExpiry(invites);
  const rows = tab === 'awaiting' ? awaiting : expired;
  const isCold = isLoading && invites.length === 0;

  async function copyLink(inv) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      addToast('success', `Invite link for ${firstNameOf(inviteName(inv))} copied — share it to remind them.`);
    } catch {
      addToast('error', 'Could not copy the link.');
    }
  }
  function cancel(inv) {
    if (cancelInvite.isPending) return;
    cancelInvite.mutate(inv.token, {
      onSuccess: () => addToast('success', `Invite for ${firstNameOf(inviteName(inv))} cancelled.`),
      onError: (e) => addToast('error', e?.message || 'Could not cancel the invite.'),
    });
  }
  function remindAll() {
    if (rows.length === 0) return;
    addToast('success', `Reminder sent to ${formatNumber(rows.length)} ${rows.length === 1 ? 'person' : 'people'} to complete sign-up.`);
  }

  return (
    <div className={s.page}>
      <p className={s.intro}>
        People you&apos;ve invited who haven&apos;t completed sign-up yet. Copy a link to share again, or send a reminder.
      </p>

      {isCold ? (
        <SkeletonRow count={4} variant="compact" label="Loading pending KYC" />
      ) : isError ? (
        <ErrorCard title="We couldn't load invites" message={error} onRetry={refetch} />
      ) : invites.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="No pending invites"
          body="Everyone you've invited has completed sign-up. Invite staff from the Staff tab."
        />
      ) : (
        <>
          <div className={s.seg} role="tablist" aria-label="Pending invites">
            <button type="button" role="tab" aria-selected={tab === 'awaiting'} className={s.segBtn} data-active={tab === 'awaiting' || undefined} onClick={() => setTab('awaiting')}>
              Awaiting · {formatNumber(awaiting.length)}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'expired'} className={s.segBtn} data-active={tab === 'expired' || undefined} onClick={() => setTab('expired')}>
              Expired · {formatNumber(expired.length)}
            </button>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              kind="no-data"
              title={tab === 'awaiting' ? 'None awaiting' : 'None expired'}
              body={tab === 'awaiting' ? 'No active pending invites right now.' : 'No invites have lapsed.'}
            />
          ) : (
            <div className={s.card} style={{ paddingTop: 6, paddingBottom: 6 }}>
              {rows.map((inv) => (
                <div key={inv.token}>
                  <div className={`${s.lrow} ${s.lrowStatic}`}>
                    <span className={s.av}>{initials(inviteName(inv))}</span>
                    <span className={s.lMid}>
                      <b>{inviteName(inv)}</b>
                      <small>{inv.prefill?.phone || '—'}{inv.createdAt ? ` · invited ${formatRelativeTime(inv.createdAt)}` : ''}</small>
                    </span>
                  </div>
                  <div className={s.btnRow} style={{ padding: '0 0 12px' }}>
                    <button type="button" className={`${s.btn} ${s.btnSec}`} style={{ padding: 9 }} onClick={() => copyLink(inv)}>
                      {CopyIcon}Copy link
                    </button>
                    <button type="button" className={s.btn} style={{ padding: 9, color: 'var(--color-status-poor)', background: 'none', border: 'none' }} onClick={() => cancel(inv)} disabled={cancelInvite.isPending}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && tab === 'awaiting' && (
            <button type="button" className={`${s.btn} ${s.btnPri} ${s.btnBlock}`} onClick={remindAll}>
              {SendIcon}Send reminder to all ({formatNumber(rows.length)})
            </button>
          )}
        </>
      )}
    </div>
  );
}
