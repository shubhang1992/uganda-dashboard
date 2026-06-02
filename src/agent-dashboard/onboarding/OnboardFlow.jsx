import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../../signup/SignupContext';
import PageHeader from '../../components/PageHeader';
import AwarenessCheck from './AwarenessCheck';
import OnboardKycFlow from './OnboardKycFlow';
import OnboardScheduleStep from './OnboardScheduleStep';
import OnboardingComplete from './OnboardingComplete';
import styles from '../pages/OnboardPage.module.css';

const STAGES = [
  { id: 'awareness', label: 'Awareness' },
  { id: 'kyc', label: 'KYC' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'done', label: 'Complete' },
];

function getStageIndex(id) {
  return STAGES.findIndex((s) => s.id === id);
}

export default function OnboardFlow() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [stage, setStage] = useState('awareness');
  const [awareness, setAwareness] = useState({
    answers: { q1: null, q2: null, q3: null, q4: null, q5: null },
  });

  const stageIdx = getStageIndex(stage);
  const subscriberName = (signup.fullName || '').trim();

  function startAnother() {
    signup.reset();
    setStage('awareness');
    setAwareness({
      answers: { q1: null, q2: null, q3: null, q4: null, q5: null },
    });
  }

  function handleClose() {
    navigate('/dashboard');
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Onboard a new subscriber"
        subtitle={STAGES[stageIdx]?.label && `${stageIdx + 1} of ${STAGES.length} · ${STAGES[stageIdx].label}`}
        fallback="/dashboard"
      />

      <ol className={styles.stepper} aria-label="Onboarding progress">
        {STAGES.map((s, i) => {
          const state = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
          return (
            <li key={s.id} className={styles.stepperItem} data-state={state}>
              <span className={styles.stepperDot} aria-hidden="true">
                {state === 'done' ? (
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                    <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={styles.stepperLabel}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className={styles.body}>
        <AnimatePresence mode="wait">
          {stage === 'awareness' && (
            <motion.div
              key="awareness"
              className={styles.stageWrap}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            >
              <AwarenessCheck
                state={awareness}
                onChange={setAwareness}
                onContinue={() => setStage('kyc')}
              />
            </motion.div>
          )}

          {stage === 'kyc' && (
            <motion.div
              key="kyc"
              className={styles.stageWrap}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            >
              <OnboardKycFlow
                onComplete={() => setStage('schedule')}
                onBackToAwareness={() => setStage('awareness')}
              />
            </motion.div>
          )}

          {stage === 'schedule' && (
            <motion.div
              key="schedule"
              className={styles.stageWrap}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            >
              <OnboardScheduleStep
                onContinue={() => setStage('done')}
                onCancel={() => setStage('kyc')}
              />
            </motion.div>
          )}

          {stage === 'done' && (
            <motion.div
              key="done"
              className={styles.stageWrap}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            >
              <OnboardingComplete
                subscriberName={subscriberName || 'New Subscriber'}
                awareness={awareness}
                schedule={signup.contributionSchedule}
                onAnother={startAnother}
                onClose={handleClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
