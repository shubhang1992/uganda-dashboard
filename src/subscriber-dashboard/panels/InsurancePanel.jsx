import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber, useSubmitClaim, useUpdateInsuranceCover } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import styles from './InsurancePanel.module.css';

const CLAIM_TYPES = [
  { id: 'medical',            label: 'Medical' },
  { id: 'accident',           label: 'Accident' },
  { id: 'hospitalization',    label: 'Hospitalisation' },
  { id: 'critical_illness',   label: 'Critical illness' },
];

const COVER_TIERS = [
  { cover: 1_000_000, premium: 2000 },
  { cover: 2_000_000, premium: 3500 },
  { cover: 3_000_000, premium: 5000 },
  { cover: 5_000_000, premium: 7500 },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusMeta(status) {
  switch (status) {
    case 'approved':
    case 'paid':
      return { label: status === 'paid' ? 'Paid' : 'Approved', tone: 'ok' };
    case 'submitted':
      return { label: 'Submitted', tone: 'info' };
    case 'under_review':
      return { label: 'Under review', tone: 'pending' };
    case 'rejected':
      return { label: 'Rejected', tone: 'alert' };
    default:
      return { label: status, tone: 'info' };
  }
}

export default function InsurancePanel({ splitMode = false }) {
  const { insuranceOpen, setInsuranceOpen, insuranceTab, setInsuranceTab, setNomineesOpen, setNomineesTab, closeAllPanels } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const submitClaim = useSubmitClaim(sub?.id);
  const updateCover = useUpdateInsuranceCover(sub?.id);

  // Claim-flow state (replace-model inside the Claims tab)
  const [claimView, setClaimView] = useState('list'); // list | form | review | success
  const [claimType, setClaimType] = useState('medical');
  const [claimDate, setClaimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDesc, setClaimDesc] = useState('');
  const [claimFiles, setClaimFiles] = useState([]); // {name, size}
  const [submitting, setSubmitting] = useState(false);
  const [resultClaim, setResultClaim] = useState(null);

  // Coverage upgrade state
  const [coverIdx, setCoverIdx] = useState(0);

  useEffect(() => {
    if (insuranceOpen) return;
    const t = setTimeout(() => {
      setClaimView('list');
      setClaimType('medical');
      setClaimDate(new Date().toISOString().slice(0, 10));
      setClaimAmount('');
      setClaimDesc('');
      setClaimFiles([]);
      setSubmitting(false);
      setResultClaim(null);
      setCoverIdx(0);
    }, 400);
    return () => clearTimeout(t);
  }, [insuranceOpen]);

  useEffect(() => {
    if (insuranceOpen && sub?.insurance?.cover) {
      const idx = COVER_TIERS.findIndex((t) => t.cover === sub.insurance.cover);
      setCoverIdx(idx >= 0 ? idx : 0);
    }
  }, [insuranceOpen, sub]);

  useEffect(() => {
    if (!insuranceOpen) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (claimView !== 'list') setClaimView(claimView === 'review' ? 'form' : 'list');
      else setInsuranceOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [insuranceOpen, setInsuranceOpen, claimView]);

  const insurance = sub?.insurance;
  const claims = sub?.claims || [];
  const insNominees = sub?.nominees?.insurance || [];

  const claimAmtNum = Number.parseInt(claimAmount.replace(/[^\d]/g, '') || '0', 10);
  const canReview = claimType && claimDate && claimAmtNum > 0 && claimDesc.trim().length >= 6;

  const selectedTier = COVER_TIERS[coverIdx];
  const tierIsUpgrade = selectedTier.cover > (insurance?.cover || 0);

  function openInsuranceNominees() {
    setInsuranceOpen(false);
    closeAllPanels();
    setNomineesTab('insurance');
    setNomineesOpen(true);
  }

  function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    const meta = files.slice(0, 4).map((f) => ({ name: f.name, size: f.size }));
    setClaimFiles(meta);
  }

  function removeFile(name) {
    setClaimFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleSubmitClaim() {
    if (!canReview || !sub) return;
    setSubmitting(true);
    try {
      const claim = await submitClaim.mutateAsync({
        type: claimType,
        incidentDate: claimDate,
        amount: claimAmtNum,
        description: claimDesc.trim(),
        files: claimFiles.map((f) => f.name),
      });
      setResultClaim(claim);
      setClaimView('success');
      addToast('success', 'Claim submitted. We\u2019ll be in touch shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpgradeCover() {
    if (!sub || !tierIsUpgrade) return;
    setSubmitting(true);
    try {
      await updateCover.mutateAsync({ cover: selectedTier.cover, premiumMonthly: selectedTier.premium });
      addToast('success', `Cover upgraded to ${formatUGX(selectedTier.cover)}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {insuranceOpen && !splitMode && (
          <motion.div
            key="ins-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setInsuranceOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {insuranceOpen && (
          <motion.div
            key="ins-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="ins-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              <button className={styles.closeBtn} onClick={() => setInsuranceOpen(false)} aria-label="Close">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Insurance</span>
                <h2 id="ins-title" className={styles.title}>Your cover &amp; claims</h2>
              </div>

              <div className={styles.tabs} role="tablist">
                {['coverage', 'claims', 'beneficiaries'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={insuranceTab === t}
                    className={styles.tab}
                    data-active={insuranceTab === t}
                    onClick={() => { setInsuranceTab(t); setClaimView('list'); }}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </header>

            <div className={styles.body}>
              <AnimatePresence mode="wait">
                {/* ── Coverage ── */}
                {insuranceTab === 'coverage' && (
                  <motion.div
                    key="coverage"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.tabContent}
                  >
                    {!insurance || insurance.status !== 'active' ? (
                      <section className={styles.emptyCoverCard}>
                        <div className={styles.shieldIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                            <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                            <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <h3 className={styles.emptyTitle}>No active policy</h3>
                        <p className={styles.emptyText}>Protect your family from just UGX 2,000 / month with UGX 1M of life cover.</p>
                      </section>
                    ) : (
                      <section className={styles.coverCard}>
                        <span className={styles.coverEyebrow}>Current cover</span>
                        <div className={styles.coverValue}>{formatUGX(insurance.cover)}</div>
                        <div className={styles.coverMeta}>
                          <div className={styles.coverMetaItem}>
                            <span className={styles.coverMetaLabel}>Monthly premium</span>
                            <span className={styles.coverMetaValue}>{formatUGXExact(insurance.premiumMonthly)}</span>
                          </div>
                          <div className={styles.coverMetaItem}>
                            <span className={styles.coverMetaLabel}>Policy start</span>
                            <span className={styles.coverMetaValue}>{formatDate(insurance.policyStart)}</span>
                          </div>
                          <div className={styles.coverMetaItem}>
                            <span className={styles.coverMetaLabel}>Next renewal</span>
                            <span className={styles.coverMetaValue}>{formatDate(insurance.renewalDate)}</span>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Upgrade slider */}
                    <section className={styles.upgradeCard}>
                      <h3 className={styles.upgradeTitle}>Upgrade your cover</h3>
                      <p className={styles.upgradeSub}>Slide to change your cover level. Premium updates automatically.</p>
                      <div className={styles.tierHead}>
                        <div>
                          <span className={styles.tierEyebrow}>Cover</span>
                          <span className={styles.tierValue}>{formatUGX(selectedTier.cover)}</span>
                        </div>
                        <div className={styles.tierPremium}>
                          <span className={styles.tierEyebrow}>Premium</span>
                          <span className={styles.tierValue}>{formatUGXExact(selectedTier.premium)} / mo</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={COVER_TIERS.length - 1}
                        step={1}
                        value={coverIdx}
                        onChange={(e) => setCoverIdx(Number.parseInt(e.target.value, 10))}
                        className={styles.slider}
                        style={{ '--pct': `${(coverIdx / (COVER_TIERS.length - 1)) * 100}%` }}
                        aria-label="Cover tier"
                      />
                      <div className={styles.tierMarks}>
                        {COVER_TIERS.map((tier, i) => (
                          <button
                            key={tier.cover}
                            type="button"
                            className={styles.tierMark}
                            data-active={i === coverIdx}
                            onClick={() => setCoverIdx(i)}
                          >
                            {formatUGX(tier.cover)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={!tierIsUpgrade || submitting}
                        onClick={handleUpgradeCover}
                      >
                        {tierIsUpgrade ? `Upgrade to ${formatUGX(selectedTier.cover)}` : 'Current cover'}
                      </button>
                    </section>
                  </motion.div>
                )}

                {/* ── Claims ── */}
                {insuranceTab === 'claims' && claimView === 'list' && (
                  <motion.div
                    key="claims-list"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.tabContent}
                  >
                    <button type="button" className={styles.filePrimary} onClick={() => setClaimView('form')}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                      </svg>
                      File a new claim
                    </button>

                    <ul className={styles.claimsList}>
                      {claims.length === 0 && (
                        <li className={styles.claimsEmpty}>No claims filed yet.</li>
                      )}
                      {claims.map((c) => {
                        const meta = statusMeta(c.status);
                        return (
                          <li key={c.id} className={styles.claimRow}>
                            <div className={styles.claimHead}>
                              <span className={styles.claimType}>{CLAIM_TYPES.find((t) => t.id === c.type)?.label || c.type}</span>
                              <span className={styles.claimStatus} data-tone={meta.tone}>
                                <span className={styles.statusDot} />
                                {meta.label}
                              </span>
                            </div>
                            <div className={styles.claimMeta}>
                              <span>Submitted {formatDate(c.submittedDate)}</span>
                              <span className={styles.claimDot}>·</span>
                              <span>Incident {formatDate(c.incidentDate)}</span>
                            </div>
                            <div className={styles.claimAmount}>{formatUGXExact(c.amount)}</div>
                            {c.description && <p className={styles.claimDesc}>{c.description}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}

                {insuranceTab === 'claims' && claimView === 'form' && (
                  <motion.div
                    key="claims-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.tabContent}
                  >
                    <button type="button" className={styles.backLink} onClick={() => setClaimView('list')}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Back to claims
                    </button>

                    <section className={styles.formSection}>
                      <h3 className={styles.formTitle}>Claim details</h3>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Claim type</span>
                        <div className={styles.chipRow} role="radiogroup" aria-label="Claim type">
                          {CLAIM_TYPES.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              role="radio"
                              aria-checked={claimType === c.id}
                              className={styles.chip}
                              data-active={claimType === c.id}
                              onClick={() => setClaimType(c.id)}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </label>

                      <div className={styles.fieldRow}>
                        <label className={styles.field}>
                          <span className={styles.fieldLabel}>Date of incident</span>
                          <input
                            type="date"
                            className={styles.input}
                            value={claimDate}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setClaimDate(e.target.value)}
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.fieldLabel}>Amount (UGX)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={styles.input}
                            value={claimAmount ? Number.parseInt(claimAmount.replace(/[^\d]/g, ''), 10).toLocaleString('en-UG') : ''}
                            onChange={(e) => setClaimAmount(e.target.value.replace(/[^\d]/g, ''))}
                            placeholder="e.g. 350,000"
                          />
                        </label>
                      </div>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Describe what happened</span>
                        <textarea
                          className={styles.textarea}
                          value={claimDesc}
                          onChange={(e) => setClaimDesc(e.target.value)}
                          placeholder="A short summary of the incident and what you&#39;re claiming for."
                          rows={4}
                        />
                      </label>

                      {/* File uploader */}
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Supporting documents</span>
                        <label className={styles.dropzone}>
                          <input
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            onChange={handleFilePick}
                            className={styles.hiddenInput}
                            aria-label="Upload supporting documents"
                          />
                          <div className={styles.dropzoneInner}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                              <polyline points="17,8 12,3 7,8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                            </svg>
                            <span className={styles.dropzoneTitle}>Tap to upload</span>
                            <span className={styles.dropzoneHint}>Receipts, discharge letter, photos (up to 4 files)</span>
                          </div>
                        </label>

                        {claimFiles.length > 0 && (
                          <ul className={styles.filesList}>
                            {claimFiles.map((f) => (
                              <li key={f.name} className={styles.fileItem}>
                                <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none">
                                  <path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                </svg>
                                <span className={styles.fileName}>{f.name}</span>
                                <button
                                  type="button"
                                  className={styles.fileRemove}
                                  onClick={() => removeFile(f.name)}
                                  aria-label={`Remove ${f.name}`}
                                >
                                  <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>

                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={!canReview}
                      onClick={() => setClaimView('review')}
                    >
                      Review claim
                    </button>
                  </motion.div>
                )}

                {insuranceTab === 'claims' && claimView === 'review' && (
                  <motion.div
                    key="claims-review"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.tabContent}
                  >
                    <button type="button" className={styles.backLink} onClick={() => setClaimView('form')}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Edit details
                    </button>

                    <section className={styles.reviewCard}>
                      <div className={styles.reviewBig}>{formatUGXExact(claimAmtNum)}</div>
                      <ul className={styles.reviewList}>
                        <li><span>Type</span><span>{CLAIM_TYPES.find((t) => t.id === claimType)?.label}</span></li>
                        <li><span>Incident</span><span>{formatDate(claimDate)}</span></li>
                        <li><span>Documents</span><span>{claimFiles.length} file{claimFiles.length !== 1 ? 's' : ''}</span></li>
                      </ul>
                      <p className={styles.reviewDesc}>{claimDesc}</p>
                    </section>

                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={submitting}
                      onClick={handleSubmitClaim}
                    >
                      {submitting ? 'Submitting…' : 'Submit claim'}
                    </button>
                  </motion.div>
                )}

                {insuranceTab === 'claims' && claimView === 'success' && (
                  <motion.div
                    key="claims-success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    className={`${styles.tabContent} ${styles.successStep}`}
                  >
                    <div className={styles.successCheck} aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
                        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                        <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className={styles.successTitle}>Claim submitted</h3>
                    <p className={styles.successSubtitle}>
                      We&apos;ve received your claim. A case officer will review it within 3 business days.
                    </p>
                    {resultClaim?.id && (
                      <div className={styles.successRef}>Case: <strong>{resultClaim.id.slice(-6).toUpperCase()}</strong></div>
                    )}
                    <button type="button" className={styles.secondaryBtn} onClick={() => setClaimView('list')}>
                      Back to claims
                    </button>
                  </motion.div>
                )}

                {/* ── Beneficiaries ── */}
                {insuranceTab === 'beneficiaries' && (
                  <motion.div
                    key="beneficiaries"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.tabContent}
                  >
                    <p className={styles.beneIntro}>
                      These people receive your life insurance benefit. Shares must total 100%.
                    </p>
                    <ul className={styles.beneList}>
                      {insNominees.length === 0 && (
                        <li className={styles.beneEmpty}>No insurance beneficiaries on file yet.</li>
                      )}
                      {insNominees.map((n) => (
                        <li key={n.id} className={styles.beneRow}>
                          <span className={styles.beneAvatar}>
                            {(n.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                          </span>
                          <div className={styles.beneText}>
                            <span className={styles.beneName}>{n.name}</span>
                            <span className={styles.beneMeta}>
                              {n.relationship ? n.relationship[0].toUpperCase() + n.relationship.slice(1) : ''}
                              {n.phone && <> · {n.phone}</>}
                            </span>
                          </div>
                          <span className={styles.beneShare}>{n.share}%</span>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className={styles.primaryBtn} onClick={openInsuranceNominees}>
                      Edit beneficiaries
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
