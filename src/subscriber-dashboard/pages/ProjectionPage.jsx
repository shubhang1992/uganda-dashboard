import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact, calcFV, MONTHLY_RATE } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import PageHeader from '../shell/PageHeader';
import styles from './ProjectionPage.module.css';

const RETIREMENT_AGE = 60;
const FALLBACK_AGE = 30;

const GOALS = [
  { id: 'emergency',  label: 'Emergency fund',         hint: '6 months of income',            target: 3_000_000 },
  { id: 'car',        label: 'Buy a car',              hint: 'Mid-range sedan or pickup',     target: 50_000_000 },
  { id: 'education',  label: "Children's education",   hint: 'University through graduation', target: 120_000_000 },
  { id: 'house',      label: 'Buy a house',            hint: 'Family home in Kampala',        target: 250_000_000 },
  { id: 'retirement', label: 'Comfortable retirement', hint: '20 years of living costs',      target: 500_000_000 },
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

export default function ProjectionPage() {
  const navigate = useNavigate();
  const { data: subscriber } = useCurrentSubscriber();
  const [goalId, setGoalId] = useState('house');

  const age = typeof subscriber?.age === 'number' ? subscriber.age : FALLBACK_AGE;
  const yearsToRetirement = Math.max(0, RETIREMENT_AGE - age);

  const schedule = subscriber?.contributionSchedule;
  const monthlyCurrent = useMemo(() => monthlyFromSchedule(schedule), [schedule]);
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
    <div className={styles.page}>
      <PageHeader
        title="Goal projection"
        subtitle={`Retirement at ${RETIREMENT_AGE} · ${yearsToRetirement} yrs to go`}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {/* 01 Goal picker */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIdx}>01</span>
              <h2 className={styles.sectionTitle}>Pick a goal</h2>
            </div>
            <div className={styles.goalChipRow} role="radiogroup" aria-label="Savings goal">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={g.id === goalId}
                  className={styles.goalChip}
                  data-active={g.id === goalId}
                  onClick={() => setGoalId(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className={styles.goalSummary}>
              <div className={styles.goalSummaryText}>
                <span className={styles.goalSummaryLabel}>{goal.label}</span>
                <span className={styles.goalSummaryHint}>{goal.hint}</span>
              </div>
              <div className={styles.goalSummaryTarget}>
                <span className={styles.goalSummaryTargetLabel}>Target</span>
                <span className={styles.goalSummaryTargetValue}>{formatUGX(goal.target)}</span>
              </div>
            </div>
          </section>

          {!schedule?.amount ? (
            <section className={styles.emptyCard}>
              <span className={styles.emptyEyebrow}>No contribution schedule yet</span>
              <span className={styles.emptyCopy}>
                Set up a schedule first to see whether you reach this goal.
              </span>
              <button
                type="button"
                className={styles.emptyCta}
                onClick={() => navigate('/dashboard/save/schedule')}
              >
                Set your schedule
                <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </section>
          ) : (
            <>
              {/* 02 Current pace */}
              <section className={styles.paceCard}>
                <div className={styles.paceRow}>
                  <span className={styles.paceLabel}>You contribute</span>
                  <span className={styles.paceValue}>
                    {formatUGX(monthlyCurrent)} <span className={styles.paceUnit}>/ month</span>
                  </span>
                </div>

                <div className={styles.paceProjection}>
                  <span className={styles.paceProjectionLabel}>Projected at age {RETIREMENT_AGE}</span>
                  <span className={styles.paceProjectionValue}>{formatUGX(projectedAtRetirement)}</span>
                </div>

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
                    <span className={styles.progressOfGoal}>
                      of {goal.label.toLowerCase()} · {formatUGX(goal.target)}
                    </span>
                  </div>
                </div>

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
                        <strong>{formatUGX(shortfall)} short</strong>{' '}
                        <span>of your goal at age {RETIREMENT_AGE}.</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* 03 What it would take */}
              {!onTrack && (
                <section className={styles.requiredCard}>
                  <span className={styles.requiredEyebrow}>To reach this goal, contribute</span>
                  <span className={styles.requiredValue}>
                    {formatUGXExact(Math.round(neededMonthly / 1000) * 1000)}
                    <span className={styles.requiredUnit}> / month</span>
                  </span>
                  <span className={styles.requiredDelta}>
                    {extraNeeded > 0 ? (
                      <>+{formatUGXExact(Math.round(extraNeeded / 1000) * 1000)} more than today</>
                    ) : (
                      'Your current pace already covers this.'
                    )}
                  </span>
                  <button
                    type="button"
                    className={styles.requiredCta}
                    onClick={() => navigate('/dashboard/save/schedule')}
                  >
                    Adjust contributions
                    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </section>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
