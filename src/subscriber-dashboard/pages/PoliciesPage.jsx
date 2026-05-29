import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact } from '../../utils/finance';
import { formatDate } from '../../utils/date';
import { formatMemberId } from '../../utils/memberId';
import { useCurrentSubscriber, useSubscriberNominees, useRenewPolicy } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import { openPolicyCertificate } from '../../signup/contribution/insurancePolicyCertificate';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import styles from './PoliciesPage.module.css';

// Mobile-money only, matching the Save flow.
const METHODS = [
  { id: 'mtn',    label: 'MTN MoMo',     full: 'MTN Mobile Money', helper: '+256 71 100 0001' },
  { id: 'airtel', label: 'Airtel Money', full: 'Airtel Money',     helper: '+256 70 100 0001' },
];

function methodById(id) {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}

function PolicyIcon({ type }) {
  if (type === 'health') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path d="M12 20s-7-4.35-7-9.5A3.5 3.5 0 0112 7.5 3.5 3.5 0 0119 10.5c0 5.15-7 9.5-7 9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 11.2v3.2M10.4 12.8h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusPill({ status }) {
  return (
    <span className={styles.statusPill} data-tone={status}>
      <span className={styles.statusDot} aria-hidden="true" />
      {status === 'active' ? 'Active' : 'Expired'}
    </span>
  );
}

