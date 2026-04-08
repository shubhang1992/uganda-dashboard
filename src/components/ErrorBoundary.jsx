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
        <div role="alert" style={{
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
          <style>{`
            .eb-refresh {
              background: var(--color-indigo);
              color: white;
              border: none;
              border-radius: var(--radius-full);
              padding: 0.75rem 2rem;
              font-family: var(--font-display);
              font-weight: 700;
              font-size: var(--text-sm);
              cursor: pointer;
              transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .eb-refresh:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 32px rgba(41, 40, 103, 0.3);
            }
            .eb-refresh:focus-visible {
              outline: 2px solid var(--color-indigo-soft);
              outline-offset: 2px;
            }
          `}</style>
          <button
            className="eb-refresh"
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
