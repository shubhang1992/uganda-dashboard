import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './CreateAgent.module.css';

const STEPS = [
  { id: 'details', label: 'Agent Details' },
  { id: 'review', label: 'Review' },
];

const GENDER_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

export default function CreateAgent({ branchId, splitMode = false }) {
  const { createAgentOpen, setCreateAgentOpen } = useDashboard();

  const [step, setStep] = useState(0);
  const [success, setSuccess] = useState(false);
  const bodyRef = useRef(null);

  /* Form fields */
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState(null);
  const [idNumber, setIdNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  /* Validation */
  const [errors, setErrors] = useState({});

  /* Scroll body to top on step change */
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [step]);

  /* Escape key to close */
  useEffect(() => {
    if (!createAgentOpen) return;
    function onKey(e) { if (e.key === 'Escape') setCreateAgentOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createAgentOpen, setCreateAgentOpen]);

  /* Reset form when panel closes */
  useEffect(() => {
    if (createAgentOpen) return;
    const t = setTimeout(() => {
      setStep(0);
      setSuccess(false);
      setFullName('');
      setPhone('');
      setEmail('');
      setGender(null);
      setIdNumber('');
      setEmployeeId('');
      setErrors({});
    }, 400);
    return () => clearTimeout(t);
  }, [createAgentOpen]);

  /* Validation */
  function validateDetails() {
    const e = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (phone.length < 9) e.phone = 'Enter a valid 9-digit phone number';
    if (!gender) e.gender = 'Select a gender';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* Navigation */
  function handleNext() {
    if (step === 0 && !validateDetails()) return;
    setErrors({});
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleConfirm() {
    setSuccess(true);
  }

  function handlePhoneChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    setPhone(val);
    if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
  }

  return (
    <>
      <AnimatePresence>
        {createAgentOpen && (
          <motion.div
            key="ca-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{
              x: 0,
              opacity: 1,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            exit={{
              x: '100%',
              opacity: 0.6,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
          >
            {success ? (
              <motion.div
                className={styles.successWrap}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className={styles.successCheck}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.1 }}
                >
                  <svg viewBox="0 0 56 56" fill="none" width="56" height="56">
                    <motion.circle
                      cx="28" cy="28" r="26"
                      stroke="var(--color-green)" strokeWidth="2"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                    />
                    <motion.path
                      d="M17 28l7 7 15-16"
                      stroke="var(--color-green)" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.35, delay: 0.7 }}
                    />
                  </svg>
                </motion.div>

                <motion.h3
                  className={styles.successTitle}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: 0.4 }}
                >
                  Agent Created
                </motion.h3>

                <motion.div
                  className={styles.successCard}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: 0.55 }}
                >
                  <div className={styles.successRow}>
                    <span className={styles.successRowIcon}>
                      <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
                        <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span className={styles.successRowText}>{fullName}</span>
                  </div>
                  <div className={styles.successRow}>
                    <span className={styles.successRowIcon}>
                      <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span className={styles.successRowText}>+256 {phone}</span>
                  </div>
                  {email && (
                    <div className={styles.successRow}>
                      <span className={styles.successRowIcon}>
                        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                          <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M22 7l-10 7L2 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span className={styles.successRowText}>{email}</span>
                    </div>
                  )}
                </motion.div>

                <motion.p
                  className={styles.successHint}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                >
                  Access credentials will be sent via SMS
                </motion.p>

                <motion.button
                  className={styles.successDoneBtn}
                  onClick={() => setCreateAgentOpen(false)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: 0.85 }}
                >
                  Done
                </motion.button>
              </motion.div>
            ) : (
              <>
                {/* Header */}
                <div className={styles.header}>
                  <button className={styles.closeBtn} onClick={() => setCreateAgentOpen(false)} aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </button>
                  <h2 className={styles.title}>Create New Agent</h2>
                  <p className={styles.subtitle}>Add an agent to your branch team</p>
                </div>

                {/* Progress bar */}
                <div className={styles.progressBar}>
                  {STEPS.map((s, i) => (
                    <React.Fragment key={s.id}>
                      <div className={styles.progressStep} data-active={i === step} data-done={i < step}>
                        <div className={styles.progressDot}>
                          {i < step ? (
                            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
                              <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span>{i + 1}</span>
                          )}
                        </div>
                        <span className={styles.progressLabel}>{s.label}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={styles.progressLine} data-done={i < step} />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Step content */}
                <div className={styles.body} ref={bodyRef}>
                  <AnimatePresence mode="wait">
                    {/* Step 1: Agent Details */}
                    {step === 0 && (
                      <motion.div
                        key="s-details"
                        className={styles.stepContent}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                      >
                        <div className={styles.field}>
                          <label className={styles.label}>Full Name <span className={styles.req}>*</span></label>
                          <input
                            className={styles.input}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. James Okello…"
                            data-error={!!errors.fullName}
                            name="agentName"
                            autoComplete="name"
                          />
                          {errors.fullName && <span className={styles.error}>{errors.fullName}</span>}
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Phone Number <span className={styles.req}>*</span></label>
                          <div className={styles.phoneGroup} data-error={!!errors.phone}>
                            <div className={styles.phonePrefix}>
                              <span className={styles.flag}>&#x1F1FA;&#x1F1EC;</span>
                              <span className={styles.phoneCode}>+256</span>
                            </div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              className={styles.phoneInput}
                              value={phone}
                              onChange={handlePhoneChange}
                              placeholder="7XX XXX XXX"
                              name="phone"
                              autoComplete="tel"
                            />
                          </div>
                          {errors.phone && <span className={styles.error}>{errors.phone}</span>}
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Email Address</label>
                          <input
                            type="email"
                            className={styles.input}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g. james@example.com…"
                            name="email"
                            autoComplete="email"
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Gender <span className={styles.req}>*</span></label>
                          <select
                            className={styles.select}
                            value={gender || ''}
                            onChange={(e) => { setGender(e.target.value || null); if (errors.gender) setErrors((p) => ({ ...p, gender: '' })); }}
                            data-error={!!errors.gender}
                            aria-label="Gender"
                          >
                            <option value="">Select gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                          {errors.gender && <span className={styles.error}>{errors.gender}</span>}
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>National ID Number</label>
                          <input
                            className={styles.input}
                            value={idNumber}
                            onChange={(e) => setIdNumber(e.target.value)}
                            placeholder="e.g. CM83021XXXXXX…"
                            name="idNumber"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Employee ID</label>
                          <input
                            className={styles.input}
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            placeholder="e.g. EMP-0042…"
                            name="employeeId"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Review */}
                    {step === 1 && (
                      <motion.div
                        key="s-review"
                        className={styles.stepContent}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                      >
                        <div className={styles.reviewCard}>
                          <h4 className={styles.reviewHeading}>Agent Details</h4>
                          <div className={styles.reviewGrid}>
                            <ReviewRow label="Full Name" value={fullName} />
                            <ReviewRow label="Phone" value={`+256 ${phone}`} />
                            {email && <ReviewRow label="Email" value={email} />}
                            <ReviewRow label="Gender" value={gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Other'} />
                            {idNumber && <ReviewRow label="National ID" value={idNumber} />}
                            {employeeId && <ReviewRow label="Employee ID" value={employeeId} />}
                          </div>
                        </div>

                        <p className={styles.hint}>
                          The agent will receive login credentials via SMS and can begin enrolling subscribers immediately.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                  {step > 0 && (
                    <button className={styles.backBtn} onClick={handleBack} type="button">
                      Back
                    </button>
                  )}
                  <div className={styles.footerSpacer} />
                  {step < STEPS.length - 1 ? (
                    <button className={styles.nextBtn} onClick={handleNext} type="button">
                      Continue
                    </button>
                  ) : (
                    <button className={styles.confirmBtn} onClick={handleConfirm} type="button">
                      Create Agent
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value || '\u2014'}</span>
    </div>
  );
}
