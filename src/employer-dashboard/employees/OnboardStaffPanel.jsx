// Onboard-staff panel — PLACEHOLDER (clearly "coming soon"). The full
// new-employee onboarding journey (identity → salary → plan → insurance opt-in,
// writing real `employees` rows via a `create_employee` RPC) is deferred to its
// own later phase (plan Phase 9). This phase ships only the entry point.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function OnboardStaffPanel({ splitMode = false }) {
  const { onboardOpen, setOnboardOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={onboardOpen}
      onClose={() => setOnboardOpen(false)}
      title="Onboard staff"
      phase="a later phase"
      description="The new-employee onboarding journey (identity, salary, plan and insurance opt-in)"
      width={480}
      splitMode={splitMode}
    />
  );
}
