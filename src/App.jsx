import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { SignInProvider } from './contexts/SignInContext';
import { useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import TimeJourney from './components/TimeJourney';
import ForYou from './components/ForYou';
import Trust from './components/Trust';
import CTA from './components/CTA';
import Footer from './components/Footer';
import StickyMobileCTA from './components/StickyMobileCTA';
import SignInModal from './components/SignInModal';
import { hasDashboard } from './services/auth';

const DashboardShell = lazy(() => import('./dashboard/DashboardShell'));
const BranchDashboardShell = lazy(() => import('./branch-dashboard/BranchDashboardShell'));

function DashboardFallback() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--color-cloud)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '2.5px solid var(--color-lavender)',
        borderTopColor: 'var(--color-indigo)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  );
}

const ROLE_LABELS = {
  subscriber: 'Subscriber',
  employer: 'Employer',
  distributor: 'Distributor Admin',
  branch: 'Branch Admin',
  agent: 'Agent',
  admin: 'Admin',
};

function LandingPage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <HowItWorks />
        <TimeJourney />
        <ForYou />
        <Trust />
        <CTA />
      </main>
      <Footer />
      <StickyMobileCTA />
    </>
  );
}

function ComingSoon() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  function handleBack() {
    logout();
    navigate('/');
  }

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
      background: 'var(--color-cloud)',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(41, 40, 103, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-indigo)',
      }}>
        <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        color: 'var(--color-indigo)',
        fontSize: 'var(--text-2xl)',
        fontWeight: 800,
        letterSpacing: '-0.03em',
        margin: 0,
      }}>
        {ROLE_LABELS[role] || 'Dashboard'} coming soon
      </h2>
      <p style={{ color: 'var(--color-gray)', maxWidth: 380, margin: 0, lineHeight: 1.6 }}>
        We&apos;re building your personalised dashboard experience. Check back soon.
      </p>
      <button
        onClick={handleBack}
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
          marginTop: '0.5rem',
        }}
      >
        Back to home
      </button>
    </div>
  );
}

function ProtectedDashboard() {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!hasDashboard(role)) return <Navigate to="/coming-soon" replace />;
  return (
    <ErrorBoundary>
      <Suspense fallback={<DashboardFallback />}>
        {role === 'branch' ? <BranchDashboardShell /> : <DashboardShell />}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <SignInProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/coming-soon" element={<ComingSoon />} />
        <Route path="/dashboard/*" element={<ProtectedDashboard />} />
      </Routes>
      <SignInModal />
    </SignInProvider>
  );
}
