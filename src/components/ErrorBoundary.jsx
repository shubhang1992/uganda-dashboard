import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'var(--font-body)',
          color: 'var(--color-slate)',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--color-indigo)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 800,
          }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--color-gray)', maxWidth: '400px' }}>
            An unexpected error occurred. Please refresh the page to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--color-indigo)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '0.75rem 2rem',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
