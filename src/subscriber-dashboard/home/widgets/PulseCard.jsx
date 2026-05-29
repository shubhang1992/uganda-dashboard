import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGX, calcFV, monthlyEquivalent } from '../../../utils/finance';
import { RETIREMENT_AGE, START_AGE } from '../../../constants/savings';
import { useCountUp } from '../../../hooks/useCountUp';
import HeroCapsule from '../../../components/HeroCapsule';
import styles from './PulseCard.module.css';

export default function PulseCard({ subscriber }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const balance = subscriber?.netBalance || 0;
  const counted = useCountUp(balance);

  const age = typeof subscriber?.age === 'number' ? subscriber.age : 30;
  const yearsToRetirement = Math.max(0, RETIREMENT_AGE - age);
  const totalWorkingYears = Math.max(1, RETIREMENT_AGE - START_AGE);
  const yearsElapsed = Math.min(totalWorkingYears, Math.max(0, age - START_AGE));
  const lifeProgressPct = Math.min(100, Math.round((yearsElapsed / totalWorkingYears) * 100));

  const monthly = useMemo(() => monthlyEquivalent(subscriber?.contributionSchedule), [subscriber]);
  const projectedAt60 = useMemo(
    () => (yearsToRetirement > 0 ? balance + calcFV(monthly, yearsToRetirement) : balance),
    [balance, monthly, yearsToRetirement]
  );

  const units = subscriber?.unitsHeld || 0;
  const totalContributed = subscriber?.totalContributions || 0;
  const totalWithdrawn = subscriber?.totalWithdrawals || 0;
  const netInvested = Math.max(0, totalContributed - totalWithdrawn);
  const growth = balance - netInvested;
  const growthPct = netInvested > 0 ? (growth / netInvested) * 100 : 0;
  const retirementBal = subscriber?.retirementBalance || 0;
  const emergencyBal = subscriber?.emergencyBalance || 0;
  const splitTotal = retirementBal + emergencyBal;
  const retirementPct = splitTotal > 0 ? (retirementBal / splitTotal) * 100 : 0;
  const emergencyPct = splitTotal > 0 ? (emergencyBal / splitTotal) * 100 : 0;

  const amountLabel = Math.round(counted).toLocaleString('en-UG');

  const statRow = (
    <>
      <span>
        <strong>{units.toLocaleString('en-UG', { maximumFractionDigits: 2 })}</strong> units
      </span>
      <span>
        Invested <strong>{formatUGX(netInvested)}</strong>
      </span>
      <span style={{ color: 'var(--color-green)' }}>
        {growth >= 0 ? '+' : '−'}{Math.abs(growthPct).toFixed(1)}% growth
      </span>
    </>
  );

  return (
    <section className={styles.wrap} aria-label="Your savings">
      <HeroCapsule
        title="Balance"
        prefix="UGX"
        amount={amountLabel}
        subtitle="Total balance"
        statRow={statRow}
        onBack={() => navigate('/')}
        onMenu={() => navigate('/dashboard/agent')}
      />

      <div className={styles.body}>
        <button
          type="button"
          className={styles.disclosure}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="pulse-metrics"
        >
          <span className={styles.disclosureLabel}>
            {expanded ? 'Hide details' : 'View details'}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            className={styles.disclosureChevron}
            data-expanded={expanded || undefined}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="metrics"
              id="pulse-metrics"
              className={styles.metrics}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.metricsInner}>
                <div className={styles.statGrid}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Units held</span>
                    <span className={styles.statValue}>
                      {units.toLocaleString('en-UG', { maximumFractionDigits: 4 })}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Net invested</span>
                    <span className={styles.statValue}>
                      {formatUGX(netInvested)}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Growth</span>
                    <span className={styles.statValue} data-tone={growth >= 0 ? 'positive' : 'negative'}>
                      {growth >= 0 ? '+' : '−'}{formatUGX(Math.abs(growth))}
                    </span>
                  </div>
                </div>

                <div className={styles.split}>
                  <div className={styles.splitHead}>
                    <span className={styles.splitLabel}>Retirement vs Emergency</span>
                  </div>
                  <div className={styles.splitBar} role="img" aria-label={`${Math.round(retirementPct)}% retirement, ${Math.round(emergencyPct)}% emergency`}>
                    <motion.span
                      className={styles.splitRetirement}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${retirementPct}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT_EXPO, delay: reduceMotion ? 0 : 0.08 }}
                    />
                    <motion.span
                      className={styles.splitEmergency}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${emergencyPct}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT_EXPO, delay: reduceMotion ? 0 : 0.14 }}
                    />
                  </div>
                  <div className={styles.splitLegend}>
                    <span className={styles.splitItem}>
                      <span className={styles.splitDot} data-tone="retirement" aria-hidden="true" />
                      <span className={styles.splitItemLabel}>Retirement</span>
                      <span className={styles.splitItemValue}>
                        {formatUGX(retirementBal)}
                      </span>
                    </span>
                    <span className={styles.splitItem}>
                      <span className={styles.splitDot} data-tone="emergency" aria-hidden="true" />
                      <span className={styles.splitItemLabel}>Emergency</span>
                      <span className={styles.splitItemValue}>
                        {formatUGX(emergencyBal)}
                      </span>
                    </span>
                  </div>
                </div>

                <div className={styles.progress}>
                  <div className={styles.progressTrack} aria-hidden="true">
                    <motion.div
                      className={styles.progressFill}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${lifeProgressPct}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.9, delay: reduceMotion ? 0 : 0.2, ease: EASE_OUT_EXPO }}
                    />
                  </div>
                  <div className={styles.progressMeta}>
                    <span>Age {age}</span>
                    <span>60</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.projection}
                  onClick={() => navigate('/dashboard/projection')}
                  aria-label={`Open goal projection · at your pace, ${formatUGX(Math.round(projectedAt60))} by 60`}
                >
                  <span className={styles.projIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 7h7v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className={styles.projBody}>
                    <span className={styles.projLabel}>At your pace, by 60</span>
                    <span className={styles.projValue}>
                      {formatUGX(Math.round(projectedAt60))}
                    </span>
                  </span>
                  <span className={styles.projChevron} aria-hidden="true">
                    <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
