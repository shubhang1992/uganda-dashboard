import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { monthlyEquivalent } from '../../../utils/finance';
import { formatUGX, formatNumber } from '../../../utils/currency';
import { useAuth } from '../../../contexts/AuthContext';
import { useEntity } from '../../../hooks/useEntity';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import { useCountUp } from '../../../hooks/useCountUp';
import HeroCapsule from '../../../components/HeroCapsule';
import styles from './PulseCard.module.css';

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/**
 * PulseCard — the agent home dome. Wraps the shared HeroCapsule (same pattern
 * as the subscriber PulseCard) so the greeting renders as the page <h1>, with
 * MONTHLY CONTRIBUTION VOLUME as the headline metric and a stat row of
 * subscribers · active % · lifetime commissions.
 *
 * NOTE (E2E contract): the literal string "Monthly contribution volume" MUST
 * stay present and visible on Home — the smoke spec asserts getByText on it.
 */
export default function PulseCard({ agentId }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const { data: agent } = useEntity('agent', agentId);
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissionDetail } = useAgentCommissionDetail(agentId);

  const firstName = (user?.name || agent?.name || 'there').split(' ')[0];
  const greeting = `Good ${hourGreeting()}, ${firstName}`;

  const summary = useMemo(() => {
    let monthly = 0;
    let active = 0;
    for (const s of subscribers) {
      monthly += monthlyEquivalent(s.contributionSchedule);
      if (s.isActive) active += 1;
    }
    const total = subscribers.length;
    const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
    return { monthly, active, total, activePct };
  }, [subscribers]);

  const commissionsTotal = useMemo(() => {
    const all = commissionDetail?.commissions || [];
    let paid = 0;
    for (const c of all) {
      if (c.status === 'released' || c.status === 'confirmed') paid += c.amount || 0;
    }
    return paid;
  }, [commissionDetail]);

  // useCountUp returns 0 when run is false (reduced-motion), so snap to the
  // resolved monthly figure in that case instead of showing a stuck "0".
  const counted = useCountUp(summary.monthly, 1100, !reduce);
  const amountLabel = formatNumber(Math.round(reduce ? summary.monthly : counted));

  const statRow = (
    <>
      <span>
        <strong>{formatNumber(summary.total)}</strong> subscriber{summary.total === 1 ? '' : 's'}
      </span>
      <span>
        <strong>{summary.activePct}%</strong> active
      </span>
      <span>
        <strong>{formatUGX(commissionsTotal)}</strong> commissions
      </span>
    </>
  );

  const addIcon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );

  return (
    <section className={styles.wrap} aria-label="Portfolio overview">
      <HeroCapsule
        title={greeting}
        eyebrow="Monthly contribution volume"
        prefix="UGX"
        amount={amountLabel}
        statRow={statRow}
        menuIcon={addIcon}
        menuLabel="Onboard a new subscriber"
        onMenu={() => navigate('/dashboard/onboard')}
      />
    </section>
  );
}
