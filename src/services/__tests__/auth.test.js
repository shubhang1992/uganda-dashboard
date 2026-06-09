// Auth service tests — `services/api` mocked so we never touch the network.
//
// Strategy:
//   - Mock `./api` (the relative path auth.js uses) so api.post is a vi.fn()
//     whose resolved/rejected value is controlled per-test. We assert (a) the
//     right endpoint + body shape was sent and (b) every success/error branch
//     in auth.js maps onto the documented `AuthError` contract.
//   - Mock `../config/env` so we can flip `IS_DEV` to exercise the
//     localStorage force-override branch in `verifyOtp`.
//   - Cover every export from `auth.js` (AuthError, sendOtp, verifyOtp,
//     signInWithPassword, changePassword, hasDashboard, DASHBOARD_ROLES) with
//     at least one assertion suite, plus every code branch in the private
//     `messageForCode` helper via the public surface that funnels through it.
//
// Note: `auth.js` doesn't itself own the 401 pub/sub — that lives in
// `services/api.js` as `onAuthExpired`. The plan's "401 listener" bullet is
// covered by `auth.js` correctly surfacing api.js's thrown error (with its
// `code`) as an AuthError. The standalone 401 pub/sub is exercised by the
// dedicated `api.test.js` suite under agent 2D (T5).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Hoisted mock state — must be referenced from within vi.mock() factories.
// Vitest lifts vi.mock() to the top of the file before imports resolve, so we
// declare a hoisted ref via vi.hoisted() to share the mocks across factories.
const { apiMock, envMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  envMock: { IS_DEV: false, IS_PROD: false, API_BASE_URL: '/api' },
}));

vi.mock('../api', () => ({ api: apiMock }));
vi.mock('@/services/api', () => ({ api: apiMock }));
vi.mock('../../config/env', () => envMock);
vi.mock('@/config/env', () => envMock);

