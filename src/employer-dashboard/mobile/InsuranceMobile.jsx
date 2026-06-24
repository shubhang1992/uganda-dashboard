import { useNavigate } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer, useEmployerMetrics, useEmployees } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { groupPremiumPerMember } from '../../utils/groupInsurance';
import s from './employerMobile.module.css';

const HOW = [
  { lead: 'All-or-nothing', rest: '— every staff member is covered, or none are. There’s no partial roster.' },
  { lead: 'Same flat amount for everyone', rest: '— one flat amount of group life cover per member, regardless of pay or role.' },
  { lead: 'Premiums are fully employer-funded', rest: '— the company pays a flat monthly premium per member; your staff pay nothing and there’s no per-member opt-out.' },
  { lead: 'Managed from Settings', rest: '— turn cover on or off for the whole company; the change applies to every member at once.' },
];

const Check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
);

/**
 * InsuranceMobile — company-wide group life cover (phone). Fresh body against
 * useEmployer + useEmployerMetrics + useEmployees, mirroring InsuranceDesktop's
 * real all-or-nothing model: cover summary (or a set-up empty state) + how-it-
 * works + beneficiaries note. "Manage cover" deep-links Settings → Insurance tab.
 */
export default function InsuranceMobile() {
  const navigate = useNavigate();
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);
  const { data: metrics = {} } = useEmployerMetrics(employerId);
  const { data: employees = [] } = useEmployees(employerId);

  const headcount = metrics.headcount || employees.length || 0;
  const cfg = employer?.defaultContributionConfig;
  const cover = Number(cfg?.groupCoverAmount) || 0;
  const insuranceOn = (cfg?.insuranceEnabled ?? cover > 0) && cover > 0;
  const totalCover = cover * headcount;
  // Group-life premium the employer funds (priced at the individual life rate).
  const premiumPerStaff = groupPremiumPerMember(cover);
  const totalPremium = premiumPerStaff * headcount;

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`}>
        <div className={s.cardHd} style={{ marginBottom: 6 }}>
          <h3>Group life cover</h3>
          <span className={`${s.pill} ${insuranceOn ? s.pillOk : s.pillOff}`}><i />{insuranceOn ? 'On' : 'Off'}</span>
        </div>

        {insuranceOn ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-gray)', lineHeight: 1.5 }}>
              Cover applies to all {formatNumber(headcount)} staff at a flat amount each — the employer funds the monthly premium, staff pay nothing, and there’s no per-member opt-out.
            </p>
            <div className={s.kpi2} style={{ marginTop: 14 }}>
              <div className={s.kpiC}><div className={s.kpiLbl}>Cover / member</div><div className={s.kpiV}>{formatUGX(cover, { compact: true })}</div></div>
              <div className={s.kpiC}><div className={s.kpiLbl}>Premium / member</div><div className={s.kpiV}>{formatUGX(premiumPerStaff, { compact: true })}<span style={{ fontSize: 11, color: 'var(--color-gray)', fontWeight: 600 }}> /mo</span></div></div>
              <div className={s.kpiC}><div className={s.kpiLbl}>Total in force</div><div className={s.kpiV}>{formatUGX(totalCover, { compact: true })}</div></div>
              <div className={s.kpiC}><div className={s.kpiLbl}>Total premium</div><div className={s.kpiV}>{formatUGX(totalPremium, { compact: true })}<span style={{ fontSize: 11, color: 'var(--color-gray)', fontWeight: 600 }}> /mo</span></div></div>
            </div>
            <button type="button" className={`${s.btn} ${s.btnSec} ${s.btnBlock}`} style={{ marginTop: 14 }} onClick={() => navigate('/dashboard/settings?tab=insurance')}>
              Manage cover in Settings
            </button>
          </>
        ) : (
          <>
            <p className={s.note} style={{ marginTop: 12 }}>
              No group cover set up yet. Turn on company-wide group life cover from Settings — it applies to every staff member at the same flat amount.
            </p>
            <button type="button" className={`${s.btn} ${s.btnPri} ${s.btnBlock}`} style={{ marginTop: 14 }} onClick={() => navigate('/dashboard/settings?tab=insurance')}>
              Set up cover
            </button>
          </>
        )}
      </div>

      <div className={s.card}>
        <div className={s.cardHd}><h3>How it works</h3></div>
        {HOW.map((b) => (
          <div key={b.lead} className={`${s.lrow} ${s.lrowStatic}`} style={{ alignItems: 'flex-start' }}>
            <span className={`${s.setRowIc} ${s.tintGreen}`} style={{ width: 30, height: 30 }}>{Check}</span>
            <span className={s.lMid}>
              <span style={{ fontSize: 12.5, color: 'var(--color-slate)', lineHeight: 1.5 }}>
                <b style={{ color: 'var(--color-indigo)', fontFamily: 'var(--font-display)' }}>{b.lead}</b> {b.rest}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className={s.card}>
        <div className={s.cardHd}><h3>Beneficiaries</h3></div>
        <p style={{ fontSize: 12.5, color: 'var(--color-gray)', lineHeight: 1.55 }}>
          Each staff member nominates their own beneficiaries when they sign up. The employer doesn&apos;t manage individual nominees — those details stay private to each member.
        </p>
      </div>
    </div>
  );
}
