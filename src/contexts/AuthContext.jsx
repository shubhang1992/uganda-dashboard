import { createContext, useContext, useState, useCallback } from 'react';

/**
 * @typedef {Object} AuthUser
 * @property {string} role - User role ('subscriber'|'employer'|'distributor'|'branch'|'agent'|'admin')
 * @property {string} phone - Phone number
 * @property {string} name - Display name
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

  const login = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  return (
    <AuthContext value={{ user, role: user?.role ?? null, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext>
  );
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
