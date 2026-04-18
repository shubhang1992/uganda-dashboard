// KYC service — wraps the Smile ID API for Uganda NIRA verification + OTP.
// Prototype uses mocked responses. Swap the `// Future:` lines with real
// `api.post()` calls when Smile ID credentials are provisioned.
//
// Provider: Smile ID (https://smileidentity.com) — chosen for Uganda because
// of its direct NIRA integration and regional coverage. Endpoints follow
// Smile ID's v2 contract; payloads include a tracking_id so the backend can
// correlate the OCR result, NIRA verification, OTP check, face-match, and
// AML/PEP screen across a single onboarding job.

/* ──────────────────────────────────────────────────────────────────────── */
/*  Image quality + OCR                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} QualityReport
 * @property {boolean} blur       — true when image is acceptably sharp
 * @property {boolean} corners    — true when all four card corners are in frame
 * @property {boolean} glare      — true when no blown-out highlights are detected
 * @property {boolean} pass       — true iff all individual checks passed
 * @property {number}  score      — 0–1 composite score for QA logging
 */

/**
 * @endpoint POST /api/kyc/id-quality
 * @param {File|Blob} file
 * @returns {Promise<QualityReport>}
 * @description Client-side guard rail. Real provider runs the same checks
 *   server-side before it commits OCR credits. Prototype uses simple file-
 *   shape heuristics plus an override for QA.
 * @scope Public.
 */
export async function assessImageQuality(file) {
  // Prototype: run a synthetic delay so the UI can show the checks animating.
  await delay(900);
  const forced = readForced('upensions_id_quality_force');
  if (forced === 'fail-blur') return buildQuality({ blur: false });
  if (forced === 'fail-corners') return buildQuality({ corners: false });
  if (forced === 'fail-glare') return buildQuality({ glare: false });
  // File-shape heuristic — catches obvious trash.
  if (file && file.size && file.size < 20 * 1024) return buildQuality({ blur: false });
  return buildQuality({});
}

/**
 * @typedef {Object} IdExtraction
 * @property {string} fullName
 * @property {string} nin            — 14-char Uganda NIN (CM/CF + 12 chars)
 * @property {string} cardNumber     — 9-char card number
 * @property {string} dob            — ISO date YYYY-MM-DD
 * @property {string} districtId     — district id from mockData
 * @property {'male'|'female'} gender
 * @property {string} barcodeRaw     — raw 2D-barcode decode from the back
 * @property {number} confidence     — 0–1 composite OCR+barcode confidence
 */

/**
 * @endpoint POST /api/kyc/id-ocr
 * @param {{ front: File|Blob, back: File|Blob }} payload
 * @returns {Promise<IdExtraction>}
 * @description Runs Smile ID Document Verification on BOTH sides. OCR reads
 *   printed fields from the front; barcode decoder reads the PDF417 on the back
 *   and cross-checks the printed fields against the encoded record. Confidence
 *   reflects both OCR and barcode agreement.
 * @scope Public.
 */
