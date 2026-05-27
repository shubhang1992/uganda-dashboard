import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/env.js';

/**
 * Derive the API origin (no `/api` suffix) so we can hit `/healthz`, which
 * Express mounts at the root of the server, not under `/api`. Works for both
 * the dev rewrite (`/api`) and an absolute prod URL.
 */
function deriveHealthcheckUrl(apiBase) {
  const root = apiBase.replace(/\/api\/?$/, '');
  if (!root || root === '/') return '/healthz';
  return `${root}/healthz`;
}

/**
 * Render free-tier instances cold-start in 30–60s. While the backend boots,
 * a sales rep clicking the demo sees nothing happen until their first
 * request resolves or times out (20s — see apiFetch). The hook pings
 * `/healthz` (a no-I/O liveness route) on mount and resolves to `false`
 * either when the ping returns or after 3 seconds, whichever happens
 * first. After that the banner hides regardless — the rest of the UI is
 * usable while the ping continues in the background.
 */
export function useWarmup() {
  const [waking, setWaking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = deriveHealthcheckUrl(API_BASE_URL);
    const timer = setTimeout(() => {
      if (!cancelled) setWaking(false);
    }, 3000);
    fetch(url, { method: 'GET' })
      .then(() => {
        if (!cancelled) setWaking(false);
      })
      .catch(() => {
        // Ping itself failed — let the 3s timer hide the banner. The real
        // fetch the user triggers will surface a typed error via apiFetch.
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return waking;
}

export default function WarmupBanner() {
  const waking = useWarmup();
  if (!waking) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 16px',
        background: '#292867',
        color: '#fff',
        fontSize: '13px',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 500,
        textAlign: 'center',
        letterSpacing: '0.01em',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      Waking up the demo backend…
    </div>
  );
}
