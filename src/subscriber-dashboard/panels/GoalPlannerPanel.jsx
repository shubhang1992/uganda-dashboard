import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact, calcFV, MONTHLY_RATE } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import styles from './GoalPlannerPanel.module.css';

const RETIREMENT_AGE = 60;
const DEFAULT_AGE = 30;

const GOALS = [
  { id: 'emergency',  label: 'Emergency fund',        hint: '6 months of income',          target: 3_000_000 },
  { id: 'car',        label: 'Buy a car',             hint: 'Mid-range sedan or pickup',   target: 50_000_000 },
  { id: 'education',  label: "Children's education",  hint: 'University through graduation', target: 120_000_000 },
  { id: 'house',      label: 'Buy a house',           hint: 'Family home in Kampala',      target: 250_000_000 },
  { id: 'retirement', label: 'Comfortable retirement', hint: '20 years of living costs',    target: 500_000_000 },
];

function monthlyFromSchedule(schedule) {
  if (!schedule?.amount) return 0;
  const amount = schedule.amount;
  switch (schedule.frequency) {
    case 'weekly':       return (amount * 52) / 12;
    case 'monthly':      return amount;
    case 'quarterly':    return amount / 3;
    case 'half-yearly':
    case 'semi-annually':
    case 'halfYearly':   return amount / 6;
    case 'annually':
    case 'yearly':       return amount / 12;
    default:             return amount;
  }
}

function requiredMonthly(target, years) {
  const n = years * 12;
  if (n <= 0 || target <= 0) return 0;
  const factor = (Math.pow(1 + MONTHLY_RATE, n) - 1) / MONTHLY_RATE;
  return factor > 0 ? target / factor : 0;
}

