import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useAdminPanel } from '../../contexts/AdminPanelContext';
import { useCreateEmployer } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import styles from '../adminPanels.module.css';

const EMPTY = {
  name: '', sector: '', registrationNo: '', district: '',
  contactName: '', contactPhone: '', contactEmail: '', payrollCadence: 'monthly',
  // Funding model (§7d-2): collected up-front so an admin-created employer is
  // born with a usable default_contribution_config rather than `{}`.
  fundingMode: 'co-contribution', matchPct: '50', maxContribution: '', employerAmount: '',
};

/**
 * Map a raw Supabase/Postgres error to a friendly local message. Mirrors the
 * HTTP routes' error vocabulary for the admin write path (audit §5a / §2a.8):
 *   • P0001 (RAISE) → surface the raised message (the RPC's own validation text)
 *   • 23505 (unique_violation) → friendly "already exists" message
 */
function friendlyCreateError(err) {
  const code = err?.code;
  if (code === 'P0001') return err?.message || 'Could not create employer.';
  if (code === '23505') return 'An employer with these details already exists.';
  return err?.message || 'Could not create employer.';
}

/**
 * Admin: create-employer form. Docks above the Employers list. Submits via the
 * create_employer RPC (admin-gated); on success the list refreshes through the
 * mutation's query invalidation.
 */
