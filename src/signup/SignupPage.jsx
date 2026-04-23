import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/finance';
import { useAuth } from '../contexts/AuthContext';
import { SignupProvider, useSignup } from './SignupContext';
import SignupShell, { STEPS, AGENT_STEP, PENDING_REVIEW_STEP, getStepIndex } from './SignupShell';
import ContributionRoute from './contribution/ContributionRoute';

import IdUploadStep from './steps/IdUploadStep';
import ReviewStep from './steps/ReviewStep';
import NiraStep from './steps/NiraStep';
import OtpStep from './steps/OtpStep';
import LivenessStep from './steps/LivenessStep';
import AmlStep from './steps/AmlStep';
import BeneficiariesStep from './steps/BeneficiariesStep';
import ConsentStep from './steps/ConsentStep';
import ActivatedStep from './steps/ActivatedStep';
import AgentFallbackStep from './steps/AgentFallbackStep';
import PendingReviewStep from './steps/PendingReviewStep';

// Back button is NOT shown on: Step 1 (start of flow), Step 9 (done), and
// either terminal screen. All other steps render a back link.
const NO_BACK_STEPS = new Set(['id-upload', 'done', AGENT_STEP, PENDING_REVIEW_STEP]);

function SignupFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout } = useAuth();
  const signup = useSignup();
  const [stepId, setStepId] = useState('id-upload');
  const [pausedAt, setPausedAt] = useState(null);
  const [direction, setDirection] = useState(1);

  // When the user navigates to /signup/contribution, render the contribution
  // page in place of the signup shell. Keeping this check inside SignupFlow
  // (rather than splitting into separate Routes) means the signup flow's
  // internal step state survives the detour.
  const onContribution = location.pathname.replace(/\/$/, '').endsWith('/contribution');

  function goTo(nextId) {
    const currIdx = getStepIndex(stepId);
    const nextIdx = getStepIndex(nextId);
    setDirection(nextIdx >= currIdx ? 1 : -1);
    setStepId(nextId);
  }

  function goNext() {
    const idx = getStepIndex(stepId);
    const next = STEPS[idx + 1];
    if (next) goTo(next.id);
  }

  function goBack() {
    const idx = getStepIndex(stepId);
    const prev = STEPS[idx - 1];
    if (prev) goTo(prev.id);
  }

  function routeToAgent(reason, stageId) {
    signup.patch({ failureReason: reason, failureStage: stageId });
    setPausedAt(stageId || stepId);
    setDirection(1);
    setStepId(AGENT_STEP);
  }

  function routeToPendingReview() {
    setPausedAt('aml');
    setDirection(1);
    setStepId(PENDING_REVIEW_STEP);
  }

  function finishAndEnter() {
    login({
      role: 'subscriber',
      phone: signup.phone,
      name: signup.fullName || 'New Subscriber',
      contributionSchedule: signup.contributionSchedule ?? null,
    });
    signup.reset();
    navigate('/coming-soon');
  }

  function exitToHome() {
    signup.reset();
    logout();
    navigate('/');
  }

  const canBack = !NO_BACK_STEPS.has(stepId);
  const StepNode = renderStep();

  if (onContribution) {
    return <ContributionRoute />;
  }

  return (
    <SignupShell
      stepId={stepId}
      onBack={goBack}
      canBack={canBack}
      pinnedStageId={pausedAt}
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={stepId}
          custom={direction}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{
            opacity: { duration: 0.35, ease: EASE_OUT_EXPO },
            y: { duration: 0.55, ease: EASE_OUT_EXPO },
          }}
        >
          {StepNode}
        </motion.div>
      </AnimatePresence>
    </SignupShell>
  );

  function renderStep() {
    switch (stepId) {
      case 'id-upload':
        return <IdUploadStep onNext={goNext} />;

      case 'review':
        return <ReviewStep onNext={goNext} />;

      case 'nira':
        return (
          <NiraStep
            onNext={goNext}
            onEdit={() => goTo('review')}
            onAgentFallback={() =>
              routeToAgent('NIRA could not verify your identity from the details provided.', 'nira')
            }
          />
        );

      case 'otp':
        return <OtpStep onNext={goNext} />;

      case 'liveness':
        return (
          <LivenessStep
            onNext={goNext}
            onAgentFallback={() =>
              routeToAgent('Biometric verification could not be completed.', 'liveness')
            }
          />
        );

      case 'aml':
        return <AmlStep onNext={goNext} onFlagged={routeToPendingReview} />;

      case 'beneficiaries':
        return <BeneficiariesStep onNext={goNext} />;

      case 'consent':
        return <ConsentStep onActivate={async () => goNext()} />;

      case 'done':
        return <ActivatedStep onFinish={finishAndEnter} />;

      case AGENT_STEP:
        return <AgentFallbackStep onExit={exitToHome} />;

      case PENDING_REVIEW_STEP:
        return <PendingReviewStep onExit={exitToHome} />;

      default:
        return null;
    }
  }
}

export default function SignupPage() {
  return (
    <SignupProvider>
      <SignupFlow />
    </SignupProvider>
  );
}
