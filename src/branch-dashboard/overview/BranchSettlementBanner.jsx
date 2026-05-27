import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentRun, useBranchRunReview } from '../../hooks/useCommission';
import styles from './BranchSettlementBanner.module.css';

export default function BranchSettlementBanner() {
  const { branchId } = useBranchScope();
  const { setCommissionsOpen } = useDashboard();
  const { data: run } = useCurrentRun();
  const { data: review } = useBranchRunReview(run?.id, branchId);

  if (!run || !review || review.lines.length === 0) return null;

  const total = review.lines.reduce((s, c) => s + (c.amount || 0), 0);
  const pending = review.lines.filter((c) => c.status === 'in_run').length;
  const isApproved = review.reviewState === 'approved';
  const range = `${formatDate(run.openedAt)} → ${formatDate(run.closesAt)}`;

  return (
    <motion.section
      className={styles.banner}
      data-state={isApproved ? 'approved' : 'pending'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      aria-label="Settlement run open for review"
    >
      <div className={styles.body}>
        <span className={styles.eyebrow}>
          {isApproved ? 'Branch sign-off submitted' : 'Settlement run open'}
        </span>
        <h3 className={styles.title}>
          {isApproved
            ? `Awaiting distributor release — ${range}`
            : `Review by ${formatDate(run.closesAt)}`}
        </h3>
        <p className={styles.sub}>
          {review.lines.length} commission{review.lines.length === 1 ? '' : 's'} · {formatUGX(total)}
          {!isApproved && pending > 0 ? ` · ${pending} awaiting review` : ''}
        </p>
      </div>
      <button
        type="button"
        className={styles.cta}
        onClick={() => setCommissionsOpen(true)}
      >
        {isApproved ? 'View run' : 'Review and approve'}
      </button>
    </motion.section>
  );
}