function PolicyCard({ policy, onRenew, onCertificate }) {
  const expired = policy.status === 'expired';
  return (
    <article className={styles.policyCard} data-status={policy.status}>
      <div className={styles.policyTop}>
        <span className={styles.policyIcon} data-type={policy.type}>
          <PolicyIcon type={policy.type} />
        </span>
        <div className={styles.policyHead}>
          <h3 className={styles.policyName}>{policy.name}</h3>
          <span className={styles.policyCover}>{formatUGXExact(policy.cover)} cover</span>
        </div>
        <StatusPill status={policy.status} />
      </div>

      <dl className={styles.policyMeta}>
        <div>
          <dt>Premium</dt>
          <dd>{formatUGXExact(policy.premiumMonthly)} / mo</dd>
        </div>
        <div>
          <dt>{expired ? 'Expired' : 'Renews'}</dt>
          <dd>{formatDate(policy.renewalDate)}</dd>
        </div>
      </dl>

      {expired ? (
        <button type="button" className={styles.renewBtn} onClick={() => onRenew(policy)}>
          Renew · {formatUGXExact(policy.renewalAmount)}
        </button>
      ) : policy.type === 'life' ? (
        <button type="button" className={styles.ghostBtn} onClick={() => onCertificate(policy)}>
          Download certificate
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </article>
  );
}

export default function PoliciesPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { data: sub, isLoading } = useCurrentSubscriber();
  const { data: nominees } = useSubscriberNominees(sub?.id);
  const { addToast } = useToast();
  const renew = useRenewPolicy(sub?.id);

  const policies = sub?.policies || [];
  const active = policies.filter((p) => p.status === 'active');
  const expired = policies.filter((p) => p.status === 'expired');
  const hasAny = policies.length > 0;
  const onlyExpired = active.length === 0 && expired.length > 0;

  // Renewal sheet
  const [renewing, setRenewing] = useState(null);
  const [view, setView] = useState('confirm'); // confirm | success
  const [method, setMethod] = useState('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { reference, renewalDate }

  function openRenew(policy) {
    setRenewing(policy);
    setView('confirm');
    setMethod('mtn');
    setResult(null);
  }

  function closeSheet() {
    if (submitting) return;
    setRenewing(null);
  }

  async function handlePay() {
    if (!renewing || !sub) return;
    setSubmitting(true);
    try {
      const { reference, policy } = await renew.mutateAsync({
        type: renewing.type,
        method: methodById(method).full,
      });
      setResult({ reference, renewalDate: policy?.renewalDate });
      setView('success');
      addToast('success', `${renewing.name} renewed — ${formatUGXExact(renewing.renewalAmount)} paid.`);
    } catch (err) {
      addToast('error', err?.message || 'Could not complete the renewal.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCertificate(policy) {
    const ok = openPolicyCertificate({
      holderName: sub?.name,
      memberId: formatMemberId(sub?.phone),
      dob: sub?.dob,
      cover: policy.cover,
      premiumPerPeriod: policy.premiumMonthly,
      frequency: sub?.contributionSchedule?.frequency,
      policyStart: policy.policyStart,
      renewalDate: policy.renewalDate,
      beneficiaries: nominees?.insurance ?? [],
    });
    if (!ok) {
      addToast('error', 'Please allow pop-ups for this site, then try again to open your certificate.');
    }
  }

  const subtitle = isLoading
    ? undefined
    : hasAny
      ? `${active.length} active · ${expired.length} expired`
      : 'Protect what matters most';

  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        title="Your policies"
        eyebrow="INSURANCE"
        subtitle={subtitle}
        fallback="/dashboard"
      />

      <div className={styles.body}>
        {!isLoading && !hasAny && (
          <EmptyState
            kind="no-data"
            title="No policies yet"
            body="You don't have any insurance cover yet. Add a policy to protect your family."
            cta={{ label: 'Add policy', onClick: () => navigate('/dashboard/settings/insurance') }}
          />
        )}

        {onlyExpired && (
          <div className={styles.banner} role="status">
            <span className={styles.bannerIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
                <path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </span>
            <p>You have no active policies. Renew below to restore your cover.</p>
          </div>
        )}

        {active.length > 0 && (
          <section className={styles.section} aria-labelledby="policies-active">
            <h2 id="policies-active" className={styles.sectionTitle}>Active</h2>
            <div className={styles.cards}>
              {active.map((p) => (
                <PolicyCard key={p.id} policy={p} onRenew={openRenew} onCertificate={handleCertificate} />
              ))}
            </div>
          </section>
        )}

        {expired.length > 0 && (
          <section className={styles.section} aria-labelledby="policies-expired">
            <h2 id="policies-expired" className={styles.sectionTitle}>Expired</h2>
            <div className={styles.cards}>
              {expired.map((p) => (
                <PolicyCard key={p.id} policy={p} onRenew={openRenew} onCertificate={handleCertificate} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Renewal sheet — state-based, portaled to <body> so it layers above the
          fixed bottom tab bar (mirrors SavePage). */}
      {createPortal(
        <AnimatePresence>
          {renewing && (
            <motion.div
              className={styles.sheetScrim}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              onClick={closeSheet}
            >
              <motion.div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-label={view === 'confirm' ? `Renew ${renewing.name}` : 'Renewal complete'}
                initial={reduceMotion ? false : { y: '100%' }}
                animate={{ y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE_OUT_EXPO }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={styles.sheetGrip} aria-hidden="true" />

                {view === 'confirm' && (
                  <div className={styles.sheetBody}>
                    <span className={styles.confirmEyebrow}>You&apos;re paying to renew</span>
                    <div className={styles.confirmBig}>{formatUGXExact(renewing.renewalAmount)}</div>
                    <p className={styles.confirmSub}>
                      One year of {renewing.name.toLowerCase()} · {formatUGXExact(renewing.cover)} benefit
                    </p>

                    <ul className={styles.confirmList}>
                      <li className={styles.confirmRow}>
                        <span>Policy</span>
                        <strong>{renewing.name}</strong>
                      </li>
                      <li className={styles.confirmRow}>
                        <span>Cover</span>
                        <strong>{formatUGXExact(renewing.cover)}</strong>
                      </li>
                      <li className={styles.confirmRow}>
                        <span>Premium</span>
                        <strong>{formatUGXExact(renewing.premiumMonthly)} / mo</strong>
                      </li>
                    </ul>

                    <div className={styles.methodBlock}>
                      <span className={styles.methodLabel}>Pay with</span>
                      <PillChipGroup label="Payment method" layout="row">
                        {METHODS.map((m) => (
                          <PillChip key={m.id} selected={method === m.id} onClick={() => setMethod(m.id)}>
                            {m.label}
                          </PillChip>
                        ))}
                      </PillChipGroup>
                      <p className={styles.methodHelper}>{methodById(method).helper}</p>
                    </div>

                    <p className={styles.confirmNote}>
                      You&apos;ll receive an SMS prompt to authorise the payment on your mobile money account.
                    </p>

                    <div className={styles.sheetActions}>
                      <button type="button" className={styles.secondaryBtn} onClick={closeSheet} disabled={submitting}>
                        Cancel
                      </button>
                      <button type="button" className={styles.primaryBtn} onClick={handlePay} disabled={submitting}>
                        {submitting ? 'Processing…' : `Pay ${formatUGXExact(renewing.renewalAmount)}`}
                      </button>
                    </div>
                  </div>
                )}

                {view === 'success' && (
                  <div className={styles.sheetBody} data-center="true">
                    <div className={styles.successCheck} aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                        <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className={styles.successTitle}>Policy renewed</h2>
                    <p className={styles.successSubtitle}>
                      {renewing.name} is active again.
                      {result?.renewalDate ? ` Renews ${formatDate(result.renewalDate)}.` : ''}
                    </p>
                    {result?.reference && (
                      <div className={styles.successRef}>
                        Reference <strong>{result.reference}</strong>
                      </div>
                    )}
                    <button type="button" className={styles.primaryBtn} onClick={closeSheet}>
                      Done
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
