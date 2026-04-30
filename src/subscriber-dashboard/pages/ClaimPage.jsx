import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useCurrentSubscriber, useSubmitClaim } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import styles from './ClaimPage.module.css';

const CLAIM_TYPES = [
  { id: 'medical',          label: 'Medical' },
  { id: 'accident',         label: 'Accident' },
  { id: 'hospitalization',  label: 'Hospitalisation' },
  { id: 'critical_illness', label: 'Critical illness' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusMeta(status) {
  switch (status) {
    case 'approved':
    case 'paid':         return { label: status === 'paid' ? 'Paid' : 'Approved', tone: 'ok' };
    case 'submitted':    return { label: 'Submitted', tone: 'info' };
    case 'under_review': return { label: 'Under review', tone: 'pending' };
    case 'rejected':     return { label: 'Rejected', tone: 'alert' };
    default:             return { label: status, tone: 'info' };
  }
}

export default function ClaimPage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const submitClaim = useSubmitClaim(sub?.id);

  const [view, setView] = useState('list'); // list | form | review | success
  const [claimType, setClaimType] = useState('medical');
  const [claimDate, setClaimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDesc, setClaimDesc] = useState('');
  const [claimFiles, setClaimFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [resultClaim, setResultClaim] = useState(null);

  const insurance = sub?.insurance;
  const claims = sub?.claims || [];
  const noPolicy = !insurance || insurance.status !== 'active';

  const claimAmtNum = Number.parseInt(claimAmount.replace(/[^\d]/g, '') || '0', 10);
  const canReview = claimType && claimDate && claimAmtNum > 0 && claimDesc.trim().length >= 6;

  function handleBack() {
    if (view === 'review') return setView('form');
    if (view === 'form' || view === 'success') return setView('list');
    navigate('/dashboard/withdraw');
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
      setView('success');
      addToast('success', 'Claim submitted. We’ll be in touch shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setClaimType('medical');
    setClaimDate(new Date().toISOString().slice(0, 10));
    setClaimAmount('');
    setClaimDesc('');
    setClaimFiles([]);
    setResultClaim(null);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={
          view === 'list' ? 'File a claim'
          : view === 'form' ? 'New claim'
          : view === 'review' ? 'Review claim'
          : 'Submitted'
        }
        subtitle={
          view === 'list' && insurance ? `Cover: ${formatUGX(insurance.cover || 0)}`
          : view === 'list' ? 'No active policy yet'
          : null
        }
        onBack={handleBack}
      />

      <div className={styles.body}>
        <AnimatePresence mode="wait" initial={false}>
          {view === 'list' && (
            <motion.div
              key="list"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              {noPolicy ? (
                <section className={styles.emptyCoverCard}>
                  <div className={styles.shieldIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                      <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h2 className={styles.emptyTitle}>No active policy</h2>
                  <p className={styles.emptyText}>
                    Add life cover from <strong>UGX 2,000 / mo</strong>. You&apos;ll be covered up to UGX 1M.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => navigate('/dashboard/save/schedule')}
                  >
                    Add cover
                  </button>
                </section>
              ) : (
                <>
                  <section className={styles.coverCard}>
                    <span className={styles.coverEyebrow}>Active cover</span>
                    <div className={styles.coverValue}>{formatUGX(insurance.cover)}</div>
                    <div className={styles.coverMeta}>
                      <div className={styles.coverMetaItem}>
                        <span className={styles.coverMetaLabel}>Premium</span>
                        <span className={styles.coverMetaValue}>{formatUGXExact(insurance.premiumMonthly)} / mo</span>
                      </div>
                      <div className={styles.coverMetaItem}>
                        <span className={styles.coverMetaLabel}>Renewal</span>
                        <span className={styles.coverMetaValue}>{formatDate(insurance.renewalDate)}</span>
                      </div>
                    </div>
                  </section>

                  <button type="button" className={styles.fileNewBtn} onClick={() => { resetForm(); setView('form'); }}>
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                    </svg>
                    File a new claim
                  </button>

                  <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Past claims</h2>
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
                  </section>
                </>
              )}
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div
              key="form"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>01</span>
                  <h2 className={styles.sectionTitle}>What happened?</h2>
                </div>
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
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h2 className={styles.sectionTitle}>When &amp; how much?</h2>
                </div>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Incident date</span>
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
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>03</span>
                  <h2 className={styles.sectionTitle}>Describe it</h2>
                </div>
                <textarea
                  className={styles.textarea}
                  value={claimDesc}
                  onChange={(e) => setClaimDesc(e.target.value)}
                  placeholder="A short summary of the incident and what you&#39;re claiming for."
                  rows={4}
                />
                <span className={styles.charHint}>{claimDesc.length} chars · min 6</span>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>04</span>
                  <h2 className={styles.sectionTitle}>Supporting documents</h2>
                </div>
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
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17,8 12,3 7,8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                    </svg>
                    <span className={styles.dropzoneTitle}>Tap to upload</span>
                    <span className={styles.dropzoneHint}>Receipts, discharge letter, photos · up to 4 files</span>
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
              </section>
            </motion.div>
          )}

          {view === 'review' && (
            <motion.div
              key="review"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <section className={styles.reviewCard}>
                <span className={styles.confirmEyebrow}>Claiming</span>
                <div className={styles.confirmBig}>{formatUGXExact(claimAmtNum)}</div>
                <ul className={styles.summaryList}>
                  <li className={styles.summaryRow}>
                    <span>Type</span>
                    <strong>{CLAIM_TYPES.find((t) => t.id === claimType)?.label}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Incident</span>
                    <strong>{formatDate(claimDate)}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Documents</span>
                    <strong>{claimFiles.length} file{claimFiles.length !== 1 ? 's' : ''}</strong>
                  </li>
                </ul>
                <p className={styles.reviewDesc}>{claimDesc}</p>
                <p className={styles.confirmNote}>
                  A case officer will review your claim within 3 business days. You&apos;ll get an SMS at every step.
                </p>
              </section>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              className={styles.successStep}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.successCheck} aria-hidden="true">
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                  <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                  <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className={styles.successTitle}>Claim submitted</h2>
              <p className={styles.successSubtitle}>
                We&apos;ve received your claim. A case officer will be in touch within 3 business days.
              </p>
              {resultClaim?.id && (
                <div className={styles.successRef}>
                  Case <strong>{resultClaim.id.slice(-6).toUpperCase()}</strong>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!noPolicy && (
        <footer className={styles.footer}>
          {view === 'list' && claims.length > 0 && (
            <button type="button" className={styles.primaryBtn} onClick={() => { resetForm(); setView('form'); }}>
              File a new claim
            </button>
          )}
          {view === 'form' && (
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!canReview}
              onClick={() => setView('review')}
            >
              Review claim
            </button>
          )}
          {view === 'review' && (
            <div className={styles.footerRow}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setView('form')}>Edit</button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={submitting}
                onClick={handleSubmitClaim}
              >
                {submitting ? 'Submitting…' : 'Submit claim'}
              </button>
            </div>
          )}
          {view === 'success' && (
            <div className={styles.footerRow}>
              <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/dashboard')}>
                Home
              </button>
              <button type="button" className={styles.primaryBtn} onClick={() => setView('list')}>
                View claims
              </button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
