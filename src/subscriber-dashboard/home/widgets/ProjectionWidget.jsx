import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, calcFV, monthlyEquivalent } from '../../../utils/finance';
import { RETIREMENT_AGE } from '../../../constants/savings';
import styles from './ProjectionWidget.module.css';

// Mirrors STORAGE_KEY in src/signup/SignupContext.jsx — the signup wizard
// persists DOB here, so we can use the user's actual date of birth instead of
// falling back to mock subscriber.age.
const SIGNUP_STORAGE_KEY = 'uganda-pensions-signup';

function ageFromDob(dob) {
  if (!dob) return null;
  const t = new Date(dob).getTime();
  if (!Number.isFinite(t)) return null;
  const years = (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
  if (years < 0 || years > 120) return null;
  return Math.floor(years);
}

function readSignupDob() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIGNUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.dob || null;
  } catch {
    return null;
  }
}

export default function ProjectionWidget({ subscriber }) {
  const navigate = useNavigate();

  const dob = useMemo(() => readSignupDob(), []);
  const ageFromSignup = useMemo(() => ageFromDob(dob), [dob]);
  const age = ageFromSignup
    ?? (typeof subscriber?.age === 'number' ? subscriber.age : 30);

  const minAge = age + 1;
  const maxAge = RETIREMENT_AGE;
  const canProject = minAge <= maxAge;

  const [selectedAge, setSelectedAge] = useState(() =>
    Math.min(Math.max(age + 10, minAge), maxAge)
  );

  const balance = subscriber?.netBalance || 0;
  const monthly = useMemo(() => monthlyEquivalent(subscriber?.contributionSchedule), [subscriber]);

  const years = canProject ? Math.max(0, selectedAge - age) : 0;
  const futureValue = balance + calcFV(monthly, years);
  const growth = Math.max(0, futureValue - balance);
  const isRetirement = selectedAge === RETIREMENT_AGE;

  return (
    <section className={styles.card} aria-labelledby="proj-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Future value
        </span>
        <h3 id="proj-title" className={styles.title}>Where you&apos;re heading</h3>
      </header>

      {canProject ? (
        <>
          <motion.div
            key={selectedAge}
            className={styles.featured}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <span className={styles.featuredMesh} aria-hidden="true" />
            <span className={styles.featuredGrain} aria-hidden="true" />
            <div className={styles.featuredText}>
              <span className={styles.featuredEyebrow}>
                <span className={styles.featuredDot} aria-hidden="true" />
                At age {selectedAge}{isRetirement ? ' (retirement)' : ''} · in {years} {years === 1 ? 'year' : 'years'}
              </span>
              <span className={styles.featuredAmount}>{formatUGX(Math.round(futureValue))}</span>
              <span className={styles.featuredHint}>
                {monthly > 0
                  ? `+${formatUGX(Math.round(growth))} projected growth`
                  : 'Set a contribution schedule to see growth.'}
              </span>
            </div>
          </motion.div>

          <div className={styles.slider} role="group" aria-label="Project balance to age">
            <input
              type="range"
              min={minAge}
              max={maxAge}
              step={1}
              value={selectedAge}
              onChange={(e) => setSelectedAge(Number(e.target.value))}
              className={styles.sliderInput}
              style={{ '--progress': `${((selectedAge - minAge) / Math.max(1, maxAge - minAge)) * 100}%` }}
              aria-label={`Future value at age ${selectedAge}`}
              aria-valuemin={minAge}
              aria-valuemax={maxAge}
              aria-valuenow={selectedAge}
              aria-valuetext={`Age ${selectedAge}, in ${years} ${years === 1 ? 'year' : 'years'}`}
            />
            <div className={styles.sliderEnds} aria-hidden="true">
              <span>Age {minAge}</span>
              <span className={styles.sliderEndRetire}>Retirement {maxAge}</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.featured} data-empty="true">
          <div className={styles.featuredText}>
            <span className={styles.featuredEyebrow}>Today · age {age}</span>
            <span className={styles.featuredAmount}>{formatUGX(Math.round(balance))}</span>
            <span className={styles.featuredHint}>
              You&apos;ve reached retirement age. Your balance is available to draw down.
            </span>
          </div>
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
