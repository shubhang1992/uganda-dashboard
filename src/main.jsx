import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import * as Sentry from '@sentry/react';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import ToastContainer from './components/Toast.jsx';
import WarmupBanner from './components/WarmupBanner.jsx';
import './index.css';
import App from './App.jsx';

// Frontend Sentry. Gated on VITE_SENTRY_DSN so the absence of the env var
// leaves the bundle inert (no side effects, no network). When the DSN is
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
