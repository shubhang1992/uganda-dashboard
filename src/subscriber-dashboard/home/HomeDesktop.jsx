import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX } from '../../utils/currency';
import { deriveInvestmentGrowth } from '../../utils/finance';
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
const InvestedIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <ellipse cx="10" cy="5.5" rx="5.5" ry="2.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.5 5.5v4c0 1.24 2.46 2.25 5.5 2.25s5.5-1.01 5.5-2.25v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.5 9.5v4c0 1.24 2.46 2.25 5.5 2.25s5.5-1.01 5.5-2.25v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const SplitIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <rect x="3" y="6" width="5.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11.5" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
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
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const itemVariants = reduceMotion ? undefined : item;

  const sub = subscriber || {};
  const net = sub.netBalance || 0;
  const cover = sub.insurance?.cover || 0;
  const hasCover = cover > 0;

  // Balance count-up + growth — mirrors the mobile PulseCard's selectors exactly
  // so desktop and phone never disagree. useCountUp returns 0 under reduced
  // motion (run=false), so we snap to the resolved balance in that case.
  const counted = useCountUp(net, 1100, !reduceMotion);
  const balanceDisplay = formatUGX(reduceMotion ? net : counted, { compact: false });

  const units = sub.unitsHeld || 0;
  // Invested principal + growth are derived (the demo has no real cost basis);
  // the same helper feeds the mobile PulseCard so the two never disagree.
  const { invested, growth, growthPct } = deriveInvestmentGrowth(sub);

  // Retirement / Emergency are the two pots that sum to net balance
  // (data-model: netBalance = retirementBalance + emergencyBalance), so a
  // share-of-balance figure is exact rather than an approximation.
  // Round retirement directly, then derive emergency as its COMPLEMENT so the
  // two labels always sum to exactly 100 — rounding each independently can
  // produce 99% or 101% (e.g. 83.5% / 16.5% → 84 + 17 = 101).
  const retPct = net > 0 ? Math.round(((sub.retirementBalance || 0) / net) * 100) : 0;
  const emerPct = net > 0 ? 100 - retPct : 0;

  const premium = sub.insurance?.premiumMonthly || 0;
  const coverContext = cover > 0
    ? (premium > 0 ? `Active · ${formatUGX(premium)}/mo` : 'Active cover')
    : 'Not active';

  const investedStatRow = (
    <>
      <span>
        <strong>{units.toLocaleString('en-UG', { maximumFractionDigits: 2 })}</strong> units
      </span>
      {growth > 0 && (
        <InfoTip
          style={{ color: 'var(--color-green)' }}
          content={(
            <>
              <b className={styles.tipHead}>Investment growth</b>
              <span>
                How your balance compares with what you&rsquo;ve put in — about{' '}
                {formatUGX(invested, { compact: false })} contributed.
              </span>
            </>
          )}
        >
          +{growthPct.toFixed(1)}% growth
        </InfoTip>
      )}
    </>
  );

  // Retirement + Emergency are the two pots that sum to net balance, now shown
  // together as one split card (a proportional bar + a per-pot legend).
  const retirement = sub.retirementBalance || 0;
  const emergency = sub.emergencyBalance || 0;
  const splitBody = net > 0 ? (
    <div className={styles.split}>
      <div
        className={styles.splitBar}
        role="img"
        aria-label={`Retirement ${retPct}%, Emergency ${emerPct}%`}
      >
        <span className={styles.splitSegRet} style={{ width: `${retPct}%` }} />
        <span className={styles.splitSegEmer} style={{ width: `${emerPct}%` }} />
      </div>
      <ul className={styles.splitLegend}>
        <li>
          <span className={`${styles.dot} ${styles.dotRet}`} aria-hidden="true" />
          <span className={styles.splitName}>Retirement</span>
          <span className={styles.splitVal}>{formatUGX(retirement)} · {retPct}%</span>
        </li>
        <li>
          <span className={`${styles.dot} ${styles.dotEmer}`} aria-hidden="true" />
          <span className={styles.splitName}>Emergency</span>
          <span className={styles.splitVal}>{formatUGX(emergency)} · {emerPct}%</span>
        </li>
      </ul>
    </div>
  ) : null;

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
        {/* 1 · Total balance — the hero figure on its own */}
        <MetricTile
          variant="primary"
          icon={BalanceIcon}
          label="Total balance"
          value={net > 0 ? balanceDisplay : '—'}
          context={net > 0 ? 'Across retirement & emergency' : 'Start saving to grow your pot'}
          className={styles.primaryTile}
        />

        {/* 2 · Amount invested — what you put in, carrying units + growth */}
        <MetricTile
          accent="indigo"
          icon={InvestedIcon}
          label="Amount invested"
          value={net > 0 ? formatUGX(invested) : '—'}
          statRow={net > 0 ? investedStatRow : null}
        />

        {/* 3 · Retirement vs Emergency split */}
        <MetricTile
          accent="teal"
          icon={SplitIcon}
          label="Savings split"
          context={net > 0 ? null : 'Long-term + short-term savings'}
        >
          {splitBody}
        </MetricTile>

        {/* 4 · Insurance cover — the figure, or an Add-cover CTA when unconfigured */}
        {hasCover ? (
          <MetricTile
            accent="green"
            icon={CoverIcon}
            label="Insurance cover"
            value={formatUGX(cover)}
            context={coverContext}
          />
        ) : (
          <button
            type="button"
            className={styles.coverCta}
            onClick={() => navigate('/dashboard/settings/insurance')}
            aria-label="Add insurance cover"
          >
            <MetricTile accent="green" icon={CoverIcon} label="Insurance cover">
              <div className={styles.coverCtaBody}>
                <span className={styles.coverCtaAction}>
                  Add cover
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={styles.coverCtaHint}>Protect your family from UGX 2,000/mo</span>
              </div>
            </MetricTile>
          </button>
        )}
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
