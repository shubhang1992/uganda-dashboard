import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGX, monthlyEquivalent } from '../../../utils/finance';
import { useAuth } from '../../../contexts/AuthContext';
import { useEntity } from '../../../hooks/useEntity';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import { cycleWindow, getCadencePref } from '../../../utils/settlementCycle';
import styles from './PortfolioPulseCard.module.css';

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function useCountUp(target, duration = 1100, run = true) {
  const [v, setV] = useState(0);
  const active = run && Number.isFinite(target) && target > 0;
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return active ? v : 0;
}

export default function PortfolioPulseCard({ agentId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: agent } = useEntity('agent', agentId);
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissionDetail } = useAgentCommissionDetail(agentId);

  const firstName = (user?.name || agent?.name || 'there').split(' ')[0];

  const portfolio = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    let lifetimeTotal = 0;
    let monthlyRunRate = 0;
    let onboardedThisMonth = 0;
    let activeCount = 0;
    let pendingThisMonth = 0;

    for (const s of subscribers) {
      lifetimeTotal += s.totalContributions || 0;
      monthlyRunRate += monthlyEquivalent(s.contributionSchedule);
      if (s.isActive) activeCount += 1;

      const reg = s.registeredDate ? new Date(s.registeredDate).getTime() : 0;
      if (reg >= startOfMonth) onboardedThisMonth += 1;

      const due = s.contributionSchedule?.nextDueDate
        ? new Date(s.contributionSchedule.nextDueDate).getTime()
        : null;
      if (due != null && !Number.isNaN(due) && due >= todayStart && due <= endOfMonth) {
        pendingThisMonth += monthlyEquivalent(s.contributionSchedule);
      }
    }

    return {
      total: subscribers.length,
      active: activeCount,
      dormant: subscribers.length - activeCount,
      lifetime: lifetimeTotal,
      monthly: monthlyRunRate,
      onboardedThisMonth,
      pendingThisMonth,
    };
  }, [subscribers]);

  const commissions = useMemo(() => {
    const all = commissionDetail?.commissions || [];
    const win = cycleWindow(getCadencePref());

    let totalPaid = 0;
    let nextPayout = 0;
    for (const c of all) {
      if (c.status === 'paid') totalPaid += c.amount || 0;
      if (c.status === 'due') {
        const d = c.dueDate ? new Date(c.dueDate).getTime() : null;
        if (d != null && !Number.isNaN(d) && d <= win.end.getTime()) {
          nextPayout += c.amount || 0;
        }
      }
    }
    return { totalPaid, nextPayout };
  }, [commissionDetail]);

  const counted = useCountUp(portfolio.monthly);
  const splitTotal = portfolio.active + portfolio.dormant;
  const activePct = splitTotal > 0 ? (portfolio.active / splitTotal) * 100 : 0;
  const dormantPct = splitTotal > 0 ? (portfolio.dormant / splitTotal) * 100 : 0;

  return (
    <section className={styles.card} aria-label="Portfolio overview">
      <span className={styles.mesh} aria-hidden="true" />
      <span className={styles.grain} aria-hidden="true" />

      <header className={styles.head}>
        <span className={styles.eyebrow}>Good {hourGreeting()}</span>
        <h2 className={styles.greeting}>{firstName}</h2>
      </header>

      <div className={styles.heroLabel}>Monthly contribution volume</div>

      <div className={styles.heroStatic}>
        <span className={styles.heroValue}>{formatUGX(Math.round(counted))}</span>
      </div>

      <div className={styles.heroSubline}>
        across {portfolio.total.toLocaleString('en-UG')} subscriber{portfolio.total === 1 ? '' : 's'} · expected this month
      </div>

      <div className={styles.metricsStatic}>
        <div className={styles.metricsInner}>
          <div className={styles.statBlock}>
            <div className={styles.statBlockLabel}>Totals</div>
            <div className={styles.statGrid} data-cols="3">
              <div className={styles.stat}>
                <span className={styles.statLabel}>Total subscribers</span>
                <span className={styles.statValue}>
                  {portfolio.total.toLocaleString('en-UG')}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Total contributions</span>
                <span className={styles.statValue}>
                  {formatUGX(portfolio.lifetime)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Total commissions</span>
                <span className={styles.statValue}>{formatUGX(commissions.totalPaid)}</span>
              </div>
            </div>
          </div>

          <div className={styles.statBlock}>
            <div className={styles.statBlockLabel}>Upcoming</div>
            <div className={styles.statGrid} data-cols="2">
              <div className={styles.stat}>
                <span className={styles.statLabel}>Next payout</span>
                <span className={styles.statValue}>{formatUGX(commissions.nextPayout)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Pending contributions</span>
                <span className={styles.statValue}>{formatUGX(portfolio.pendingThisMonth)}</span>
              </div>
            </div>
          </div>

          <div className={styles.split}>
            <div className={styles.splitHead}>
              <span className={styles.splitLabel}>Active vs dormant</span>
            </div>
            <div
              className={styles.splitBar}
              role="img"
              aria-label={`${Math.round(activePct)}% active, ${Math.round(dormantPct)}% dormant`}
            >
              <motion.span
                className={styles.splitActive}
                initial={{ width: 0 }}
                animate={{ width: `${activePct}%` }}
                transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.08 }}
              />
              <motion.span
                className={styles.splitDormant}
                initial={{ width: 0 }}
                animate={{ width: `${dormantPct}%` }}
                transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.14 }}
              />
            </div>
            <div className={styles.splitLegend}>
              <span className={styles.splitItem}>
                <span className={styles.splitDot} data-tone="active" aria-hidden="true" />
                <span className={styles.splitItemLabel}>Active</span>
                <span className={styles.splitItemValue}>
                  {portfolio.active.toLocaleString('en-UG')}
                </span>
              </span>
              <span className={styles.splitItem}>
                <span className={styles.splitDot} data-tone="dormant" aria-hidden="true" />
                <span className={styles.splitItemLabel}>Dormant</span>
                <span className={styles.splitItemValue}>
                  {portfolio.dormant.toLocaleString('en-UG')}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={styles.foot}
        onClick={() => navigate('/dashboard/onboard')}
        aria-label="Onboard a new subscriber"
      >
        <span className={styles.footIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/>
          </svg>
        </span>
        <span className={styles.footBody}>
          <span className={styles.footLabel}>Grow your book</span>
          <span className={styles.footValue}>Onboard a new subscriber</span>
        </span>
        <span className={styles.footChevron} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
    </section>
  );
}
