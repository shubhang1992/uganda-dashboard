import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

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
      return INITIAL_STATE;
    default:
      return state;
  }
}

// File/Blob + object URL fields can't be serialised to localStorage. They're
// dropped on persist and re-nulled on rehydrate — the user re-uploads ID/selfie
// after a refresh, but KYC data, OCR results, beneficiaries, consent, etc. survive.
const STORAGE_KEY = 'uganda-pensions-signup';
const EPHEMERAL_KEYS = ['idFrontFile', 'idBackFile', 'selfieFile', 'idFrontPreviewUrl', 'idBackPreviewUrl'];

function loadPersisted() {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw);
    const ephemeral = Object.fromEntries(EPHEMERAL_KEYS.map((k) => [k, null]));
    return { ...INITIAL_STATE, ...parsed, ...ephemeral };
  } catch {
    return INITIAL_STATE;
  }
}

function persist(state) {
  if (typeof window === 'undefined') return;
  try {
    const toStore = { ...state };
    EPHEMERAL_KEYS.forEach((k) => { delete toStore[k]; });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
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
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
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
