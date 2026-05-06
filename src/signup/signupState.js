// Small helpers for inspecting persisted signup state from outside the
// SignupContext provider tree. The sign-in modal uses these to decide whether
// a returning subscriber should jump back into the signup flow or land on the
// dashboard.

export const SIGNUP_STORAGE_KEY = 'uganda-pensions-signup';

export function readSignupState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIGNUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Whether a subscriber has completed the KYC flow far enough that the
 * dashboard is the right destination after sign-in. Triggered by the
 * `consent` step (step 8 of 9) — by that point NIRA, OTP, liveness, and AML
 * have all run successfully.
 */
export function isSignupComplete() {
  const state = readSignupState();
  return Boolean(state?.consent);
}
