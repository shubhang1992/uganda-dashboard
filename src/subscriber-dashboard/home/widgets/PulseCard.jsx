import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX, calcFV } from '../../../utils/finance';
import styles from './PulseCard.module.css';

const HIDE_KEY = 'up-sub-balance-hidden';
const RETIREMENT_AGE = 60;
const START_AGE = 25; // assumed working-life start for the progress arc

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function useCountUp(target, duration = 1100, run = true) {
  const [v, setV] = useState(0);
  const active = run && Number.isFinite(target) && target > 0;
  useEffect(() => {
    if (!active) return;
    let raf;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return active ? v : 0;
}

function monthlyEquivalent(schedule) {
  if (!schedule?.amount) return 0;
  const a = schedule.amount;
  switch (schedule.frequency) {
    case 'weekly':       return (a * 52) / 12;
    case 'monthly':      return a;
    case 'quarterly':    return a / 3;
    case 'half-yearly':
    case 'semi-annually':
    case 'halfYearly':   return a / 6;
    case 'annually':
    case 'yearly':       return a / 12;
    default:             return a;
  }
}

export default function PulseCard({ subscriber, user }) {
  const navigate = useNavigate();
  const [hide, setHide] = useState(() => {
    try { return window.localStorage.getItem(HIDE_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(HIDE_KEY, String(hide)); } catch { /* ignore */ }
  }, [hide]);

  const balance = subscriber?.netBalance || 0;
  const counted = useCountUp(hide ? 0 : balance);
  const firstName = (user?.name || subscriber?.name || 'there').split(' ')[0];

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

  return (
    <section className={styles.card} aria-label="Your savings">
      <span className={styles.mesh} aria-hidden="true" />
      <span className={styles.grain} aria-hidden="true" />

      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>Good {hourGreeting()}</span>
          <h2 className={styles.greeting}>{firstName}</h2>
        </div>
        <button
          type="button"
          className={styles.agentChip}
          onClick={() => navigate('/dashboard/agent')}
          aria-label="Open your agent"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
            <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M3 13a5 5 0 0110 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>Agent</span>
        </button>
      </header>

      <div className={styles.balanceRow}>
        <span className={styles.balanceLabel}>Total balance</span>
        <button
          type="button"
          className={styles.eye}
          onClick={() => setHide((v) => !v)}
          aria-label={hide ? 'Show balance' : 'Hide balance'}
          aria-pressed={hide}
        >
          {hide ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14.12 14.12a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      <div className={styles.balanceValue} aria-live="polite">
        {hide ? <span className={styles.balanceMask}>UGX ••••••••</span> : formatUGXExact(Math.round(counted))}
      </div>

      <div className={styles.progress}>
        <div className={styles.progressTrack} aria-hidden="true">
          <motion.div
            className={styles.progressFill}
            initial={{ width: 0 }}
            animate={{ width: `${lifeProgressPct}%` }}
            transition={{ duration: 0.9, delay: 0.2, ease: EASE_OUT_EXPO }}
          />
        </div>
        <div className={styles.progressMeta}>
          <span className={styles.progressNow}>Age {age}</span>
          <span className={styles.progressGoal}>60</span>
        </div>
      </div>

      <div className={styles.projection}>
        <span className={styles.projLabel}>At your pace, by 60</span>
        <span className={styles.projValue}>
          {hide ? '••••' : formatUGX(Math.round(projectedAt60))}
        </span>
      </div>
    </section>
  );
}
