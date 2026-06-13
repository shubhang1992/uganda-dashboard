import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { formatUGX } from '../../../utils/currency';
import { deriveInvestmentGrowth } from '../../../utils/finance';

import { useCountUp } from '../../../hooks/useCountUp';
import HeroCapsule from '../../../components/HeroCapsule';
import styles from './PulseCard.module.css';

export default function PulseCard({ subscriber }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const balance = subscriber?.netBalance || 0;
  // Under reduced-motion, snap straight to the final balance (run=false) so the
  // rAF count-up doesn't animate. The hook still returns 0 when run is false, so
  // we fall back to the resolved balance below.
  const counted = useCountUp(balance, 1100, !reduce);

  const units = subscriber?.unitsHeld || 0;
  // Invested principal + growth are derived (the demo has no real cost basis);
  // shared with desktop HomeDesktop so the two surfaces never disagree.
  const { invested: netInvested, growth, growthPct } = deriveInvestmentGrowth(subscriber);

  // useCountUp returns 0 when run is false (reduced-motion), so snap to the
  // resolved balance in that case instead of showing a stuck "0".
  const amountLabel = Math.round(reduce ? balance : counted).toLocaleString('en-UG');

  // Personalised hero greeting in place of the old "Balance" caption; falls
  // back gracefully when the subscriber record has no name. ("Total balance"
  // still labels the figure below the amount.)
  const firstName = (subscriber?.name || '').trim().split(' ')[0];
  const greeting = firstName ? `Hi ${firstName}!` : 'Welcome back';

  const statRow = (
    <>
      <span>
        <strong>{units.toLocaleString('en-UG', { maximumFractionDigits: 2 })}</strong> units
      </span>
      <span>
        Invested <strong>{formatUGX(netInvested)}</strong>
      </span>
      <span style={{ color: growth >= 0 ? 'var(--color-green)' : 'var(--color-amber)' }}>
        {growth >= 0 ? '+' : '−'}{Math.abs(growthPct).toFixed(1)}% growth
      </span>
    </>
  );

  const helpIcon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );

  return (
    <section className={styles.wrap} aria-label="Your savings">
      <HeroCapsule
        title={greeting}
        eyebrow="Total balance"
        prefix="UGX"
        amount={amountLabel}
        statRow={statRow}
        menuIcon={helpIcon}
        menuLabel="Get help"
        onMenu={() => navigate('/dashboard/help')}
      />
    </section>
  );
}
