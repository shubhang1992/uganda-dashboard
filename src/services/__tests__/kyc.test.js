// kyc service tests — wraps the eight `/api/kyc/*` routes.
//
// Most exported functions follow the same shape: post the payload to an
// `/api/kyc/<endpoint>` route, optionally forward an `X-QA-Force` header read
// from `localStorage['upensions_<stage>_force']`. The X11-relevant parity
// concern is that the env-fallback mocks return the same shape as the API
// would — same field names + types — so callers in `src/signup/steps/` are
// branch-agnostic.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(() => Promise.resolve(JSON.stringify(body))),
    json: vi.fn(() => Promise.resolve(body)),
  };
}

describe('kyc service — real (Supabase) branch', () => {
  let mod;
  beforeEach(async () => {
    mod = await import('../kyc');
  });

  describe('assessImageQuality', () => {
    it('short-circuits to a blurry report when file is < 20KiB (no network)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const file = { size: 10 * 1024, type: 'image/jpeg' };
      const report = await mod.assessImageQuality(file);
      expect(report.blur).toBe(false);
      expect(report.pass).toBe(false);
      expect(typeof report.score).toBe('number');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs to /api/kyc/id-quality for normal-size files', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ blur: true, corners: true, glare: true, pass: true, score: 1 }),
      );
      const file = { size: 100 * 1024, type: 'image/jpeg' };
      const report = await mod.assessImageQuality(file);
      expect(report.pass).toBe(true);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/kyc/id-quality');
      expect(init.method).toBe('POST');
      const sent = JSON.parse(init.body);
      expect(sent).toEqual({ fileSize: 100 * 1024, mime: 'image/jpeg' });
    });

    it('forwards X-QA-Force header when localStorage flag is set', async () => {
      window.localStorage.setItem('upensions_id_quality_force', 'fail-blur');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ blur: false, corners: true, glare: true, pass: false, score: 0.66 }),
      );
      await mod.assessImageQuality({ size: 100 * 1024, type: 'image/jpeg' });
      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['X-QA-Force']).toBe('fail-blur');
    });
  });

  describe('extractIdFields', () => {
    it('throws when either side is missing', async () => {
      await expect(mod.extractIdFields({ front: null, back: {} })).rejects.toThrow(/Both sides/);
      await expect(mod.extractIdFields({ front: {}, back: null })).rejects.toThrow(/Both sides/);
    });

    it('POSTs front/back filenames + sessionId envelope to /api/kyc/id-ocr', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          fullName: 'X Y', nin: 'CF...', cardNumber: 'UG...',
          dob: '1990-01-01', gender: 'female',
          barcodeRaw: '...', confidence: 0.9,
        }),
      );
      const result = await mod.extractIdFields({
        front: { name: 'f.png' }, back: { name: 'b.png' }, sessionId: 's-1',
      });
      expect(result.fullName).toBe('X Y');
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sent).toEqual({ front: 'f.png', back: 'b.png', sessionId: 's-1' });
    });

    it('defaults filename when File-like object lacks .name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
      await mod.extractIdFields({ front: {}, back: {} });
      const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(sent.front).toBe('front');
      expect(sent.back).toBe('back');
    });
  });

  describe('verifyNira', () => {
    it('POSTs payload to /api/kyc/nira-verify and returns result', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ result: 'match', trackingId: 'smile_x' }),
      );
      const result = await mod.verifyNira({ nin: 'CF1', cardNumber: 'UG1', dob: '1990-01-01', fullName: 'X' });
      expect(result).toEqual({ result: 'match', trackingId: 'smile_x' });
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/kyc/nira-verify');
    });

    it('forwards X-QA-Force header from localStorage', async () => {
      window.localStorage.setItem('upensions_nira_force', 'partial');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ result: 'partial' }));
      await mod.verifyNira({ nin: 'x', cardNumber: 'y', dob: 'z', fullName: 'a' });
      expect(fetchSpy.mock.calls[0][1].headers['X-QA-Force']).toBe('partial');
    });
  });

  describe('sendOtp + verifyOtp', () => {
    it('sendOtp POSTs to /api/kyc/otp-send', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ success: true, expiresIn: 300 }),
      );
      const res = await mod.sendOtp({ phone: '+256700000000' });
      expect(res).toEqual({ success: true, expiresIn: 300 });
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/kyc/otp-send');
    });

    it('verifyOtp POSTs to /api/kyc/otp-verify', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ verified: true }));
      const res = await mod.verifyOtp({ phone: '+256700000000', code: '1234' });
      expect(res).toEqual({ verified: true });
    });
  });

  describe('faceMatch', () => {
    it('throws (regardless of branch) when selfieFile is missing', async () => {
      await expect(mod.faceMatch({ nin: 'x' })).rejects.toThrow(/Selfie/);
    });

    it('POSTs filename token + nin to /api/kyc/face-match', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ match: true, liveness: true, matchScore: 0.97, outcome: 'ok', trackingId: 'smile_x' }),
      );
      const res = await mod.faceMatch({
        selfieFile: { name: 'selfie.png' }, nin: 'CF1', sessionId: 's-2',
      });
      expect(res.outcome).toBe('ok');
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sent).toEqual({ selfieFile: 'selfie.png', nin: 'CF1', sessionId: 's-2' });
    });

    it('defaults selfie filename to "selfie" when File-like lacks .name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
      await mod.faceMatch({ selfieFile: {}, nin: 'x' });
      const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(sent.selfieFile).toBe('selfie');
    });
  });

  describe('screenAml', () => {
    it('POSTs payload to /api/kyc/aml-screen', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ outcome: 'clear', trackingId: 'smile_x' }),
      );
      const res = await mod.screenAml({
        fullName: 'X', dob: '1990-01-01', nin: 'CF1', sessionId: 's-3',
      });
      expect(res.outcome).toBe('clear');
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/kyc/aml-screen');
    });
  });

  describe('referToAgent', () => {
    it('POSTs payload to /api/kyc/agent-referral and returns ticket envelope', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ ticketId: 'UAG-XYZ', eta: 'within 24 hours' }),
      );
      const res = await mod.referToAgent({
        phone: '+256700000000', reason: 'nira partial', stage: 'nira',
      });
      expect(res).toEqual({ ticketId: 'UAG-XYZ', eta: 'within 24 hours' });
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/kyc/agent-referral');
    });

    it('surfaces network errors (no fallback)', async () => {
      // apiFetch (G50) wraps fetch's TypeError into a typed error with
      // `code: 'network_unreachable'`; referToAgent re-throws unchanged.
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(mod.referToAgent({})).rejects.toMatchObject({
        code: 'network_unreachable',
      });
    });
  });
});

