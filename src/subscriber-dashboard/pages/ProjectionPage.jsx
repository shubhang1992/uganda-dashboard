import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
} from 'recharts';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact, calcFV, MONTHLY_RATE, monthlyEquivalent } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { RETIREMENT_AGE } from '../../constants/savings';
import { goBackOrFallback } from '../shell/navigation';
import PageHeader from '../../components/PageHeader';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import styles from './ProjectionPage.module.css';

const FALLBACK_AGE = 30;

// Annual growth rate the projection assumes (MONTHLY_RATE compounds to this).
const ANNUAL_GROWTH_PCT = Math.round(MONTHLY_RATE * 12 * 100);

const GOALS = [
  { id: 'emergency',  label: 'Emergency fund',         hint: '6 months of income',            target: 3_000_000 },
  { id: 'car',        label: 'Buy a car',              hint: 'Mid-range sedan or pickup',     target: 50_000_000 },
  { id: 'education',  label: "Children's education",   hint: 'University through graduation', target: 120_000_000 },
  { id: 'house',      label: 'Buy a house',            hint: 'Family home in Kampala',        target: 250_000_000 },
  { id: 'retirement', label: 'Comfortable retirement', hint: '20 years of living costs',      target: 500_000_000 },
];

function requiredMonthly(target, years) {
  const n = years * 12;
  if (n <= 0 || target <= 0) return 0;
  const factor = (Math.pow(1 + MONTHLY_RATE, n) - 1) / MONTHLY_RATE;
  return factor > 0 ? target / factor : 0;
}

