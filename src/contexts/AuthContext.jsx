import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthExpired } from '../services/api';

/**
 * @typedef {Object} AuthUser
 * @property {string} role - User role ('subscriber'|'employer'|'distributor'|'branch'|'agent'|'admin')
 * @property {string} phone - Phone number
 * @property {string} name - Display name
 * @property {{frequency:'weekly'|'monthly'|'quarterly'|'half-yearly'|'annually', amount:number, retirementPct:number, emergencyPct:number}|null} [contributionSchedule] - Subscriber's one-time contribution plan; editable later from account settings.
 */

/**
 * @typedef {Object} AuthContextValue
 * @property {AuthUser|null} user - Current user or null if not authenticated
 * @property {string|null} role - Shortcut to user.role
 * @property {boolean} isAuthenticated - Whether a user session exists
 * @property {(userData: AuthUser) => void} login - Store session and set user
 * @property {() => void} logout - Clear session
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

  const login = useCallback((userData) => {
    setUser(userData);
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
    } catch {
      // Quota / private-browsing — non-fatal; session lives in memory only.
    }
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
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // Storage may be inaccessible — non-fatal.
    }
    // Drop cached server data so the next user doesn't inherit it.
    queryClient.clear();
  }, [queryClient]);

  // When the API client surfaces a 401, log out and route home via
  // react-router rather than a full page reload.
  useEffect(() => onAuthExpired(() => {
    logout();
    navigate('/');
  }), [logout, navigate]);

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
