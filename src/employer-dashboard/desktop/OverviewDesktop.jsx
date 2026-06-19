import { useAuth } from '../../contexts/AuthContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import {
  useEmployer,
  useEmployerMetrics,
  useEmployees,
  useContributionRuns,
  usePendingInvites,
} from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { PageHead, Hero, MetricRow, Tile, Card, SectionHead, StatusBadge } from './ui';
import { coinsIcon, walletIcon, buildingIcon, pendingIcon, shieldIcon } from './icons';
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

  const { data: employer } = useEmployer(employerId);
  const { data: metrics = {} } = useEmployerMetrics(employerId);
  const { data: employees = [] } = useEmployees(employerId);
  const { data: runs = [] } = useContributionRuns(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);

  const headcount = metrics.headcount || employees.length || 0;
  const active = metrics.active || employees.filter((e) => e.status === 'active').length || 0;
  const totalContributions = metrics.totalContributions
    || runs.reduce((s, r) => s + (r.grandTotal || 0), 0);

  // Employee vs employer leg totals across all runs (the two-leg split the hero
  // tiles surface). Falls back to 0 cleanly for a company with no runs yet.
  const employeeTotal = runs.reduce((s, r) => s + (r.employeeTotal || 0), 0);
  const employerTotal = runs.reduce((s, r) => s + (r.employerTotal || 0), 0);

  const latest = runs[0];
  const nextAmount = latest?.grandTotal ?? 0;
  const runDue = !latest
    || new Date(latest.runAt).getMonth() !== new Date().getMonth()
    || new Date(latest.runAt).getFullYear() !== new Date().getFullYear();

  const cfg = employer?.defaultContributionConfig;
  const funding = fundingModel(cfg);
  const cover = Number(cfg?.groupCoverAmount) || 0;
  const insuranceOn = (cfg?.insuranceEnabled ?? cover > 0) && cover > 0;

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

      {/* How your staff's pension is funded */}
      {funding && (
        <Card>
          <SectionHead icon={coinsIcon(18)} title="How your staff’s pension is funded" tag={funding.tag} />
          {funding.mode === 'co-contribution' ? (
            <div className={styles.fundStack}>
              <div className={styles.fundOwn} style={{ flex: funding.ownPct }}>
                <span className={styles.fundSegK}>Staff contributions</span>
                <span className={styles.fundSegV}>{funding.ownPct}%</span>
              </div>
              <div className={styles.fundEmp} style={{ flex: funding.empPct }}>
                <span className={styles.fundSegK}>Your top-up</span>
                <span className={styles.fundSegV}>{funding.empPct}%</span>
              </div>
            </div>
          ) : (
            <div className={styles.fundStack}>
              <div className={styles.fundEmp} style={{ flex: 1, borderRadius: 'var(--radius-md)' }}>
                <span className={styles.fundSegK}>Employer-funded</span>
                <span className={styles.fundSegV}>100%</span>
              </div>
            </div>
          )}
          <div className={styles.fundRules}>
            {funding.rules.map((r, i) => (
              <span key={i} className={styles.fundRule}>
                <span className={`${styles.dot} ${r.tone === 'own' ? styles.dotOwn : styles.dotEmp}`} />
                <b>{r.strong}</b>&nbsp;{r.rest}
              </span>
            ))}
          </div>
          <p className={styles.fundFoot}>{funding.foot}</p>
        </Card>
      )}

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
                <span className={styles.insK}>Cover per member</span>
                <span className={styles.insV}>{formatUGX(cover)}</span>
                <span className={styles.insSub}>flat group life</span>
              </div>
              <div className={styles.insStat}>
                <span className={styles.insK}>Premium / staff</span>
                <span className={styles.insV}>UGX 0</span>
                <span className={styles.insSub}>employer-funded</span>
              </div>
            </div>
            <div className={styles.insBar}><div className={styles.insBarFill} /></div>
            <div className={styles.insCap}>
              <span><span className={styles.insPct}>100%</span> of staff covered — all-or-nothing</span>
              <span>{formatUGX(cover * headcount)} total cover in force</span>
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
