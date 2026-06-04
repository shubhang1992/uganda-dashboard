import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGXShort, formatUGX } from '../../utils/currency';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import PageHeader from '../../components/PageHeader';
import styles from './WithdrawalsHubPage.module.css';

const OPTIONS = [
  {
    id: 'savings',
    to: '/dashboard/withdraw/savings',
    title: 'Withdraw savings',
    description: 'Pull funds from your emergency or retirement bucket.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'claim',
    to: '/dashboard/withdraw/claim',
    title: 'File an insurance claim',
    description: 'Medical, accident, hospitalisation or critical illness.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function WithdrawalsHubPage() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { data: sub } = useCurrentSubscriber();

  const emergency = sub?.emergencyBalance || 0;
  const retirement = sub?.retirementBalance || 0;
  const available = emergency + retirement;
  const cover = sub?.insurance?.cover || 0;
  const insuranceActive = sub?.insurance?.status === 'active';

  const HINTS = {
    savings: `${formatUGX(emergency)} ready · ${formatUGX(retirement)} retirement`,
    claim: cover > 0
      ? `${formatUGX(cover)} cover ${insuranceActive ? 'active' : 'inactive'}`
      : 'No active cover',
  };

  const statRow = (
    <>
      <span>{formatUGX(emergency)} emergency</span>
      <span>
        <strong>{formatUGX(cover)}</strong> cover
      </span>
    </>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        title="Withdrawals"
        eyebrow="Available to withdraw"
        prefix="UGX"
        amount={formatUGXShort(available)}
        subtitle="Take money out, or file an insurance claim"
        statRow={statRow}
        fallback="/dashboard"
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {OPTIONS.map((opt, i) => (
            <motion.button
              key={opt.id}
              type="button"
              className={styles.card}
              onClick={() => navigate(opt.to)}
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 + i * 0.05, ease: EASE_OUT_EXPO }}
              whileHover={reducedMotion ? undefined : { y: -2 }}
            >
              <span className={styles.cardIcon}>{opt.icon}</span>
              <div className={styles.cardText}>
                <span className={styles.cardTitle}>{opt.title}</span>
                <span className={styles.cardDesc}>{opt.description}</span>
                <span className={styles.cardHint}>{HINTS[opt.id]}</span>
              </div>
              <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className={styles.cardArrow}>
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