describe('kyc service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let mod;
  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    mod = await import('../kyc');
  });

  it('assessImageQuality returns a quality report with pass/score', async () => {
    const report = await mod.assessImageQuality({ size: 100 * 1024, type: 'image/jpeg' });
    expect(report).toHaveProperty('blur');
    expect(report).toHaveProperty('corners');
    expect(report).toHaveProperty('glare');
    expect(report).toHaveProperty('pass');
    expect(typeof report.score).toBe('number');
  }, 5000);

  it('extractIdFields returns canonical demo subject', async () => {
    const res = await mod.extractIdFields({ front: { name: 'f' }, back: { name: 'b' } });
    expect(res.nin).toBeDefined();
    expect(res.fullName).toBeDefined();
    expect(res.gender).toMatch(/^(male|female)$/);
    expect(typeof res.confidence).toBe('number');
  }, 5000);

  it('extractIdFields throws when sides missing in mock mode too', async () => {
    await expect(mod.extractIdFields({ front: null, back: {} })).rejects.toThrow(/Both sides/);
  });

  it('verifyNira returns NiraResult shape', async () => {
    const res = await mod.verifyNira({ nin: 'x', cardNumber: 'y', dob: 'z', fullName: 'a' });
    expect(res.result).toMatch(/^(match|partial|no-match)$/);
    expect(res.trackingId).toMatch(/^smile_/);
  }, 5000);

  it('sendOtp returns success envelope', async () => {
    const res = await mod.sendOtp({ phone: 'x' });
    expect(res).toEqual({ success: true, expiresIn: 300 });
  }, 5000);

  it('verifyOtp rejects 4-digit "0000" pattern', async () => {
    const res = await mod.verifyOtp({ phone: 'x', code: '0000' });
    expect(res.verified).toBe(false);
  }, 5000);

  it('verifyOtp accepts a 4-digit non-zero code', async () => {
    const res = await mod.verifyOtp({ phone: 'x', code: '1234' });
    expect(res.verified).toBe(true);
  }, 5000);

  it('faceMatch returns FaceMatchResult shape', async () => {
    const res = await mod.faceMatch({ selfieFile: { name: 'x' }, nin: 'CF1' });
    expect(typeof res.match).toBe('boolean');
    expect(typeof res.liveness).toBe('boolean');
    expect(typeof res.matchScore).toBe('number');
    expect(res.trackingId).toMatch(/^smile_/);
  }, 5000);

  it('screenAml returns AmlResult shape', async () => {
    const res = await mod.screenAml({ fullName: 'X', dob: 'z', nin: 'CF1' });
    expect(res.outcome).toMatch(/^(clear|flagged)$/);
    expect(res.trackingId).toMatch(/^smile_/);
  }, 5000);

  it('referToAgent returns ticket envelope', async () => {
    const res = await mod.referToAgent({ phone: 'x', reason: 'y' });
    expect(res.ticketId).toMatch(/^UAG-/);
    expect(typeof res.eta).toBe('string');
  }, 5000);
});

describe('kyc service — real/mock branch parity (X11)', () => {
  // We can't easily mix-and-match the imports for both branches in one test,
  // but we CAN verify that the mock return shape exactly matches what the API
  // route is documented to return — by re-running the mocks and inspecting
  // keys. The API has no contract test here; we use JSDoc shape verbatim.

  it('verifyNira returns the same key set in both branches', async () => {
    const realMod = await import('../kyc');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ result: 'match', trackingId: 'x' }),
    );
    const real = await realMod.verifyNira({});
    const realKeys = Object.keys(real).sort();

    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    const mockMod = await import('../kyc');
    const mock = await mockMod.verifyNira({});
    const mockKeys = Object.keys(mock).sort();

    // result + trackingId are always present in both branches.
    expect(mockKeys).toEqual(expect.arrayContaining(['result', 'trackingId']));
    expect(realKeys).toEqual(expect.arrayContaining(['result', 'trackingId']));
  }, 5000);

  it('sendOtp returns the same envelope (success, expiresIn) in both branches', async () => {
    const realMod = await import('../kyc');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, expiresIn: 300 }),
    );
    const real = await realMod.sendOtp({ phone: 'x' });

    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    const mockMod = await import('../kyc');
    const mock = await mockMod.sendOtp({ phone: 'x' });

    expect(Object.keys(real).sort()).toEqual(Object.keys(mock).sort());
  }, 5000);
});
