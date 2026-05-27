import { Component } from 'react';
import styles from './ErrorBoundary.module.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // G69 — Frontend Sentry capture. Gated on VITE_SENTRY_DSN at runtime so
    // the import is a no-op when Sentry isn't configured for this env. Use
    // a dynamic import so the SDK only loads on a real error path (keeps
    // the cold critical path lean).
    if (import.meta.env.VITE_SENTRY_DSN) {
      import('@sentry/react').then((Sentry) =>
        Sentry.captureException(error, { contexts: { react: errorInfo } })
      ).catch(() => { /* if Sentry import fails, the console log below still runs */ });
    }
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className={styles.wrap}>
          <h2 className={styles.title}>Something went wrong</h2>
          <p className={styles.message}>
            An unexpected error occurred. Please refresh the page to try again.
          </p>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => window.location.reload()}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