export default function CreateEmployer() {
  const { createEmployerOpen, setCreateEmployerOpen } = useAdminPanel();
  const { addToast } = useToast();
  const createEmployer = useCreateEmployer();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (createEmployerOpen) return;
    const t = setTimeout(() => { setForm(EMPTY); setError(''); }, 400);
    return () => clearTimeout(t);
  }, [createEmployerOpen]);

  useEffect(() => {
    if (!createEmployerOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setCreateEmployerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createEmployerOpen, setCreateEmployerOpen]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Surface a client-side validation error both inline (errorBox) and via the
  // Toast live region (§7c.4 — validation errors were previously silent to AT).
  function fail(msg) {
    setError(msg);
    addToast('error', msg);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      fail('Employer name is required.');
      return;
    }

    // Build a non-empty funding config from the funding-model section so the
    // created employer can immediately run contributions (§7d-2). Insurance is
    // company-wide off by default and configured later in employer Settings.
    let defaultContributionConfig;
    if (form.fundingMode === 'co-contribution') {
      const matchPct = Number(form.matchPct);
      const maxContribution = form.maxContribution === '' ? null : Number(form.maxContribution);
      if (!(matchPct >= 0 && matchPct <= 100)) {
        fail('Match % must be between 0 and 100.');
        return;
      }
      if (maxContribution != null && !(maxContribution >= 0)) {
        fail('Maximum contribution must be 0 or more (or blank for no cap).');
        return;
      }
      defaultContributionConfig = { mode: 'co-contribution', matchPct, maxContribution };
    } else {
      const employerAmount = Number(form.employerAmount);
      if (!(employerAmount >= 0) || !Number.isFinite(employerAmount)) {
        fail('Amount per member must be 0 or more.');
        return;
      }
      defaultContributionConfig = { mode: 'employer-only', employerAmount };
    }

    try {
      await createEmployer.mutateAsync({
        name: form.name.trim(),
        sector: form.sector.trim() || null,
        registrationNo: form.registrationNo.trim() || null,
        district: form.district.trim() || null,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        payrollCadence: form.payrollCadence || null,
        defaultContributionConfig,
      });
      addToast('success', `Employer "${form.name.trim()}" created.`);
      setCreateEmployerOpen(false);
    } catch (err) {
      const msg = friendlyCreateError(err);
      setError(msg);
      addToast('error', msg);
    }
  }

  const submitting = createEmployer.isPending;

  return (
    <>
      <AnimatePresence>
        {createEmployerOpen && (
          <motion.div
            key="ce-backdrop"
            className={`${styles.backdrop} ${styles.backdropTop}`}
            initial={{ opacity: 0, pointerEvents: 'auto' }}
            animate={{ opacity: 1, pointerEvents: 'auto' }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.25 }}
            onClick={() => !submitting && setCreateEmployerOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createEmployerOpen && (
          <motion.div
            key="ce-panel"
            className={`${styles.panel} ${styles.panelTop}`}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
          >
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <button className={styles.backBtn} onClick={() => setCreateEmployerOpen(false)} aria-label="Back">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className={styles.titleWrap}>
                  <h2 className={styles.title}>New Employer</h2>
                  <p className={styles.subtitle}>Onboard a company to the platform</p>
                </div>
                <button className={styles.closeBtn} onClick={() => setCreateEmployerOpen(false)} aria-label="Close">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={styles.body}>
              <form className={styles.form} onSubmit={handleSubmit}>
                {error && <div className={styles.errorBox} role="alert">{error}</div>}

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ce-name">
                    Company name<span className={styles.req}>*</span>
                  </label>
                  <input
                    id="ce-name"
                    className={styles.input}
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. Kampala Textiles Ltd"
                    autoFocus
                  />
                </div>

                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-sector">Sector</label>
                    <input
                      id="ce-sector"
                      className={styles.input}
                      value={form.sector}
                      onChange={(e) => update('sector', e.target.value)}
                      placeholder="e.g. Manufacturing"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-district">District</label>
                    <input
                      id="ce-district"
                      className={styles.input}
                      value={form.district}
                      onChange={(e) => update('district', e.target.value)}
                      placeholder="e.g. Kampala"
                    />
                  </div>
                </div>

                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-reg">Registration no.</label>
                    <input
                      id="ce-reg"
                      className={styles.input}
                      value={form.registrationNo}
                      onChange={(e) => update('registrationNo', e.target.value)}
                      placeholder="Company reg. number"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-cadence">Payroll cadence</label>
                    <select
                      id="ce-cadence"
                      className={styles.input}
                      value={form.payrollCadence}
                      onChange={(e) => update('payrollCadence', e.target.value)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ce-contact">Contact name</label>
                  <input
                    id="ce-contact"
                    className={styles.input}
                    value={form.contactName}
                    onChange={(e) => update('contactName', e.target.value)}
                    placeholder="HR / payroll contact"
                  />
                </div>

                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-phone">Contact phone</label>
                    <input
                      id="ce-phone"
                      className={styles.input}
                      value={form.contactPhone}
                      onChange={(e) => update('contactPhone', e.target.value)}
                      placeholder="+256…"
                      inputMode="tel"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-email">Contact email</label>
                    <input
                      id="ce-email"
                      className={styles.input}
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => update('contactEmail', e.target.value)}
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ce-funding-mode">Funding model</label>
                  <select
                    id="ce-funding-mode"
                    className={styles.input}
                    value={form.fundingMode}
                    onChange={(e) => update('fundingMode', e.target.value)}
                  >
                    <option value="co-contribution">Co-contribution (match a % of each member's saving)</option>
                    <option value="employer-only">Employer-only (fixed amount per member)</option>
                  </select>
                </div>

                {form.fundingMode === 'co-contribution' ? (
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="ce-match-pct">Match %</label>
                      <input
                        id="ce-match-pct"
                        className={styles.input}
                        value={form.matchPct}
                        onChange={(e) => update('matchPct', e.target.value)}
                        placeholder="e.g. 50"
                        inputMode="numeric"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="ce-max-contribution">Cap per member (UGX)</label>
                      <input
                        id="ce-max-contribution"
                        className={styles.input}
                        value={form.maxContribution}
                        onChange={(e) => update('maxContribution', e.target.value)}
                        placeholder="Blank for no cap"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                ) : (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ce-employer-amount">Employer amount per member (UGX)</label>
                    <input
                      id="ce-employer-amount"
                      className={styles.input}
                      value={form.employerAmount}
                      onChange={(e) => update('employerAmount', e.target.value)}
                      placeholder="e.g. 50000"
                      inputMode="numeric"
                    />
                  </div>
                )}

                <div className={styles.formActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setCreateEmployerOpen(false)} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.submitBtn} disabled={submitting}>
                    {submitting ? <span className={styles.btnSpinner} /> : 'Create employer'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
