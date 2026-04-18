import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

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

const SignupContext = createContext(null);

export function SignupProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const patch = useCallback((payload) => dispatch({ type: 'patch', payload }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo(() => ({ ...state, patch, reset }), [state, patch, reset]);
  return <SignupContext value={value}>{children}</SignupContext>;
}

export function useSignup() {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error('useSignup must be used within SignupProvider');
  return ctx;
}
