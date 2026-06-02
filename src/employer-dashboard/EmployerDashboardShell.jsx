// Employer dashboard shell — PHASE 0 PLACEHOLDER.
//
// Phase 0 (this commit) builds only the backend + login wiring for the
// employer role: an employer OTP/password login now mints a real signed JWT
// with an `employerId` claim, `hasDashboard('employer')` is true, and
// App.jsx's ProtectedDashboard dispatches to THIS component so the build
// stays green and an authenticated employer lands on /dashboard (not
// /coming-soon).
//
// Phase 1 REPLACES this file with the real desktop shell cloned from
// `branch-dashboard/BranchDashboardShell.jsx` (indigo hero banner, icon-rail
// sidebar, slide-in panels, EmployerScope/EmployerPanel providers). Until
// then this renders a minimal branded "coming soon" card and keeps the same
// role guard the real shell will use.

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function EmployerDashboardShell() {
  const { user, role } = useAuth();

  // Same guard the Phase 1 shell will use: non-employers bounce to the
  // coming-soon page rather than rendering an employer surface.
  if (role !== 'employer') return <Navigate to="/coming-soon" replace />;

  return (
    <main
      id="main"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'var(--color-indigo-deep, #1B1A4A)',
        color: '#fff',
        fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <p
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontSize: '0.75rem',
            opacity: 0.7,
            margin: 0,
          }}
        >
          Universal Pensions · Employer
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            fontSize: '1.875rem',
            margin: '0.75rem 0 0.5rem',
          }}
        >
          Employer dashboard — coming in Phase 1
        </h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6, margin: 0 }}>
          You are signed in as an employer
          {user?.employerId ? ` (${user.employerId})` : ''}. The full dashboard
          (overview, employees, contribution runs, insurance, reports, support)
          ships next.
        </p>
      </div>
    </main>
  );
}
