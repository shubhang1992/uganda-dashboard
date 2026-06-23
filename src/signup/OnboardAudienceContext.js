import { createContext, useContext } from 'react';

/**
 * Who is operating the KYC flow.
 *
 *  - 'self'  — the subscriber filling in their OWN self-signup (SignupShell).
 *              First-person copy ("your ID", "your face") is correct here.
 *  - 'agent' — a field agent onboarding a subscriber (OnboardFlow). The agent is
 *              NOT the data subject, so the shared steps switch to terser,
 *              third-person copy ("the subscriber's ID") to match the agent
 *              desktop console design (see ~/Desktop/agent-onboarding-desktop-v3).
 *
 * Default is 'self' so the subscriber self-signup is completely unaffected — only
 * OnboardFlow wraps its tree in the provider with value="agent".
 */
const OnboardAudienceContext = createContext('self');

export const OnboardAudienceProvider = OnboardAudienceContext.Provider;

export function useOnboardAudience() {
  return useContext(OnboardAudienceContext);
}
