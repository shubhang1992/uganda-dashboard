import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  useEmployer,
  useEmployerMetrics,
  useEmployees,
  useContributionRuns,
  usePendingInvites,
} from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { groupInsuranceProducts, groupInsurancePremiumPerMember } from '../../utils/groupInsurance';
import { PageHead, Hero, MetricRow, Tile, Card, SectionHead, StatusBadge } from './ui';
import { coinsIcon, walletIcon, buildingIcon, pendingIcon, shieldIcon } from './icons';
import FundingPanel from './FundingPanel';
import NeedsAttention from './NeedsAttention';
import ui from './ui.module.css';
import styles from './OverviewDesktop.module.css';

/* Funding split derived from the company contribution config. Co-contribution
   splits employee vs employer leg by the match ratio (100 : matchPct);
   employer-only is a single employer-funded leg. Mirrors the run math in
   ContributionRuns / the mockup's "How your staff's pension is funded" card. */
function fundingModel(cfg) {
  if (!cfg) return null;
  if (cfg.mode === 'employer-only') {
    const pct = Number(cfg.employerPct) || 0;
    const amount = Number(cfg.employerAmount) || 0;
    const basis = cfg.employerBasis === 'fixed' ? 'fixed' : 'percent';
    return {
      mode: 'employer-only',
      tag: 'Employer-only',
      ownPct: 0,
      empPct: 100,
      rules: [
        basis === 'fixed'
          ? { tone: 'emp', strong: `UGX ${formatNumber(amount)}`, rest: 'per member each run, funded entirely by you' }
          : { tone: 'emp', strong: `You fund ${pct}%`, rest: 'of each member’s pay; staff contribute nothing' },
      ],
      foot: basis === 'fixed'
        ? `Every active staff member is funded with a flat UGX ${formatNumber(amount)} each run — staff contribute nothing.`
        : `You fund ${pct}% of each member’s monthly pay toward their retirement — staff contribute nothing.`,
    };
  }
  // co-contribution
  const employeePct = Number(cfg.employeePct) || 0;
  const matchPct = Number(cfg.employerMatchPct) || 0;
  const ownPct = Math.round((100 / (100 + matchPct)) * 100);
  return {
    mode: 'co-contribution',
    tag: 'Co-contribution',
    ownPct,
    empPct: 100 - ownPct,
    rules: [
      { tone: 'own', strong: `Staff save ${employeePct}%`, rest: 'of their monthly pay' },
      { tone: 'emp', strong: `You add ${matchPct}%`, rest: 'on top of what they save' },
    ],
    foot: `Your match turns every UGX 100 a staff member saves into UGX ${100 + matchPct} toward their retirement.`,
  };
}

