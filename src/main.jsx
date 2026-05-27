import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import * as Sentry from '@sentry/react';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import ToastContainer from './components/Toast.jsx';
import { API_BASE_URL } from './config/env.js';
import './index.css';
import App from './App.jsx';

// G69 — Frontend Sentry. Gated on VITE_SENTRY_DSN so the absence of the env
// var leaves the bundle inert (no side effects, no network). When the DSN is
// present we report unhandled errors + a small trace sample. The
// ErrorBoundary's componentDidCatch also forwards into this when configured.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Derive the API origin (no `/api` suffix) so we can hit `/healthz`, which
 * Express mounts at the root of the server, not under `/api`. Works for both
 * the dev rewrite (`/api`) and an absolute prod URL.
 */
function deriveHealthcheckUrl(apiBase) {
  // Strip a trailing `/api` (or `/api/`) to land on the server root.
  const root = apiBase.replace(/\/api\/?$/, '');
  if (!root || root === '/') return '/healthz';
  return `${root}/healthz`;
}

/**
 * B20 — Render free-tier instances cold-start in 30–60s. While the backend
 * boots, a sales rep clicking the demo sees nothing happen until their first
 * request resolves or times out (20s — see apiFetch). The warmup banner pings
 * `/healthz` (a no-I/O liveness route) on mount and shows a global notice
 * until either the ping resolves or 3 seconds elapse, whichever happens
 * first. After that we hide regardless — the user can still proceed; cold
 * starts beyond 3s are unusual on warm regions and the rest of the UI is
 * usable while the ping continues in the background.
 */
function useWarmup() {
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

function WarmupBanner() {
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <MotionConfig reducedMotion="user">
              <WarmupBanner />
              <App />
              <ToastContainer />
            </MotionConfig>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
