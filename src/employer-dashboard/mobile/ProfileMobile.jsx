import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer, useEmployerMetrics, usePendingInvites } from '../../hooks/useEmployer';
import { formatNumber } from '../../utils/currency';
import s from './employerMobile.module.css';

function initials(name) {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

const Chevron = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

const TILES = [
  {
    to: '/dashboard/settings', label: 'Settings', sub: 'Company & funding',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.1A1.6 1.6 0 007 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 001.1-2.7H1a2 2 0 010-4h.1A1.6 1.6 0 002.6 7" /></svg>,
  },
  {
    to: '/dashboard/insurance', label: 'Insurance', sub: 'Group cover',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>,
  },
  {
    to: '/dashboard/analytics', label: 'Analytics', sub: 'Workforce data',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>,
  },
];

/**
 * ProfileMobile — the "Company" tab: a hub (identity card + tiles + rows), no
 * metric clusters (per the employer/Profile design-taste rule). Mobile-only route.
 */
export default function ProfileMobile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);
  const { data: metrics = {} } = useEmployerMetrics(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);

  const name = employer?.name || 'Your company';
  const contact = employer?.contactName || user?.name || '';
  const district = employer?.district;
  const headcount = metrics.headcount || 0;
  const pendingKyc = pendingInvites.length;

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`}>
        <div className={s.acct}>
          <span className={s.acctAv}>{initials(name)}</span>
          <div>
            <div className={s.acctNm}>{name}</div>
            {contact && <div className={s.acctMt}>{contact}</div>}
          </div>
        </div>
        <div className={s.tagRow}>
          <span className={s.tag} style={{ background: 'color-mix(in srgb, var(--color-indigo) 9%, #fff)', color: 'var(--color-indigo)', borderColor: 'var(--color-lavender)' }}>Employer</span>
          {district && <span className={s.tag}>{district}</span>}
          {headcount > 0 && <span className={s.tag}>{formatNumber(headcount)} staff</span>}
        </div>
      </div>

      <div className={s.tiles}>
        {TILES.map((t) => (
          <button key={t.to} type="button" className={s.tile} onClick={() => navigate(t.to)} aria-label={t.label}>
            <span className={s.tileIc}>{t.icon}</span>
            <span><b>{t.label}</b><small>{t.sub}</small></span>
          </button>
        ))}
        <button type="button" className={s.tile} onClick={() => navigate('/dashboard/support')} aria-label="Support">
          <span className={s.tileIc}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          </span>
          <span><b>Support</b><small>Tickets</small></span>
        </button>
      </div>

      <div className={s.card}>
        <button type="button" className={s.setRow} onClick={() => navigate('/dashboard/pending-kyc')}>
          <span className={`${s.setRowIc} ${s.tintAmber}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
          </span>
          <span className={s.lMid}><b>Pending KYC invites</b><small>{pendingKyc > 0 ? `${formatNumber(pendingKyc)} awaiting sign-up` : 'None awaiting sign-up'}</small></span>
          <span className={s.chev}>{Chevron}</span>
        </button>
        <button type="button" className={s.setRow} onClick={() => navigate('/dashboard/settings')}>
          <span className={`${s.setRowIc} ${s.tintIndigo}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          </span>
          <span className={s.lMid}><b>Password &amp; security</b><small>Change your sign-in password</small></span>
          <span className={s.chev}>{Chevron}</span>
        </button>
      </div>

      <button type="button" className={s.signout} onClick={() => { logout(); navigate('/'); }}>Sign out</button>
      <div className={s.ver}>Universal Pensions · Employer</div>
    </div>
  );
}
