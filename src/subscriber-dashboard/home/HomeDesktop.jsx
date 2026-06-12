import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX } from '../../utils/currency';
import { useCountUp } from '../../hooks/useCountUp';
import InfoTip from '../../components/InfoTip';
import MetricTile from '../../dashboard/shared/MetricTile';
import EmployerBenefitsWidget from './widgets/EmployerBenefitsWidget';
import TopUpWidget from './widgets/TopUpWidget';
import CoPilotWidget from './widgets/CoPilotWidget';
import PoliciesWidget from './widgets/PoliciesWidget';
import ActivityWidget from './widgets/ActivityWidget';
import styles from './HomeDesktop.module.css';

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
};

// KPI glyphs. Stroke-only line icons (tinted per-tile by each MetricTile's
// explicit accent), kept aria-hidden — the visible label carries the meaning.
// Sized to the MetricTile 36px icon chip, matching the agent HomeDesktop tiles.
const BalanceIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <rect x="2.5" y="5" width="15" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M13.5 10h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const RetirementIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 5.5V10l3 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const EmergencyIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <path d="M10 2.5l5.5 2.2v3.6c0 3.6-2.3 6.4-5.5 7.7-3.2-1.3-5.5-4.1-5.5-7.7V4.7L10 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 7v3.4M8.3 8.7h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const CoverIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <path d="M10 16.5s-6-3.7-6-8.1A3 3 0 0110 6.4a3 3 0 016 2c0 4.4-6 8.1-6 8.1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/**
 * HomeDesktop — the >=1024px subscriber Home tab-root.
 *
 * Mirrors the agent HomeDesktop: a plain page heading (eyebrow / h1 / subtitle),
 * a 4-up KPI tile row sourced from the same subscriber record the mobile dome
 * reads, then a responsive grid that REUSES the shipped Home widgets
 * (TopUp / Co-Pilot / Policies / Activity / EmployerBenefits) so every figure +
 * action stays in lockstep with mobile.
 *
 * The shipped mobile Home (PulseCard dome + stacked widgets) is left untouched —
 * this is a wider surface only, gated on >=1024px by HomePage. The caller passes
 * the resolved subscriber, so this component never re-fetches or re-handles the
 * loading / error states (HomePage owns those).
 */
export default function HomeDesktop({ subscriber }) {
  const reduceMotion = useReducedMotion();
  const itemVariants = reduceMotion ? undefined : item;

  const sub = subscriber || {};
  const net = sub.netBalance || 0;
  const cover = sub.insurance?.cover || 0;

  // Balance count-up + growth — mirrors the mobile PulseCard's selectors exactly
  // so desktop and phone never disagree. useCountUp returns 0 under reduced
  // motion (run=false), so we snap to the resolved balance in that case.
  const counted = useCountUp(net, 1100, !reduceMotion);
  const balanceDisplay = formatUGX(reduceMotion ? net : counted, { compact: false });

  const units = sub.unitsHeld || 0;
  const netInvested = Math.max(0, (sub.totalContributions || 0) - (sub.totalWithdrawals || 0));
  const growth = net - netInvested;
  const growthPct = netInvested > 0 ? (growth / netInvested) * 100 : 0;

  // Retirement / Emergency are the two pots that sum to net balance
  // (data-model: netBalance = retirementBalance + emergencyBalance), so a
  // share-of-balance figure is exact rather than an approximation.
  const retPct = net > 0 ? Math.round(((sub.retirementBalance || 0) / net) * 100) : 0;
  const emerPct = net > 0 ? Math.round(((sub.emergencyBalance || 0) / net) * 100) : 0;

  const premium = sub.insurance?.premiumMonthly || 0;
  const coverContext = cover > 0
    ? (premium > 0 ? `Active · ${formatUGX(premium)}/mo` : 'Active cover')
    : 'Not active';

  const balanceStatRow = (
    <>
      <span>
        <strong>{units.toLocaleString('en-UG', { maximumFractionDigits: 2 })}</strong> units
      </span>
      {netInvested > 0 && (
        <InfoTip
          style={{ color: growth >= 0 ? 'var(--color-positive)' : 'var(--color-amber)' }}
          content={(
            <>
              <b className={styles.tipHead}>Investment growth</b>
              <span>
                How your balance compares to what you&rsquo;ve put in — net
                contributions of {formatUGX(netInvested, { compact: false })}.
              </span>
            </>
          )}
        >
          {growth >= 0 ? '+' : '−'}{Math.abs(growthPct).toFixed(1)}% growth
        </InfoTip>
      )}
    </>
  );

  const supporting = [
    {
      key: 'retirement', icon: RetirementIcon, accent: 'teal',
      label: 'Retirement', value: formatUGX(sub.retirementBalance || 0),
      context: net > 0 ? `${retPct}% of balance` : 'Long-term pension',
    },
    {
      key: 'emergency', icon: EmergencyIcon, accent: 'lavender',
      label: 'Emergency', value: formatUGX(sub.emergencyBalance || 0),
      context: net > 0 ? `${emerPct}% of balance` : 'Short-term savings',
    },
    {
      key: 'cover', icon: CoverIcon, accent: 'green',
      label: 'Insurance cover', value: cover > 0 ? formatUGX(cover) : '—',
      context: coverContext,
    },
  ];

  const firstName = (sub.name || '').trim().split(' ')[0];

  return (
    <motion.div
      className={styles.page}
      variants={reduceMotion ? undefined : stagger}
      initial={reduceMotion ? false : 'initial'}
      animate={reduceMotion ? false : 'animate'}
    >
      <motion.header variants={itemVariants} className={styles.head}>
        <p className={styles.eyebrow}>Your savings</p>
        <h1 className={styles.title}>{firstName ? `Hi ${firstName}` : 'Home'}</h1>
        <p className={styles.subtitle}>A snapshot of your balance, contributions and protection.</p>
      </motion.header>

      <motion.div variants={itemVariants} className={styles.kpiRow}>
        <MetricTile
          variant="primary"
          icon={BalanceIcon}
          label="Total balance"
          value={net > 0 ? balanceDisplay : '—'}
          statRow={net > 0 ? balanceStatRow : null}
          className={styles.primaryTile}
        />
        {supporting.map((m) => (
          <MetricTile
            key={m.key}
            accent={m.accent}
            icon={m.icon}
            label={m.label}
            value={m.value}
            context={m.context}
          />
        ))}
      </motion.div>

      <div className={styles.grid}>
        <motion.div variants={itemVariants} className={styles.slotFull}>
          <TopUpWidget subscriber={sub} />
        </motion.div>

        <motion.div variants={itemVariants} className={styles.slotFull}>
          <CoPilotWidget />
        </motion.div>

        {sub.employerId && (
          <motion.div variants={itemVariants} className={styles.slotFull}>
            <EmployerBenefitsWidget subscriber={sub} />
          </motion.div>
        )}

        <motion.div variants={itemVariants} className={styles.slotHalf}>
          <PoliciesWidget subscriber={sub} />
        </motion.div>
        <motion.div variants={itemVariants} className={styles.slotHalf}>
          <ActivityWidget subscriber={sub} />
        </motion.div>
      </div>
    </motion.div>
  );
}
