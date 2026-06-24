import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer, useEmployerMetrics, useEmployees } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { groupPremiumPerMember } from '../../utils/groupInsurance';
import { PageHead, MetricRow, Tile, Card, SectionHead, StatusBadge, Btn } from './ui';
import { shieldIcon, walletIcon, coinsIcon, sparkIcon, checkIcon, lockIcon, settingsIcon } from './icons';
import ui from './ui.module.css';
import styles from './InsuranceDesktop.module.css';

// Page-local glyphs (not in icons.jsx): a people glyph for "covered staff" and a
// heart glyph for "total cover in force" — matching the mockup's #i-users / #i-heart.
const usersIcon = (size = 18) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 20v-1.5a4 4 0 014-4h3a4 4 0 014 4V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 5.2a3.2 3.2 0 010 6M19.5 20v-1.5a4 4 0 00-2.5-3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// The four "how it works" bullets. The bold lead-in is rendered in indigo; the
// rest follows in slate.
const HOW_IT_WORKS = [
  {
    lead: 'All-or-nothing',
    rest: '— every staff member is covered, or none are. There’s no partial roster.',
  },
  {
    lead: 'Same flat amount for everyone',
    rest: '— one flat amount of group life cover per member, regardless of pay or role.',
  },
  {
    lead: 'Premiums are fully employer-funded',
    rest: '— the company pays a flat monthly premium per member; your staff pay nothing and there’s no per-member opt-out.',
  },
  {
    lead: 'Managed from Settings',
    rest: '— turn cover on or off for the whole company, and the change applies to every member at once.',
  },
];

export default function InsuranceDesktop() {
  const { employerId } = useEmployerScope();

  const { data: employer } = useEmployer(employerId);
  const { data: metrics = {} } = useEmployerMetrics(employerId);
  const { data: employees = [] } = useEmployees(employerId);

  const headcount = metrics.headcount || employees.length || 0;

  const cfg = employer?.defaultContributionConfig;
  const cover = Number(cfg?.groupCoverAmount) || 0;
  // Back-compat: an un-migrated config with a positive cover counts as enabled.
  const insuranceOn = (cfg?.insuranceEnabled ?? cover > 0) && cover > 0;
  const totalCover = cover * headcount;
  // Group-life premium the employer funds (priced at the individual life rate).
  const premiumPerStaff = groupPremiumPerMember(cover);
  const totalPremium = premiumPerStaff * headcount;

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Benefits"
        title="Insurance"
        sub="Company-wide group life cover — one flat amount for every staff member."
      />

      {/* 1) Group life cover summary */}
      <Card accent="teal">
        <SectionHead
          icon={shieldIcon(20)}
          iconTone="teal"
          title="Group life cover"
          action={
            <span className={styles.headActions}>
              <Btn variant="secondary" size="sm" to="/dashboard/settings">
                {settingsIcon(16)} Manage cover
              </Btn>
              {insuranceOn ? (
                <StatusBadge tone="active">Active</StatusBadge>
              ) : (
                <StatusBadge tone="inactive" dot={false}>Off</StatusBadge>
              )}
            </span>
          }
        />

        {insuranceOn ? (
          <>
            <MetricRow cols={4}>
              <Tile
                accent="indigo"
                icon={usersIcon(18)}
                label="Covered staff"
                value={formatNumber(headcount)}
                sub="every staff member"
              />
              <Tile
                accent="teal"
                icon={shieldIcon(18)}
                label="Cover per member"
                value={formatUGX(cover)}
                sub="flat group life"
              />
              <Tile
                accent="green"
                icon={walletIcon(18)}
                label="Premium / staff"
                value={formatUGX(premiumPerStaff)}
                sub="per month · employer-funded"
              />
              <Tile
                accent="indigoSoft"
                icon={coinsIcon(18)}
                label="Total premium / mo"
                value={formatUGX(totalPremium)}
                sub={`${formatUGX(premiumPerStaff)} × ${formatNumber(headcount)}`}
              />
            </MetricRow>

            <div className={styles.insBar}><div className={styles.insBarFill} /></div>
            <div className={styles.insCap}>
              <span>
                <span className={styles.insPct}>100%</span> of staff covered — all-or-nothing
              </span>
              <span>{formatUGX(totalCover)} total cover in force</span>
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <p className={styles.insEmpty}>
              No group cover set up yet. Turn on company-wide group life cover from Settings — it
              applies to every staff member at the same flat amount.
            </p>
            <Btn variant="primary" to="/dashboard/settings">
              {shieldIcon(16)} Set up cover
            </Btn>
          </div>
        )}
      </Card>

      {/* 2) How it works */}
      <Card>
        <SectionHead icon={sparkIcon(18)} title="How it works" />
        <div className={styles.bullets}>
          {HOW_IT_WORKS.map((b) => (
            <div key={b.lead} className={styles.bullet}>
              <span className={styles.bulletIc}>{checkIcon(16)}</span>
              <p className={styles.bulletText}>
                <b>{b.lead}</b>&nbsp;{b.rest}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* 3) Beneficiaries */}
      <Card>
        <SectionHead icon={lockIcon(18)} title="Beneficiaries" />
        <p className={styles.note}>
          Each staff member nominates their own beneficiaries when they sign up. The employer
          doesn’t manage individual nominees — those details stay private to each member.
        </p>
      </Card>
    </div>
  );
}
