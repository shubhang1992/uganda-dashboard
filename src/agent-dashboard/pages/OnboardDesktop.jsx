import OnboardFlow from '../onboarding/OnboardFlow';
import styles from './OnboardDesktop.module.css';

/**
 * OnboardDesktop — desktop (>=1024px) chrome for the agent onboarding wizard.
 *
 * Rendered in place of the mobile OnboardFlow when useIsDesktop() is true. The
 * fork lives in OnboardPage.jsx and is SPECIAL: it sits INSIDE the shared
 * SignupProvider (OnboardPage wraps BOTH variants in one provider) so the
 * wizard's signup state is identical whichever branch mounts — there is no
 * top-level early return and nothing remounts the provider across breakpoints.
 *
 * This component is intentionally thin: it renders a centred, width-capped
 * column (~780px, within the 720-840px target band) around the SAME extracted
 * OnboardFlow. The wizard is byte-identical to the mobile experience — its own
 * PageHeader still owns the single page <h1> "Onboard a new subscriber" (the
 * E2E asserts exactly one level-1 heading matching /onboard a new subscriber/i,
 * so OnboardDesktop deliberately adds NO second heading). The desktop top bar
 * renders no <h1> either, keeping rule G4 satisfied with one heading on the page.
 *
 * The mobile experience is untouched: OnboardFlow is imported and rendered as-is.
 */
export default function OnboardDesktop() {
  return (
    <div className={styles.shell}>
      <OnboardFlow />
    </div>
  );
}