const {
  AuthError,
  sendOtp,
  verifyOtp,
  signInWithPassword,
  changePassword,
  hasDashboard,
  DASHBOARD_ROLES,
} = await import('../auth');

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.put.mockReset();
  apiMock.delete.mockReset();
  envMock.IS_DEV = false;
  // Clean localStorage between tests so dev-force overrides don't leak.
  if (typeof window !== 'undefined') {
    try { window.localStorage.clear(); } catch { /* ignore */ }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── AuthError ──────────────────────────────────────────────────────────────

describe('AuthError', () => {
  it('sets name, code, and message on construction', () => {
    const err = new AuthError('invalid_otp', 'Invalid code.');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.name).toBe('AuthError');
    expect(err.code).toBe('invalid_otp');
    expect(err.message).toBe('Invalid code.');
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('records retryAfterSeconds when supplied', () => {
    const err = new AuthError('rate_limited', 'Slow down.', 45);
    expect(err.retryAfterSeconds).toBe(45);
  });

  it('omits retryAfterSeconds when the third arg is null', () => {
    const err = new AuthError('locked', 'Locked.', null);
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('omits retryAfterSeconds when the third arg is undefined', () => {
    const err = new AuthError('network', 'Network error.');
    expect('retryAfterSeconds' in err).toBe(false);
  });

  it('records retryAfterSeconds === 0 (zero is a valid value)', () => {
    const err = new AuthError('rate_limited', 'Try again.', 0);
    expect(err.retryAfterSeconds).toBe(0);
  });
});

// ─── sendOtp ────────────────────────────────────────────────────────────────

describe('sendOtp(phone, role)', () => {
  it('returns the api.post body on success', async () => {
    apiMock.post.mockResolvedValueOnce({ success: true });
    const result = await sendOtp('+256700000001', 'subscriber');
    expect(result).toEqual({ success: true });
    expect(apiMock.post).toHaveBeenCalledWith('/auth/send-otp', {
      phone: '+256700000001',
      role: 'subscriber',
    });
  });

  it('wraps a network error into an AuthError with code=network when no code is set', async () => {
    const upstream = new Error('boom');
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(sendOtp('+256700000001', 'agent')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'network',
    });
  });

  it('preserves the upstream `code` when present', async () => {
    const upstream = Object.assign(new Error('Too many attempts.'), {
      code: 'rate_limited',
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(sendOtp('+256700000001', 'subscriber')).rejects.toMatchObject({
      code: 'rate_limited',
      message: 'Too many attempts.',
    });
  });

  it('falls back to messageForCode when the upstream error has no message', async () => {
    const upstream = Object.assign(new Error(''), { code: 'locked' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(sendOtp('+256700000001', 'branch')).rejects.toMatchObject({
      code: 'locked',
      message: 'This account is temporarily locked.',
    });
  });

  it('passes the demo OTP wildcard role values through unchanged', async () => {
    // The demo backend treats any 6-digit code as valid (CLAUDE.md §10a).
    // sendOtp is a pass-through; we verify all 4 dashboard roles round-trip.
    apiMock.post.mockResolvedValue({ success: true });
    for (const role of ['subscriber', 'agent', 'branch', 'distributor']) {
      await sendOtp('+256700000099', role);
    }
    const calls = apiMock.post.mock.calls;
    expect(calls.map((c) => c[1].role)).toEqual([
      'subscriber',
      'agent',
      'branch',
      'distributor',
    ]);
  });
});

// ─── verifyOtp ──────────────────────────────────────────────────────────────

describe('verifyOtp(phone, otp, role, password?)', () => {
  const success = {
    token: 'jwt.token.value',
    user: { phone: '+256700000001', role: 'subscriber', hasPassword: false },
  };

  it('returns { token, user } on a happy-path 6-digit code', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    const result = await verifyOtp('+256700000001', '123456', 'subscriber');
    expect(result).toEqual(success);
    expect(apiMock.post).toHaveBeenCalledWith('/auth/verify-otp', {
      phone: '+256700000001',
      otp: '123456',
      role: 'subscriber',
    });
  });

  it('includes password in the body only when non-empty', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    await verifyOtp('+256700000001', '123456', 'subscriber', 'Sup3rPass');
    expect(apiMock.post).toHaveBeenCalledWith(
      '/auth/verify-otp',
      expect.objectContaining({ password: 'Sup3rPass' })
    );
  });

  it('omits password from the body for the legacy OTP-only path', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    await verifyOtp('+256700000001', '123456', 'subscriber');
    const body = apiMock.post.mock.calls[0][1];
    expect('password' in body).toBe(false);
  });

  it('omits password when an empty string is passed', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    await verifyOtp('+256700000001', '123456', 'subscriber', '');
    const body = apiMock.post.mock.calls[0][1];
    expect('password' in body).toBe(false);
  });

  it('throws AuthError(invalid_otp) when the response is missing a token', async () => {
    apiMock.post.mockResolvedValueOnce({ user: { phone: '+256700000001' } });
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber')
    ).rejects.toMatchObject({ name: 'AuthError', code: 'invalid_otp' });
  });

  it('throws AuthError(invalid_otp) when the response is missing user', async () => {
    apiMock.post.mockResolvedValueOnce({ token: 'jwt.token.value' });
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber')
    ).rejects.toMatchObject({ code: 'invalid_otp' });
  });

  it('throws AuthError(invalid_otp) when api returns null', async () => {
    apiMock.post.mockResolvedValueOnce(null);
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber')
    ).rejects.toMatchObject({ code: 'invalid_otp' });
  });

  it('propagates rate_limited with retryAfterSeconds from err.body', async () => {
    const upstream = Object.assign(new Error('Too many attempts.'), {
      code: 'rate_limited',
      body: { retryAfterSeconds: 60 },
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber')
    ).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 60,
      message: 'Too many attempts.',
    });
  });

  it('falls back to invalid_otp when an upstream error has no code', async () => {
    apiMock.post.mockRejectedValueOnce(new Error(''));
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber')
    ).rejects.toMatchObject({
      code: 'invalid_otp',
      message: 'Invalid code. Please try again.',
    });
  });

  it('propagates password-related upstream codes', async () => {
    const upstream = Object.assign(new Error('Password too short.'), {
      code: 'password_too_short',
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      verifyOtp('+256700000001', '123456', 'subscriber', 'short')
    ).rejects.toMatchObject({ code: 'password_too_short' });
  });

  describe('IS_DEV force-overrides via localStorage[upensions_otp_force]', () => {
    beforeEach(() => {
      envMock.IS_DEV = true;
    });

    it('throws invalid_otp pre-network when the force key is set', async () => {
      window.localStorage.setItem('upensions_otp_force', 'invalid_otp');
      await expect(
        verifyOtp('+256700000001', '123456', 'subscriber')
      ).rejects.toMatchObject({
        name: 'AuthError',
        code: 'invalid_otp',
        message: 'Invalid code. Please try again.',
      });
      expect(apiMock.post).not.toHaveBeenCalled();
    });

    it('throws rate_limited with retryAfterSeconds=45 when forced', async () => {
      window.localStorage.setItem('upensions_otp_force', 'rate_limited');
      await expect(
        verifyOtp('+256700000001', '123456', 'subscriber')
      ).rejects.toMatchObject({
        code: 'rate_limited',
        retryAfterSeconds: 45,
      });
      expect(apiMock.post).not.toHaveBeenCalled();
    });

    it('throws locked with retryAfterSeconds=600 when forced', async () => {
      window.localStorage.setItem('upensions_otp_force', 'locked');
      await expect(
        verifyOtp('+256700000001', '123456', 'subscriber')
      ).rejects.toMatchObject({
        code: 'locked',
        retryAfterSeconds: 600,
      });
    });

    it('does NOT intercept when an unrecognized force-key value is set', async () => {
      window.localStorage.setItem('upensions_otp_force', 'something_else');
      apiMock.post.mockResolvedValueOnce(success);
      const result = await verifyOtp('+256700000001', '123456', 'subscriber');
      expect(result).toEqual(success);
    });

    it('does NOT intercept when no force key is set', async () => {
      apiMock.post.mockResolvedValueOnce(success);
      const result = await verifyOtp('+256700000001', '123456', 'subscriber');
      expect(result).toEqual(success);
    });
  });

  it('skips the force-override branch entirely when IS_DEV is false', async () => {
    // Even with the key set, prod builds must not honour it.
    envMock.IS_DEV = false;
    window.localStorage.setItem('upensions_otp_force', 'invalid_otp');
    apiMock.post.mockResolvedValueOnce(success);
    const result = await verifyOtp('+256700000001', '123456', 'subscriber');
    expect(result).toEqual(success);
  });
});

