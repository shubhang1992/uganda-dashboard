import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/motion';

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
import AgentFallbackStep from './steps/AgentFallbackStep';
import PendingReviewStep from './steps/PendingReviewStep';

// Back button is NOT shown on: Step 1 (start of flow), Step 9 (done), and
// either terminal screen. All other steps render a back link.
const NO_BACK_STEPS = new Set(['id-upload', 'done', AGENT_STEP, PENDING_REVIEW_STEP]);

// Steps that consume a re-uploadable File (idFront/idBack, selfie). The raw
// File fields are EPHEMERAL — dropped from localStorage on refresh (see
// SignupContext EPHEMERAL_KEYS). But the *outcome* each file step produces is
// persisted (non-ephemeral): id-upload's OCR yields `idConfidence`, liveness'
// face match yields `faceMatchOutcome`. We clamp on the outcome, not the raw
// File: if the outcome is missing, the user hadn't finished that step before
// the refresh and must re-upload; if the outcome is present, the file already
// served its purpose downstream and need not be re-captured. Listed in flow
// order. `done` is the predicate that the step's persisted result survived.
const FILE_GATED_STEPS = [
  { id: 'id-upload', done: (s) => s.idConfidence != null },
  { id: 'liveness',  done: (s) => s.faceMatchOutcome === 'ok' },
];

/**
 * Compute the step a refresh should rehydrate into. Persists wizard position
 * (BL-22) while preserving the documented demo-scope "re-upload files on
 * refresh" behaviour: clamp the persisted `stepId` back to the first
 * file-gated step (at or before it, in flow order) whose result didn't
 * survive the refresh, so the user can't resume past a file gate they never
 * actually completed. A step the user already cleared (outcome persisted)
 * isn't re-walked even though its raw File is gone. Terminal/failure screens
 * (`agent`/`pending-review`, index -1) and an unknown id restart at step 1.
 */
function resolveResumeStep(persisted) {
  const targetIdx = getStepIndex(persisted?.stepId);
  if (targetIdx < 0) return 'id-upload';
  for (const gate of FILE_GATED_STEPS) {
    const gateIdx = getStepIndex(gate.id);
    if (gateIdx <= targetIdx && !gate.done(persisted)) return gate.id;
  }
  return persisted.stepId;
}

function SignupFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const signup = useSignup();
  // Lazy init from persisted context, clamped so a refresh resumes the wizard
  // position without skipping a now-empty file-upload gate (BL-22).
  const [stepId, setStepId] = useState(() => resolveResumeStep(signup));
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
    // Persist wizard position so a mid-flow refresh resumes here (BL-22).
    // Terminal screens route via setStepId (not goTo) and are intentionally
    // NOT persisted — a refresh resumes the last real step before the terminal.
    signup.patch({ stepId: nextId });
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

      // `consent` is the terminal step of this shell. Activating it does NOT
      // call goNext() into a `'done'` case here — instead it navigates to the
      // sibling `/signup/contribution` route, which mounts its own
      // <SignupShell stepId="done"> for the completion ring + ActivatedStep
      // (see contribution/ContributionRoute.jsx). So `STEPS` keeps its trailing
      // `'done'` entry — it is the wired terminal of the contribution route and
      // the end-of-flow sentinel for the agent OnboardKycFlow — but it has no
      // `case 'done'` in this switch by design. The `default` below returns
      // null only for that intentionally-unhandled id; nothing reaches it in
      // normal flow because consent navigates away instead of advancing.
      case 'consent':
        return <ConsentStep onActivate={async () => navigate('/signup/contribution')} />;

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