export async function extractIdFields(payload) {
  // Future: const form = new FormData();
  //         form.append('front', payload.front);
  //         form.append('back', payload.back);
  //         return api.post('/kyc/id-ocr', form);
  await delay(2200);
  if (!payload?.front || !payload?.back) {
    throw new Error('Both sides of the ID are required.');
  }
  return {
    fullName: 'Namukasa Sarah Kintu',
    nin: 'CF92018AB3CD45',
    cardNumber: 'UG7412903',
    dob: '1992-06-18',
    districtId: 'd-kampala',
    gender: 'female',
    barcodeRaw: 'CF92018AB3CD45|UG7412903|1992-06-18|NAMUKASA,SARAH,KINTU',
    confidence: 0.94,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  NIRA verification                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} NiraResult
 * @property {'match'|'partial'|'no-match'} result
 * @property {string[]} [mismatchedFields]
 * @property {string}   [reason]
 * @property {string}   trackingId
 */

/**
 * @endpoint POST /api/kyc/nira-verify
 * @param {{ nin: string, cardNumber: string, dob: string, fullName: string }} payload
 * @returns {Promise<NiraResult>}
 */
export async function verifyNira(payload) {
  // Future: return api.post('/kyc/nira-verify', payload)
  void payload;
  await delay(2400);
  const forced = readForced('upensions_nira_force');
  const result = forced || 'match';
  if (result === 'partial') {
    return {
      result: 'partial',
      mismatchedFields: ['dob'],
      reason: 'DOB differs from NIRA record by a day — flagged for back-office review.',
      trackingId: mockTrackingId(),
    };
  }
  if (result === 'no-match') {
    return {
      result: 'no-match',
      reason: 'NIRA could not confirm your identity from the card details provided.',
      trackingId: mockTrackingId(),
    };
  }
  return { result: 'match', trackingId: mockTrackingId() };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  SMS OTP                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @endpoint POST /api/auth/send-otp
 * @param {{ phone: string }} payload
 * @returns {Promise<{ success: boolean, expiresIn: number }>}
 * @description Sends a 4-digit OTP via SMS. Cooldown enforced server-side too.
 * @scope Public.
 */
export async function sendOtp(payload) {
  // Future: return api.post('/auth/send-otp', payload)
  void payload;
  await delay(600);
  return { success: true, expiresIn: 300 };
}

/**
 * @endpoint POST /api/auth/verify-otp
 * @param {{ phone: string, code: string }} payload
 * @returns {Promise<{ verified: boolean }>}
 */
export async function verifyOtp(payload) {
  // Future: return api.post('/auth/verify-otp', payload)
  await delay(900);
  const forced = readForced('upensions_otp_force'); // 'fail' to force rejection
  if (forced === 'fail') return { verified: false };
  if (!payload?.code || payload.code.length !== 4) return { verified: false };
  // Prototype: accept any 4-digit code except '0000' which mimics a bad entry.
  if (payload.code === '0000') return { verified: false };
  return { verified: true };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Face match + liveness                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} FaceMatchResult
 * @property {boolean} match
 * @property {boolean} liveness
 * @property {number}  matchScore
 * @property {'ok'|'liveness-fail'|'no-match'} outcome
 * @property {string}  trackingId
 */

/**
 * @endpoint POST /api/kyc/face-match
 * @param {{ selfieFile: File|Blob, nin: string }} payload
 * @returns {Promise<FaceMatchResult>}
 */
export async function faceMatch(payload) {
  // Future: const form = new FormData();
  //         form.append('selfie', payload.selfieFile);
  //         form.append('nin', payload.nin);
  //         return api.post('/kyc/face-match', form);
  void payload;
  await delay(2200);
  const forced = readForced('upensions_face_force');
  const outcome = forced || 'ok';
  if (outcome === 'liveness-fail') {
    return { match: false, liveness: false, matchScore: 0, outcome, trackingId: mockTrackingId() };
  }
  if (outcome === 'no-match') {
    return { match: false, liveness: true, matchScore: 0.42, outcome, trackingId: mockTrackingId() };
  }
  return { match: true, liveness: true, matchScore: 0.97, outcome: 'ok', trackingId: mockTrackingId() };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  AML + PEP screening                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} AmlResult
 * @property {'clear'|'flagged'} outcome
 * @property {string} trackingId
 */

/**
 * @endpoint POST /api/kyc/aml-screen
 * @param {{ fullName: string, dob: string, nin: string }} payload
 * @returns {Promise<AmlResult>}
 * @description AML sanction-list + PEP screening via Smile ID's compliance API.
 *   Flagged users are routed to back-office review; they do not see the reason.
 * @scope Public — onboarding only.
 */
export async function screenAml(payload) {
  // Future: return api.post('/kyc/aml-screen', payload)
  void payload;
  await delay(1700);
  const forced = readForced('upensions_aml_force'); // 'flagged' to force review
  if (forced === 'flagged') {
    return { outcome: 'flagged', trackingId: mockTrackingId() };
  }
  return { outcome: 'clear', trackingId: mockTrackingId() };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Agent fallback                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * @endpoint POST /api/kyc/agent-referral
 * @param {{ phone: string, reason: string, stage?: string, trackingId?: string }} payload
 * @returns {Promise<{ ticketId: string, eta: string }>}
 */
export async function referToAgent(payload) {
  // Future: return api.post('/kyc/agent-referral', payload)
  void payload;
  await delay(600);
  return {
    ticketId: `UAG-${Date.now().toString(36).toUpperCase()}`,
    eta: 'within 24 hours',
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockTrackingId() {
  return `smile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readForced(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function buildQuality({ blur = true, corners = true, glare = true }) {
  const pass = blur && corners && glare;
  const score = [blur, corners, glare].filter(Boolean).length / 3;
  return { blur, corners, glare, pass, score };
}