// Recharts SVG <stop> needs a literal colour value (it can't resolve a CSS var
// in a gradient stop), so read the brand tokens off :root at runtime with the
// current hex as a fallback. Token map:
//   --color-indigo-soft  (#5E63A8) → area fill gradient top
//   --color-indigo       (#292867) → area stroke
//   --color-green        (#2E8B57) → goal-target reference line
function readToken(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function ProjectionPage() {
  const navigate = useNavigate();
  const { data: subscriber } = useCurrentSubscriber();
  const [goalId, setGoalId] = useState('house');

  // Resolve brand tokens once for the Recharts SVG (see readToken note above).
  const chartColors = useMemo(() => ({
    fill: readToken('--color-indigo-soft', '#5E63A8'),
    stroke: readToken('--color-indigo', '#292867'),
    target: readToken('--color-green', '#2E8B57'),
  }), []);

  // Disable chart animation when the user prefers reduced motion.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const age = typeof subscriber?.age === 'number' ? subscriber.age : FALLBACK_AGE;
  const yearsToRetirement = Math.max(0, RETIREMENT_AGE - age);
  const atOrPastRetirement = yearsToRetirement === 0;

  const balance = subscriber?.netBalance || 0;
  const schedule = subscriber?.contributionSchedule;
  const monthlyCurrent = useMemo(() => monthlyEquivalent(schedule), [schedule]);
  const projectedAtRetirement = useMemo(
    () => balance + calcFV(monthlyCurrent, yearsToRetirement),
    [balance, monthlyCurrent, yearsToRetirement],
  );

  const goal = GOALS.find((g) => g.id === goalId) ?? GOALS[0];
  const progressPct = goal.target > 0
    ? Math.min(100, (projectedAtRetirement / goal.target) * 100)
    : 0;
  const onTrack = projectedAtRetirement >= goal.target;
  const shortfall = Math.max(0, goal.target - projectedAtRetirement);
  const neededMonthly = requiredMonthly(goal.target, yearsToRetirement);
  const extraNeeded = Math.max(0, neededMonthly - monthlyCurrent);

  // Year-by-year balance trajectory from today to retirement. Used by the area
  // chart so users can see how the balance grows, not just the endpoint.
  const trajectory = useMemo(() => {
    if (yearsToRetirement <= 0) return [];
    const points = [];
    for (let t = 0; t <= yearsToRetirement; t += 1) {
      points.push({
        age: age + t,
        balance: Math.round(balance + calcFV(monthlyCurrent, t)),
      });
    }
    return points;
  }, [age, balance, monthlyCurrent, yearsToRetirement]);

  function handleBack() {
    goBackOrFallback(navigate, '/dashboard');
  }

  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        title="Goal projection"
        eyebrow="AT YOUR PACE, BY 60"
        prefix={atOrPastRetirement ? undefined : 'UGX'}
        amount={atOrPastRetirement ? undefined : formatUGX(projectedAtRetirement).replace(/^UGX\s*/, '')}
        subtitle={
          atOrPastRetirement
            ? `You're at retirement age — current balance ${formatUGX(balance)}`
            : `Retirement at ${RETIREMENT_AGE} · ${yearsToRetirement} yrs to go`
        }
        statRow={
          atOrPastRetirement || monthlyCurrent <= 0 ? undefined : (
            <span>≈ <strong>{formatUGX(monthlyCurrent)}</strong> / month for life</span>
          )
        }
        onBack={handleBack}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {/* 01 Goal picker */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIdx}>01</span>
              <h2 className={styles.sectionTitle}>Pick a goal</h2>
            </div>
            <PillChipGroup label="Savings goal" layout="grid" columns={2} className={styles.goalChipRow}>
              {GOALS.map((g) => (
                <PillChip
                  key={g.id}
                  selected={g.id === goalId}
                  onClick={() => setGoalId(g.id)}
                >
                  {g.label}
                </PillChip>
              ))}
            </PillChipGroup>

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
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h2 className={styles.sectionTitle}>Your trajectory</h2>
                </div>

                {trajectory.length > 1 && (
                  <div className={styles.chartWrap}>
                    <div className={styles.chartFrame} aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trajectory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="proj-fill" x1="0" y1="0" x2="0" y2="1">
                              {/* --color-indigo-soft */}
                              <stop offset="0%" stopColor={chartColors.fill} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={chartColors.fill} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="age"
                            tick={{ fontSize: 10, fill: 'var(--color-gray)' }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis hide domain={[0, Math.max(goal.target, projectedAtRetirement) * 1.1]} />
                          <ReferenceLine
                            y={goal.target}
                            stroke={chartColors.target /* --color-green */}
                            strokeDasharray="4 4"
                            strokeWidth={1.25}
                          />
                          <Tooltip
                            formatter={(v) => formatUGX(v)}
                            labelFormatter={(label) => `Age ${label}`}
                            contentStyle={{
                              background: 'var(--color-white)',
                              border: '1px solid var(--color-lavender)',
                              borderRadius: 'var(--radius-md)',
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.8rem',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="balance"
                            stroke={chartColors.stroke /* --color-indigo */}
                            strokeWidth={2}
                            fill="url(#proj-fill)"
                            isAnimationActive={!reduceMotion}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <span className={styles.chartLegend}>
                      <span className={styles.chartLegendDot} data-tone="indigo" /> Projected balance
                      <span className={styles.chartLegendDot} data-tone="green" /> {goal.label} target
                    </span>
                  </div>
                )}

                {/* Stat grid */}
                <div className={styles.statGrid}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Today</span>
                    <span className={styles.statValue}>{formatUGX(balance)}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Years to {RETIREMENT_AGE}</span>
                    <span className={styles.statValue}>{yearsToRetirement}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Monthly</span>
                    <span className={styles.statValue}>{formatUGX(monthlyCurrent)}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Growth</span>
                    <span className={styles.statValue} data-tone="green">+{ANNUAL_GROWTH_PCT}% / yr</span>
                  </div>
                </div>

                <div className={styles.progressWrap} data-on-track={onTrack || undefined}>
                  <div className={styles.progressBar}>
                    <motion.div
                      className={styles.progressFill}
                      data-on-track={onTrack || undefined}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT_EXPO }}
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