export default function OverviewDesktop() {
  const { user } = useAuth();
  const { employerId } = useEmployerScope();
  const navigate = useNavigate();
  const { setKycOpen } = useEmployerPanel();

  const { data: employer } = useEmployer(employerId);
  const { data: metrics = {} } = useEmployerMetrics(employerId);
  const { data: employees = [] } = useEmployees(employerId);
  const { data: runs = [] } = useContributionRuns(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);

  const headcount = metrics.headcount || employees.length || 0;
  const active = metrics.active || employees.filter((e) => e.status === 'active').length || 0;
  // "Total contributions" is PENSION (employee + employer). Insurance premiums
  // are a separate leg in the run and are excluded here — the metrics RPC counts
  // type='contribution' only, so the fallback sums the two pension legs (NOT
  // grandTotal, which now includes the insurance premium).
  const totalContributions = metrics.totalContributions
    || runs.reduce((s, r) => s + ((r.employeeTotal || 0) + (r.employerTotal || 0)), 0);

  // Employee vs employer leg totals across all runs (the two-leg split the hero
  // tiles surface). Falls back to 0 cleanly for a company with no runs yet.
  const employeeTotal = runs.reduce((s, r) => s + (r.employeeTotal || 0), 0);
  const employerTotal = runs.reduce((s, r) => s + (r.employerTotal || 0), 0);

  const latest = runs[0];
  // Next contribution forecast = pension only (employee + employer), consistent
  // with the "contributions" framing; insurance shows on its own card/run leg.
  const nextAmount = latest ? (latest.employeeTotal || 0) + (latest.employerTotal || 0) : 0;
  const runDue = !latest
    || new Date(latest.runAt).getMonth() !== new Date().getMonth()
    || new Date(latest.runAt).getFullYear() !== new Date().getFullYear();

  const cfg = employer?.defaultContributionConfig;
  const funding = fundingModel(cfg);
  // Multi-product group insurance (Life / Health / Funeral), employer-funded.
  const insProducts = groupInsuranceProducts(cfg);
  const insuranceOn = insProducts.length > 0;
  const premiumPerStaff = groupInsurancePremiumPerMember(cfg); // Σ products / mo
  const totalPremiumMonthly = premiumPerStaff * headcount;
  const totalCover = insProducts.reduce((s, p) => s + p.cover, 0);

  const pendingKyc = pendingInvites.length;
  const companyName = employer?.name || 'Your company';
  const contactName = employer?.contactName || user?.name || 'there';

  const employeeRateLabel = cfg?.mode === 'co-contribution' && cfg?.employeePct
    ? `Saved by staff · ${cfg.employeePct}% of pay`
    : 'Saved by staff';
  const employerRateLabel = cfg?.mode === 'co-contribution' && cfg?.employerMatchPct
    ? `Your ${cfg.employerMatchPct}% match · added on top`
    : 'Funded by you · added on top';

  return (
    <div className={ui.stack}>
      <PageHead eyebrow={`Welcome back, ${contactName}`} title={companyName} />

      <Hero
        icon={coinsIcon(24)}
        eyebrow="Total contributions to date · employee + employer"
        value={formatUGX(totalContributions, { compact: false })}
      >
        <span className={ui.pos}>
          <strong>{formatNumber(active)}</strong> of {formatNumber(headcount)} staff active
        </span>
      </Hero>

      <MetricRow cols={4}>
        <Tile
          accent="indigoSoft"
          icon={walletIcon(18)}
          label="Next contribution"
          value={formatUGX(nextAmount)}
          sub={runDue ? 'Due now · funds all active staff' : 'Monthly cadence · all active staff'}
        />
        <Tile
          accent="indigo"
          icon={coinsIcon(18)}
          label="Total employee contribution"
          value={formatUGX(employeeTotal)}
          sub={employeeRateLabel}
        />
        <Tile
          accent="green"
          icon={buildingIcon(18)}
          label="Total employer contribution"
          value={formatUGX(employerTotal)}
          sub={employerRateLabel}
        />
        <Tile
          accent="teal"
          icon={pendingIcon(18)}
          label="Pending KYC"
          value={formatNumber(pendingKyc)}
          sub={pendingKyc > 0 ? 'Invited · awaiting sign-up' : 'No pending invites'}
        />
      </MetricRow>

      {/* Funding split (pie) + Needs attention — two-column row */}
      <div className={styles.splitRow}>
        {funding && (
          <Card>
            <SectionHead icon={coinsIcon(18)} title="How your staff’s pension is funded" tag={funding.tag} />
            <FundingPanel funding={funding} />
          </Card>
        )}

        {/* Needs attention — desktop status tiles (extracted) */}
        <Card>
          <NeedsAttention
            runDue={runDue}
            latestLabel={latest?.periodLabel}
            pendingKyc={pendingKyc}
            insuranceOn={insuranceOn}
            cover={totalCover}
            onRun={() => navigate('/dashboard/runs')}
            onKyc={() => setKycOpen(true)}
            onInsurance={() => navigate('/dashboard/insurance')}
          />
        </Card>
      </div>

      {/* Group insurance */}
      <Card accent="teal">
        <SectionHead
          icon={shieldIcon(20)}
          iconTone="teal"
          title="Group insurance"
          action={
            insuranceOn
              ? <StatusBadge tone="active">Active</StatusBadge>
              : <StatusBadge tone="inactive" dot={false}>Off</StatusBadge>
          }
        />
        {insuranceOn ? (
          <>
            <div className={styles.insStats}>
              <div className={styles.insStat}>
                <span className={styles.insK}>Covered staff</span>
                <span className={styles.insV}>{formatNumber(headcount)}</span>
                <span className={styles.insSub}>every staff member</span>
              </div>
              <div className={styles.insStat}>
                <span className={styles.insK}>Products</span>
                <span className={styles.insV}>{formatNumber(insProducts.length)}</span>
                <span className={styles.insSub}>{insProducts.map((p) => p.product).join(' · ')}</span>
              </div>
              <div className={styles.insStat}>
                <span className={styles.insK}>Premium / staff</span>
                <span className={styles.insV}>{formatUGX(premiumPerStaff)}</span>
                <span className={styles.insSub}>per month · employer-funded</span>
              </div>
              <div className={styles.insStat}>
                <span className={styles.insK}>Total premium</span>
                <span className={styles.insV}>{formatUGX(totalPremiumMonthly)}</span>
                <span className={styles.insSub}>per month · company-wide</span>
              </div>
            </div>
            <div className={styles.insProducts}>
              {insProducts.map((p) => (
                <div className={styles.insProduct} key={p.product}>
                  <span className={styles.insProductName}>{p.product}</span>
                  <span className={styles.insProductCover}>{formatUGX(p.cover)} cover</span>
                  <span className={styles.insProductPrem}>{formatUGX(p.premiumMonthly)}/mo</span>
                </div>
              ))}
            </div>
            <div className={styles.insBar}><div className={styles.insBarFill} /></div>
            <div className={styles.insCap}>
              <span><span className={styles.insPct}>100%</span> of staff covered — staff pay nothing</span>
              <span>{formatUGX(totalCover * headcount)} total cover in force</span>
            </div>
          </>
        ) : (
          <p className={styles.insEmpty}>
            No group cover set up yet. Turn on company-wide group life cover from Settings — it
            applies to every staff member at the same flat amount.
          </p>
        )}
      </Card>
    </div>
  );
}
