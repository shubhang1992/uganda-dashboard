import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthExpired } from '../services/api';
import { setToken, clearToken } from '../services/supabaseClient';

/**
 * @typedef {Object} AuthUser
 * @property {string} role - 'subscriber'|'employer'|'distributor'|'branch'|'agent'|'admin'
 * @property {string} phone - Phone number (E.164)
 * @property {string} [name] - Display name; may be omitted by the backend.
 *   AuthContext falls back to `phone` for display when missing.
 * @property {string} [subscriberId] - Set when role === 'subscriber'
 * @property {string} [agentId] - Set when role === 'agent'
 * @property {string} [branchId] - Set when role === 'branch'
 * @property {string} [distributorId] - Set when role === 'distributor'
 * @property {{frequency:'weekly'|'monthly'|'quarterly'|'half-yearly'|'annually', amount:number, retirementPct:number, emergencyPct:number}|null} [contributionSchedule]
 */

/**
 * @typedef {Object} AuthContextValue
 * @property {AuthUser|null} user
 * @property {string|null} role - Shortcut to user.role
 * @property {boolean} isAuthenticated
 * @property {(payload: { token: string, user: AuthUser }) => Promise<AuthUser>} login
 *   - Persists the JWT (`upensions_token`) and user object (`upensions_auth`),
 *     updates React state, and returns the resolved user.
 * @property {() => void} logout - Clears both auth keys + React Query cache.
 * @property {(updates: Partial<AuthUser>) => void} updateUser - Merge partial updates.
 */

const AUTH_KEY = 'upensions_auth';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * Persist the JWT + user object and resolve with the user so callers can do
   * `await login({...}).then(() => navigate(...))`.
   * Signature is `({ token, user })` rather than the legacy bare user object.
   */
  const login = useCallback(async ({ token, user: nextUser }) => {
    if (token) setToken(token);
    setUser(nextUser);
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(nextUser));
    } catch {
      // Quota / private-browsing — non-fatal; session lives in memory only.
    }
    return nextUser;
  }, []);

  /** Apply partial updates to the active session (e.g. profile edits). */
  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify(next));
      } catch {
        // Storage may be inaccessible — non-fatal.
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearToken();
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // Storage may be inaccessible — non-fatal.
    }
    // Drop cached server data so the next user doesn't inherit it.
    queryClient.clear();
  }, [queryClient]);

  // When the API client surfaces a 401, log out and route home via
  // react-router rather than a full page reload. Use refs so the listener
  // body stays identity-stable across renders while always reading the
  // current `logout` + `navigate` callbacks — subscribing once on mount.
  const logoutRef = useRef(logout);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    logoutRef.current = logout;
  });
  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => onAuthExpired(() => {
    logoutRef.current();
    navigateRef.current('/');
  }), []);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, isAuthenticated: !!user, login, logout, updateUser }),
    [user, login, logout, updateUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

/**
 * Access the authentication context.
 * @returns {AuthContextValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