export default function GoalPlannerPanel({ splitMode = false }) {
  const { yourGoalOpen, setYourGoalOpen } = useDashboard();
  const { data: subscriber } = useCurrentSubscriber();

  const [goalId, setGoalId] = useState('house');
  const [age, setAge] = useState(DEFAULT_AGE);

  useEffect(() => {
    if (!yourGoalOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setYourGoalOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [yourGoalOpen, setYourGoalOpen]);

  const schedule = subscriber?.contributionSchedule;
  const monthlyCurrent = useMemo(() => monthlyFromSchedule(schedule), [schedule]);
  const yearsToRetirement = Math.max(0, RETIREMENT_AGE - age);
  const projectedAtRetirement = useMemo(
    () => calcFV(monthlyCurrent, yearsToRetirement),
    [monthlyCurrent, yearsToRetirement],
  );

  const goal = GOALS.find((g) => g.id === goalId) ?? GOALS[0];
  const progressPct = goal.target > 0
    ? Math.min(100, (projectedAtRetirement / goal.target) * 100)
    : 0;
  const onTrack = projectedAtRetirement >= goal.target;
  const shortfall = Math.max(0, goal.target - projectedAtRetirement);
  const neededMonthly = requiredMonthly(goal.target, yearsToRetirement);
  const extraNeeded = Math.max(0, neededMonthly - monthlyCurrent);

  return (
    <>
      <AnimatePresence>
        {yourGoalOpen && !splitMode && (
          <motion.div
            key="goal-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setYourGoalOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {yourGoalOpen && (
          <motion.div
            key="goal-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="goal-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              <button className={styles.closeBtn} onClick={() => setYourGoalOpen(false)} aria-label="Close">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Plan ahead</span>
                <h2 id="goal-title" className={styles.title}>What are you saving for?</h2>
                <p className={styles.subtitle}>Pick a goal. We&apos;ll show whether your current pace gets you there — and what it would take if it doesn&apos;t.</p>
              </div>
            </header>

            <div className={styles.body}>
              {/* ── Goals grid ─────────────────────────────────── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>01</span>
                  <h3 className={styles.sectionTitle}>Choose a goal</h3>
                </div>
                <div className={styles.goalGrid} role="radiogroup" aria-label="Savings goal">
                  {GOALS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={g.id === goalId}
                      className={styles.goalTile}
                      data-active={g.id === goalId}
                      onClick={() => setGoalId(g.id)}
                    >
                      <span className={styles.goalLabel}>{g.label}</span>
                      <span className={styles.goalHint}>{g.hint}</span>
                      <span className={styles.goalTarget}>{formatUGX(g.target)}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Age ───────────────────────────────────────── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h3 className={styles.sectionTitle}>Your age</h3>
                  <span className={styles.sectionAside}>Retirement at {RETIREMENT_AGE}</span>
                </div>
                <div className={styles.ageControl}>
                  <input
                    type="range"
                    min={18}
                    max={RETIREMENT_AGE - 1}
                    value={age}
                    onChange={(e) => setAge(Number.parseInt(e.target.value, 10))}
                    className={styles.ageSlider}
                    aria-label="Your age"
                    aria-valuemin={18}
                    aria-valuemax={RETIREMENT_AGE - 1}
                    aria-valuenow={age}
                    aria-valuetext={`${age} years old, ${yearsToRetirement} years until retirement`}
                  />
                  <div className={styles.ageValue}>
                    <span className={styles.ageNum}>{age}</span>
                    <span className={styles.ageUnit}>years old · {yearsToRetirement} to go</span>
                  </div>
                </div>
              </section>

              {/* ── Projection ────────────────────────────────── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>03</span>
                  <h3 className={styles.sectionTitle}>At your current pace</h3>
                </div>

                {!schedule?.amount ? (
                  <div className={styles.projectionEmpty}>
                    <span className={styles.projectionEmptyTitle}>No contribution schedule yet</span>
                    <span className={styles.projectionEmptyText}>
                      Set up a schedule to project your retirement balance and see goal progress.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className={styles.projectionRow}>
                      <span className={styles.projectionMonthly}>
                        <span className={styles.projectionMonthlyLabel}>Contributing</span>
                        <span className={styles.projectionMonthlyValue}>{formatUGX(monthlyCurrent)}/mo</span>
                      </span>
                      <span className={styles.projectionArrow} aria-hidden="true">
                        <svg viewBox="0 0 16 8" width="24" height="12" fill="none">
                          <path d="M0 4h14M10 0l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span className={styles.projectionFuture}>
                        <span className={styles.projectionFutureLabel}>At age {RETIREMENT_AGE}</span>
                        <span className={styles.projectionFutureValue}>{formatUGX(projectedAtRetirement)}</span>
                      </span>
                    </div>

                    {/* Progress bar toward the goal */}
                    <div className={styles.progressWrap} data-on-track={onTrack || undefined}>
                      <div className={styles.progressBar}>
                        <motion.div
                          className={styles.progressFill}
                          data-on-track={onTrack || undefined}
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                        />
                      </div>
                      <div className={styles.progressMeta}>
                        <span className={styles.progressPct}>{progressPct.toFixed(0)}%</span>
                        <span className={styles.progressOfGoal}>of {goal.label.toLowerCase()} · {formatUGX(goal.target)}</span>
                      </div>
                    </div>

                    {/* Verdict */}
                    <div className={styles.verdict} data-on-track={onTrack || undefined}>
                      {onTrack ? (
                        <>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={styles.verdictIcon}>
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                            <path d="M5 8l2 2 4-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                          </svg>
                          <div>
                            <strong>You&apos;re on track.</strong>{' '}
                            <span>You&apos;ll reach {goal.label.toLowerCase()} with room to spare.</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={styles.verdictIcon}>
                            <path d="M8 2l6 11H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
                            <path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          </svg>
                          <div>
                            <strong>{formatUGX(shortfall)} short.</strong>{' '}
                            <span>
                              Contribute <strong>{formatUGXExact(Math.round(extraNeeded / 1000) * 1000)} more per month</strong> to reach this goal.
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.doneBtn} onClick={() => setYourGoalOpen(false)}>
                Done
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
