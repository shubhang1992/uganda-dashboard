import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, calcFV, monthlyEquivalent } from '../../../utils/finance';
import { RETIREMENT_AGE } from '../../../constants/savings';
import styles from './ProjectionWidget.module.css';

const ALL_HORIZONS = [
  { id: '5y',  label: '5 yrs',  years: 5  },
  { id: '10y', label: '10 yrs', years: 10 },
  { id: '20y', label: '20 yrs', years: 20 },
  { id: 'r',   label: `At ${RETIREMENT_AGE}`, years: null },
];

function horizonsForAge(age) {
  const yearsLeft = Math.max(0, RETIREMENT_AGE - age);
  if (yearsLeft <= 0) return [];
  return ALL_HORIZONS.filter((h) => h.years === null || h.years <= yearsLeft);
}

export default function ProjectionWidget({ subscriber }) {
  const navigate = useNavigate();
  const age = typeof subscriber?.age === 'number' ? subscriber.age : 30;
  const horizons = useMemo(() => horizonsForAge(age), [age]);
  const yearsToRetirement = Math.max(0, RETIREMENT_AGE - age);
  const defaultHorizonId =
    horizons.find((h) => h.id === '10y')?.id
    ?? horizons.find((h) => h.id === 'r')?.id
    ?? horizons[0]?.id
    ?? '5y';
  const [horizonId, setHorizonId] = useState(defaultHorizonId);

  const balance = subscriber?.netBalance || 0;
  const monthly = useMemo(() => monthlyEquivalent(subscriber?.contributionSchedule), [subscriber]);

  const horizon = horizons.find((h) => h.id === horizonId) ?? horizons[0];
  const years = horizon ? (horizon.years ?? yearsToRetirement) : 0;
  const futureValue = balance + calcFV(monthly, years);
  const growth = Math.max(0, futureValue - balance);

  return (
    <section className={styles.card} aria-labelledby="proj-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Future value
        </span>
        <h3 id="proj-title" className={styles.title}>Where you&apos;re heading</h3>
      </header>

      {horizons.length > 0 ? (
        <>
          <div className={styles.chips} role="radiogroup" aria-label="Time horizon">
            {horizons.map((h) => (
              <button
                key={h.id}
                type="button"
                role="radio"
                aria-checked={horizonId === h.id}
                className={styles.chip}
                data-active={horizonId === h.id}
                onClick={() => setHorizonId(h.id)}
              >
                {h.label}
              </button>
            ))}
          </div>

          <motion.div
            key={horizonId}
            className={styles.valueBlock}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <span className={styles.valueLabel}>
              {horizon?.id === 'r' ? `In ${years} years (age ${RETIREMENT_AGE})` : `In ${years} years`}
            </span>
            <span className={styles.valueAmount}>{formatUGX(Math.round(futureValue))}</span>
            {monthly > 0 ? (
              <span className={styles.valueGrowth}>
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2 9l3-3 2 2 3-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                +{formatUGX(Math.round(growth))} growth on top of today&apos;s balance
              </span>
            ) : (
              <span className={styles.valueHint}>Set a contribution schedule to see growth.</span>
            )}
          </motion.div>
        </>
      ) : (
        <div className={styles.valueBlock}>
          <span className={styles.valueLabel}>Today (age {age})</span>
          <span className={styles.valueAmount}>{formatUGX(Math.round(balance))}</span>
          <span className={styles.valueHint}>
            You&apos;ve reached retirement age. Your balance is available to draw down.
          </span>
        </div>
      )}

      <button
        type="button"
        className={styles.deepLink}
        onClick={() => navigate('/dashboard/projection')}
      >
        Plan toward a goal
        <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
          <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </section>
  );
}
