import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { SIGNUP_STORAGE_KEY } from './signupState';

/**
 * Generate a unique onboarding-session id. Backend uses this to correlate
 * every KYC stage (OCR, NIRA, OTP, face-match, AML) into a single record.
 */
function createOnboardingSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @typedef {Object} Beneficiary
 * @property {string} id
 * @property {string} name
 * @property {string} phone                 — 9 digits, +256 prefix applied at render
 * @property {'spouse'|'child'|'parent'|'sibling'|'other'} relationship
 * @property {number} share                 — integer 1–100
 */

/**
 * @typedef {Object} SignupState
 *
 * Session correlation
 * @property {string} onboardingSessionId  — passed to every KYC API call so
 *   the backend can link OCR → NIRA → OTP → face-match → AML stages.
 *   Generated on first signup-context mount; persists across refresh.
 *
 * Step 1 — ID upload (front + back)
 * @property {File|Blob|null}          idFrontFile
 * @property {File|Blob|null}          idBackFile
 * @property {string|null}             idFrontPreviewUrl
 * @property {string|null}             idBackPreviewUrl
 * @property {import('../services/kyc').QualityReport|null} idFrontQuality
 * @property {import('../services/kyc').QualityReport|null} idBackQuality
 *
 * Step 2 — Review (OCR auto-fill + manual fields)
 * @property {string} fullName
 * @property {string} nin
 * @property {string} cardNumber
 * @property {string} dob
 * @property {string} districtId
 * @property {'male'|'female'|'other'|null} gender
 * @property {string} barcodeRaw
 * @property {number|null} idConfidence
 * @property {string} phone                 — manual entry, 9 digits
 * @property {string} email                 — optional, used for statements & notifications
 * @property {string} occupation            — manual entry
 * @property {string} password              — chosen at Review; EPHEMERAL — never
 *   persisted to localStorage. Lives in memory until the auth verify-otp call
 *   ships it to the backend, then is dropped on signup.reset(). Re-entered if
 *   the user navigates back to ReviewStep.
 *
 * Step 3 — NIRA (silent)
 * @property {'match'|'partial'|'no-match'|null} niraResult
 * @property {string[]} niraMismatchedFields
 * @property {string}   niraTrackingId
 *
 * Step 4 — OTP
 * @property {boolean} otpVerified
 *
 * Step 5 — Liveness
 * @property {File|Blob|null} selfieFile
 * @property {'ok'|'liveness-fail'|'no-match'|null} faceMatchOutcome
 * @property {boolean} livenessRetryUsed    — one retry only per spec
 *
 * Step 6 — AML (silent)
 * @property {'clear'|'flagged'|null} amlResult
 * @property {string} amlTrackingId
 *
 * Step 7 — Beneficiaries
 * @property {Beneficiary[]} pensionBeneficiaries
 * @property {boolean} insuranceSameAsPension
 * @property {boolean} insuranceChoiceMade  — true once the user has explicitly set the checkbox
 * @property {Beneficiary[]} insuranceBeneficiaries
 *
 * Step 8 — Consent
 * @property {boolean}     consent
 * @property {string|null} consentTimestamp — UTC ISO string
 *
 * Step 9 — Contribution settings (post-activation, optional one-time setup)
 * @property {{frequency:'weekly'|'monthly'|'quarterly'|'half-yearly'|'annually', amount:number, retirementPct:number, emergencyPct:number}|null} contributionSchedule
 *
 * Terminals
 * @property {string|null} failureReason
 * @property {string|null} failureStage
 */

const INITIAL_STATE = {
  onboardingSessionId: '',

  idFrontFile: null,
  idBackFile: null,
  idFrontPreviewUrl: null,
  idBackPreviewUrl: null,
  idFrontQuality: null,
  idBackQuality: null,

  fullName: '',
  nin: '',
  cardNumber: '',
  dob: '',
  districtId: '',
  gender: null,
  barcodeRaw: '',
  idConfidence: null,

  phone: '',
  email: '',
  occupation: '',
  password: '',

  niraResult: null,
  niraMismatchedFields: [],
  niraTrackingId: '',

  otpVerified: false,

  selfieFile: null,
  faceMatchOutcome: null,
  livenessRetryUsed: false,

  amlResult: null,
  amlTrackingId: '',

  pensionBeneficiaries: [],
  insuranceSameAsPension: true,
  insuranceChoiceMade: true,
  insuranceBeneficiaries: [],

  consent: false,
  consentTimestamp: null,

  contributionSchedule: null,

  failureReason: null,
  failureStage: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.payload };
    case 'reset':
      return { ...INITIAL_STATE, onboardingSessionId: createOnboardingSessionId() };
    default:
      return state;
  }
}

// File/Blob + object URL fields can't be serialised to localStorage. They're
// dropped on persist and re-nulled on rehydrate — the user re-uploads ID/selfie
// after a refresh, but KYC data, OCR results, beneficiaries, consent, etc. survive.
// `password` is also ephemeral: raw passwords MUST NOT touch localStorage, so it
// lives in memory only and is re-entered on remount if the user navigates back.
const EPHEMERAL_KEYS = ['idFrontFile', 'idBackFile', 'selfieFile', 'idFrontPreviewUrl', 'idBackPreviewUrl', 'password'];

function loadPersisted() {
  // Always create a fresh session ID by default; if persisted state has one,
  // the spread below overwrites it so refresh keeps the same correlation key.
  const fresh = { ...INITIAL_STATE, onboardingSessionId: createOnboardingSessionId() };
  if (typeof window === 'undefined') return fresh;
  try {
    const raw = window.localStorage.getItem(SIGNUP_STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    // Reset ephemeral keys to their INITIAL_STATE default (File/Blob/url fields
    // are `null`; `password` is `''`). This keeps the password field a string
    // on rehydrate so validators/inputs that assume `string` don't trip.
    const ephemeral = Object.fromEntries(
      EPHEMERAL_KEYS.map((k) => [k, INITIAL_STATE[k]]),
    );
    return {
      ...fresh,
      ...parsed,
      // Preserve persisted session id; if absent (legacy persist), keep the fresh one.
      onboardingSessionId: parsed.onboardingSessionId || fresh.onboardingSessionId,
      ...ephemeral,
    };
  } catch {
    return fresh;
  }
}

function persist(state) {
  if (typeof window === 'undefined') return;
  try {
    const toStore = { ...state };
    EPHEMERAL_KEYS.forEach((k) => { delete toStore[k]; });
    window.localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Quota / private-browsing — non-fatal.
  }
}

const SignupContext = createContext(null);

export function SignupProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, loadPersisted);

  useEffect(() => { persist(state); }, [state]);

  const patch = useCallback((payload) => dispatch({ type: 'patch', payload }), []);
  const reset = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(SIGNUP_STORAGE_KEY); } catch { /* ignore */ }
    }
    // The reducer's 'reset' action mints a fresh onboardingSessionId.
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo(() => ({ ...state, patch, reset }), [state, patch, reset]);
  return <SignupContext value={value}>{children}</SignupContext>;
}

export function useSignup() {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error('useSignup must be used within SignupProvider');
  return ctx;
}
