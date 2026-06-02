import { SignupProvider } from '../../signup/SignupContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import OnboardFlow from '../onboarding/OnboardFlow';
import OnboardDesktop from './OnboardDesktop';

export default function OnboardPage() {
  // SPECIAL FORK: the SignupProvider must wrap BOTH variants so the wizard's
  // signup state is identical whichever branch mounts. So the fork lives INSIDE
  // the provider (no top-level early return) — desktop swaps OnboardFlow for the
  // OnboardDesktop chrome, which itself wraps the SAME OnboardFlow wizard.
  const isDesktop = useIsDesktop();
  return (
    <SignupProvider>
      {isDesktop ? <OnboardDesktop /> : <OnboardFlow />}
    </SignupProvider>
  );
}
