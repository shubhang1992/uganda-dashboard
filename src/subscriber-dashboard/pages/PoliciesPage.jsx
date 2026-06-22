import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../utils/currency';

import { formatDate } from '../../utils/date';
import { formatMemberId } from '../../utils/memberId';
import { useCurrentSubscriber, useSubscriberNominees, useRenewPolicy } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import { openPolicyCertificate } from '../../signup/contribution/insurancePolicyCertificate';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import PaySheet from '../../components/PaySheet';
import styles from './PoliciesPage.module.css';

function PolicyIcon({ type }) {
  if (type === 'health') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path d="M12 20s-7-4.35-7-9.5A3.5 3.5 0 0112 7.5 3.5 3.5 0 0119 10.5c0 5.15-7 9.5-7 9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 11.2v3.2M10.4 12.8h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'funeral') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="12" cy="7" rx="2.4" ry="3.2" />
        <ellipse cx="12" cy="17" rx="2.4" ry="3.2" />
        <ellipse cx="7" cy="12" rx="3.2" ry="2.4" />
        <ellipse cx="17" cy="12" rx="3.2" ry="2.4" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
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
          <span className={styles.policyCover}>{formatUGX(policy.cover, { compact: false })} cover</span>
        </div>
        <StatusPill status={policy.status} />
      </div>

      <dl className={styles.policyMeta}>
        <div>
          <dt>Premium</dt>
          <dd>{formatUGX(policy.premiumMonthly, { compact: false })} / mo</dd>
        </div>
        <div>
          <dt>{expired ? 'Expired' : 'Renews'}</dt>
          <dd>{formatDate(policy.renewalDate)}</dd>
        </div>
      </dl>

      {expired ? (
        <button type="button" className={styles.renewBtn} onClick={() => onRenew(policy)}>
          Renew · {formatUGX(policy.renewalAmount, { compact: false })}
        </button>
      ) : (
        <button type="button" className={styles.ghostBtn} onClick={() => onCertificate(policy)}>
          Download certificate
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </article>
  );
}

export default function PoliciesPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { data: sub, isLoading } = useCurrentSubscriber();
  const { data: nominees } = useSubscriberNominees(sub?.id);
  const { addToast } = useToast();
  const renew = useRenewPolicy(sub?.id);

  const policies = sub?.policies || [];
  const active = policies.filter((p) => p.status === 'active');
  const expired = policies.filter((p) => p.status === 'expired');
  const hasAny = policies.length > 0;
  const onlyExpired = active.length === 0 && expired.length > 0;
  // Headline figure for the mobile flat summary card (replaces the removed hero):
  // total benefit across the subscriber's active cover.
  const totalActiveCover = active.reduce((sum, p) => sum + (p.cover || 0), 0);
  // Earliest upcoming renewal across active policies — shown in the desktop
  // cover-summary strip. ISO date strings sort lexicographically.
  const nextRenewal = active.map((p) => p.renewalDate).filter(Boolean).sort()[0] || null;
  const nextRenewalName = nextRenewal
    ? (active.find((p) => p.renewalDate === nextRenewal)?.name ?? null)
    : null;

  // Renewal sheet (the shared PaySheet owns the method picker).
  const [renewing, setRenewing] = useState(null);
  const [view, setView] = useState('confirm'); // confirm | success
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { reference, renewalDate }

  function openRenew(policy) {
    setRenewing(policy);
    setView('confirm');
    setResult(null);
  }

  function closeSheet() {
    if (submitting) return;
    setRenewing(null);
  }

  async function handlePay(methodFull) {
    if (!renewing || !sub) return;
    setSubmitting(true);
    try {
      const { reference, policy } = await renew.mutateAsync({
        type: renewing.type,
        method: methodFull,
      });
      setResult({ reference, renewalDate: policy?.renewalDate });
      setView('success');
      addToast('success', `${renewing.name} renewed — ${formatUGX(renewing.renewalAmount, { compact: false })} paid.`);
    } catch (err) {
      addToast('error', err?.message || 'Could not complete the renewal.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCertificate(policy) {
    // Life + funeral pay out to named beneficiaries; health does not.
    const hasBeneficiaries = policy.type === 'life' || policy.type === 'funeral';
    const PRODUCT_LABEL = { life: 'Life', health: 'Health', funeral: 'Funeral' };
    const ok = openPolicyCertificate({
      holderName: sub?.name,
      memberId: formatMemberId(sub?.phone),
      dob: sub?.dob,
      cover: policy.cover,
      premiumPerPeriod: policy.premiumMonthly,
      frequency: 'monthly', // premium is a monthly figure for every product
      policyStart: policy.policyStart,
      renewalDate: policy.renewalDate,
      productLabel: PRODUCT_LABEL[policy.type] ?? 'Life',
      showBeneficiaries: hasBeneficiaries,
      beneficiaries: hasBeneficiaries ? (nominees?.insurance ?? []) : [],
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
      {/* Desktop (>=1024px): flat, light page header matching the rest of the
          desktop dashboard (Home / Schedule) — replaces the mobile indigo hero
          dome that read as out-of-theme here. Mobile drops the header entirely
          (the app-bar owns the title) and shows the in-body summary card. */}
      {isDesktop && (
        <PageHeader
          title="Your policies"
          subtitle={subtitle}
          fallback="/dashboard"
        />
      )}

      <div className={styles.body}>
        {/* Desktop cover summary — three KPI tiles mirroring the Home overview's
            "savings & cover" card, so the page reads as a sibling of the rest of
            the desktop dashboard. Only when cover exists. */}
        {isDesktop && !isLoading && hasAny && (
          <section className={styles.deskSummary} aria-label="Cover summary">
            <div className={styles.sumItem}>
              <span className={styles.sumK}>Total active cover</span>
              <span className={styles.sumV}>{formatUGX(totalActiveCover, { compact: false })}</span>
              <span className={styles.sumSub}>
                {active.length} active {active.length === 1 ? 'policy' : 'policies'}
              </span>
            </div>
            <div className={styles.sumItem}>
              <span className={styles.sumK}>Status</span>
              <span className={styles.sumV}>{active.length} active</span>
              <span className={styles.sumSub}>
                {expired.length} expired
              </span>
            </div>
            <div className={styles.sumItem}>
              <span className={styles.sumK}>Next renewal</span>
              <span className={styles.sumV}>{nextRenewal ? formatDate(nextRenewal) : '—'}</span>
              <span className={styles.sumSub}>{nextRenewalName || 'No upcoming renewals'}</span>
            </div>
          </section>
        )}

        {/* Mobile flat summary card — replaces the removed hero with an eyebrow +
            big indigo total-cover figure + a sub-line. Desktop renders the
            KPI strip above instead. Only shown when cover exists. */}
        {!isDesktop && !isLoading && hasAny && (
          <section className={styles.summary} aria-labelledby="policies-cover-label">
            <span className={styles.summaryEyebrow} id="policies-cover-label">Total active cover</span>
            <div className={styles.summaryFigure}>{formatUGX(totalActiveCover, { compact: false })}</div>
            <span className={styles.summarySub}>{subtitle}</span>
          </section>
        )}

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

      {/* Renewal sheet — the shared PaySheet (portaled to <body>). */}
      <PaySheet
        open={!!renewing}
        view={view}
        ariaLabel={renewing ? (view === 'confirm' ? `Renew ${renewing.name}` : 'Renewal complete') : undefined}
        eyebrow="You're paying to renew"
        total={renewing?.renewalAmount ?? 0}
        subtitle={renewing
          ? `One year of ${renewing.name.toLowerCase()} · ${formatUGX(renewing.cover, { compact: false })} benefit`
          : undefined}
        lineItems={renewing ? [
          { label: 'Policy', value: renewing.name },
          { label: 'Cover', value: formatUGX(renewing.cover, { compact: false }) },
          { label: 'Premium', value: `${formatUGX(renewing.premiumMonthly, { compact: false })} / mo` },
        ] : []}
        note="You'll receive an SMS prompt to authorise the payment on your mobile money account."
        submitting={submitting}
        success={{
          title: 'Policy renewed',
          subtitle: renewing
            ? `${renewing.name} is active again.${result?.renewalDate ? ` Renews ${formatDate(result.renewalDate)}.` : ''}`
            : undefined,
          reference: result?.reference,
        }}
        onPay={handlePay}
        onClose={closeSheet}
      />
    </div>
  );
}