// ─── signInWithPassword ─────────────────────────────────────────────────────

describe('signInWithPassword(phone, password, role)', () => {
  const success = {
    token: 'jwt.token.value',
    user: { phone: '+256700000001', role: 'agent', hasPassword: true },
  };

  it('returns { token, user } on a happy-path login', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    const result = await signInWithPassword('+256700000001', 'P@ssw0rd!', 'agent');
    expect(result).toEqual(success);
    expect(apiMock.post).toHaveBeenCalledWith('/auth/verify-password', {
      phone: '+256700000001',
      role: 'agent',
      password: 'P@ssw0rd!',
    });
  });

  it('throws AuthError(invalid_password) when token is missing in response', async () => {
    apiMock.post.mockResolvedValueOnce({ user: success.user });
    await expect(
      signInWithPassword('+256700000001', 'P@ssw0rd!', 'agent')
    ).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_password',
    });
  });

  it('throws AuthError(invalid_password) when user is missing', async () => {
    apiMock.post.mockResolvedValueOnce({ token: 'jwt' });
    await expect(
      signInWithPassword('+256700000001', 'P@ssw0rd!', 'agent')
    ).rejects.toMatchObject({ code: 'invalid_password' });
  });

  it('propagates invalid_password (401) from the backend', async () => {
    const upstream = Object.assign(new Error('Incorrect password.'), {
      code: 'invalid_password',
      status: 401,
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      signInWithPassword('+256700000001', 'wrong', 'agent')
    ).rejects.toMatchObject({
      code: 'invalid_password',
      message: 'Incorrect password.',
    });
  });

  it('propagates password_not_set so callers can route to OTP fallback', async () => {
    const upstream = Object.assign(new Error('This account uses one-time codes only.'), {
      code: 'password_not_set',
      status: 401,
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      signInWithPassword('+256700000001', 'whatever', 'subscriber')
    ).rejects.toMatchObject({
      code: 'password_not_set',
      message: 'This account uses one-time codes only.',
    });
  });

  it('propagates role_mismatch (B12 — phone enrolled in another role)', async () => {
    const upstream = Object.assign(new Error('Role mismatch'), {
      code: 'role_mismatch',
      status: 401,
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      signInWithPassword('+256700000001', 'pwd', 'distributor')
    ).rejects.toMatchObject({ code: 'role_mismatch' });
  });

  it('propagates retryAfterSeconds from err.body for rate_limited', async () => {
    const upstream = Object.assign(new Error('Slow down.'), {
      code: 'rate_limited',
      body: { retryAfterSeconds: 30 },
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      signInWithPassword('+256700000001', 'pwd', 'subscriber')
    ).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
  });

  it('falls back to network when upstream has no code', async () => {
    apiMock.post.mockRejectedValueOnce(new Error('connection refused'));
    await expect(
      signInWithPassword('+256700000001', 'pwd', 'subscriber')
    ).rejects.toMatchObject({
      code: 'network',
      message: 'connection refused',
    });
  });

  it('uses messageForCode fallback when upstream error has no message', async () => {
    const upstream = Object.assign(new Error(''), { code: 'invalid_password' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(
      signInWithPassword('+256700000001', 'pwd', 'subscriber')
    ).rejects.toMatchObject({
      code: 'invalid_password',
      message: 'Incorrect password.',
    });
  });
});

// ─── changePassword ─────────────────────────────────────────────────────────

describe('changePassword(currentPassword, newPassword)', () => {
  const success = { ok: true, hasPassword: true };

  it('returns { ok, hasPassword } on a successful rotate', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    const result = await changePassword('oldPass1', 'newPass2');
    expect(result).toEqual(success);
    expect(apiMock.post).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'oldPass1',
      newPassword: 'newPass2',
    });
  });

  it('omits currentPassword on the initial-set path (no existing hash)', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    await changePassword('', 'newPass2');
    const body = apiMock.post.mock.calls[0][1];
    expect('currentPassword' in body).toBe(false);
    expect(body.newPassword).toBe('newPass2');
  });

  it('omits currentPassword when undefined is passed', async () => {
    apiMock.post.mockResolvedValueOnce(success);
    await changePassword(undefined, 'newPass2');
    const body = apiMock.post.mock.calls[0][1];
    expect('currentPassword' in body).toBe(false);
  });

  it('throws AuthError(network) when response is missing ok=true', async () => {
    apiMock.post.mockResolvedValueOnce({ ok: false });
    await expect(changePassword('a', 'b')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'network',
    });
  });

  it('throws AuthError(network) when response is null', async () => {
    apiMock.post.mockResolvedValueOnce(null);
    await expect(changePassword('a', 'b')).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('propagates current_password_invalid (wrong old password)', async () => {
    const upstream = Object.assign(new Error('Current password is incorrect.'), {
      code: 'current_password_invalid',
      status: 401,
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('wrong', 'newPass2')).rejects.toMatchObject({
      code: 'current_password_invalid',
      message: 'Current password is incorrect.',
    });
  });

  it('propagates current_password_required when caller forgot it on a rotate', async () => {
    const upstream = Object.assign(new Error(''), {
      code: 'current_password_required',
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('', 'newPass2')).rejects.toMatchObject({
      code: 'current_password_required',
      message: 'Enter your current password.',
    });
  });

  it('propagates password_too_short (invalid shape)', async () => {
    const upstream = Object.assign(new Error(''), { code: 'password_too_short' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', '123')).rejects.toMatchObject({
      code: 'password_too_short',
      message: 'Password must be at least 8 characters.',
    });
  });

  it('propagates password_too_weak (invalid shape)', async () => {
    const upstream = Object.assign(new Error(''), { code: 'password_too_weak' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', 'aaaaaaaa')).rejects.toMatchObject({
      code: 'password_too_weak',
      message: 'Password must include a letter and a number.',
    });
  });

  it('propagates password_too_long (invalid shape)', async () => {
    const upstream = Object.assign(new Error(''), { code: 'password_too_long' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', 'x'.repeat(500))).rejects.toMatchObject({
      code: 'password_too_long',
      message: 'Password is too long.',
    });
  });

  it('propagates password_required when newPassword missing', async () => {
    const upstream = Object.assign(new Error(''), { code: 'password_required' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', '')).rejects.toMatchObject({
      code: 'password_required',
      message: 'Please enter a password.',
    });
  });

  it('propagates unauthorized (no/expired JWT) from the backend', async () => {
    // The session_expired branch in api.js fires onAuthExpired and throws an
    // Error with code='session_expired' — auth.js then wraps it as AuthError.
    const upstream = Object.assign(new Error('Session expired'), {
      code: 'session_expired',
      status: 401,
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', 'newPass2')).rejects.toMatchObject({
      code: 'session_expired',
    });
  });

  it('passes through an arbitrary unknown code from the backend (db_error)', async () => {
    const upstream = Object.assign(new Error('Database write failed'), {
      code: 'db_error',
    });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', 'newPass2')).rejects.toMatchObject({
      code: 'db_error',
      message: 'Database write failed',
    });
  });

  it('falls back to messageForCode default when code is unknown and message is empty', async () => {
    const upstream = Object.assign(new Error(''), { code: 'something_brand_new' });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(changePassword('old', 'newPass2')).rejects.toMatchObject({
      code: 'something_brand_new',
      // messageForCode default branch.
      message: 'Could not verify the code. Please try again.',
    });
  });
});

// ─── messageForCode coverage (via public surface) ───────────────────────────
//
// messageForCode is not exported. Each branch is exercised by forcing the
// upstream error message to '' so auth.js's `err?.message || messageForCode(code)`
// falls through to the helper.

describe('messageForCode branch coverage (via AuthError messages)', () => {
  /**
   * @param {string} code
   * @param {string} expectedMessage
   * @param {(c:string)=>Promise<unknown>} run
   */
  async function expectMessageFor(code, expectedMessage, run) {
    const upstream = Object.assign(new Error(''), { code });
    apiMock.post.mockRejectedValueOnce(upstream);
    await expect(run(code)).rejects.toMatchObject({ code, message: expectedMessage });
  }

  // Each test runs through sendOtp because its catch branch funnels every
  // upstream code through messageForCode with no extra mutation.
  const viaSendOtp = () => sendOtp('+256700000001', 'subscriber');

  it('maps rate_limited', async () => {
    await expectMessageFor('rate_limited', 'Too many attempts. Try again shortly.', viaSendOtp);
  });

  it('maps locked', async () => {
    await expectMessageFor('locked', 'This account is temporarily locked.', viaSendOtp);
  });

  it('maps invalid_otp', async () => {
    await expectMessageFor('invalid_otp', 'Invalid code. Please try again.', viaSendOtp);
  });

  it('maps password_too_short', async () => {
    await expectMessageFor('password_too_short', 'Password must be at least 8 characters.', viaSendOtp);
  });

  it('maps password_too_weak', async () => {
    await expectMessageFor('password_too_weak', 'Password must include a letter and a number.', viaSendOtp);
  });

  it('maps password_too_long', async () => {
    await expectMessageFor('password_too_long', 'Password is too long.', viaSendOtp);
  });

  it('maps password_required', async () => {
    await expectMessageFor('password_required', 'Please enter a password.', viaSendOtp);
  });

  it('maps invalid_password', async () => {
    await expectMessageFor('invalid_password', 'Incorrect password.', viaSendOtp);
  });

  it('maps password_not_set', async () => {
    await expectMessageFor('password_not_set', 'This account uses one-time codes only.', viaSendOtp);
  });

  it('maps current_password_required', async () => {
    await expectMessageFor('current_password_required', 'Enter your current password.', viaSendOtp);
  });

  it('maps current_password_invalid', async () => {
    await expectMessageFor('current_password_invalid', 'Current password is incorrect.', viaSendOtp);
  });

  it('falls back to the default branch for an unknown code (e.g. role_mismatch)', async () => {
    // Codes added by 1I (role_mismatch) and other future codes (db_error,
    // wrong_old_password, unauthorized, invalid_request) aren't yet mapped in
    // messageForCode — they should hit the default branch.
    await expectMessageFor(
      'role_mismatch',
      'Could not verify the code. Please try again.',
      viaSendOtp
    );
  });

  it('falls back to the default branch for db_error', async () => {
    await expectMessageFor(
      'db_error',
      'Could not verify the code. Please try again.',
      viaSendOtp
    );
  });

  it('falls back to the default branch for unauthorized', async () => {
    await expectMessageFor(
      'unauthorized',
      'Could not verify the code. Please try again.',
      viaSendOtp
    );
  });

  it('falls back to the default branch for invalid_request', async () => {
    await expectMessageFor(
      'invalid_request',
      'Could not verify the code. Please try again.',
      viaSendOtp
    );
  });
});

// ─── hasDashboard ───────────────────────────────────────────────────────────

describe('hasDashboard(role)', () => {
  it('returns true for every role with a built dashboard', () => {
    expect(hasDashboard('distributor')).toBe(true);
    expect(hasDashboard('branch')).toBe(true);
    expect(hasDashboard('subscriber')).toBe(true);
    expect(hasDashboard('agent')).toBe(true);
    // Employer gained a dashboard in the Employer-role Phase 0 (login wiring).
    expect(hasDashboard('employer')).toBe(true);
    // Admin shipped 2026-06-08 — all six roles now have dashboards.
    expect(hasDashboard('admin')).toBe(true);
  });

  it('returns false for unknown / undefined / empty input', () => {
    expect(hasDashboard('')).toBe(false);
    expect(hasDashboard(undefined)).toBe(false);
    expect(hasDashboard(null)).toBe(false);
    expect(hasDashboard('SUBSCRIBER')).toBe(false); // case-sensitive
    expect(hasDashboard('subscribers')).toBe(false); // not a substring match
  });
});

// ─── DASHBOARD_ROLES ────────────────────────────────────────────────────────

describe('DASHBOARD_ROLES', () => {
  it('is an array with the six built roles', () => {
    expect(Array.isArray(DASHBOARD_ROLES)).toBe(true);
    expect(DASHBOARD_ROLES).toEqual([
      'distributor',
      'branch',
      'subscriber',
      'agent',
      'employer',
      'admin',
    ]);
  });

  it('includes both employer and admin (all six roles are built)', () => {
    expect(DASHBOARD_ROLES).toContain('employer');
    expect(DASHBOARD_ROLES).toContain('admin');
  });

  it('is the source of truth for hasDashboard', () => {
    for (const role of DASHBOARD_ROLES) {
      expect(hasDashboard(role)).toBe(true);
    }
  });
});
