// OnboardStaffPanel — thin wrapper that mounts the shared OnboardStaffBody inside
// the legacy/desktop EmployerSlidePanel chrome. The single/bulk/review/result
// flow lives in OnboardStaffBody so the routed mobile page (OnboardStaffMobile)
// mounts the same body without the panel chrome. Behaviour is unchanged: the
// shells gate this with `{onboardOpen && …}`, so closing unmounts the body and
// resets its state (no explicit reset needed).

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import OnboardStaffBody from './OnboardStaffBody';

export default function OnboardStaffPanel({ splitMode = false }) {
  const { onboardOpen, setOnboardOpen } = useEmployerPanel();
  const close = () => setOnboardOpen(false);

  return (
    <EmployerSlidePanel
      open={onboardOpen}
      onClose={close}
      title="Onboard members"
      eyebrow="Onboarding"
      width={560}
      splitMode={splitMode}
    >
      <OnboardStaffBody onClose={close} />
    </EmployerSlidePanel>
  );
}
