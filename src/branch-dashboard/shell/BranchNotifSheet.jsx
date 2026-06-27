import { useMemo, useState, useCallback } from 'react';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useChildren, useChildrenMetrics } from '../../hooks/useEntity';
import { formatRelativeTime } from '../../utils/date';
import { generateActivity } from '../overview/branchOverviewDerive';
import { coinsIcon, handAddIcon } from '../../employer-dashboard/desktop/icons';
import BottomSheet from './BottomSheet';
import sheet from './branchSheets.module.css';

const BellIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * BranchNotifSheet — a light, client-derived notifications feed for the branch
 * admin, opened from the mobile app bar's bell. Reuses generateActivity() (the
 * same stable feed the desktop Overview's "Today's snapshot" shows) so there is
 * no fabricated backend. "Mark all read" is a local view-state toggle — these
 * are derived events, not persisted notification rows.
 */
export default function BranchNotifSheet({ open, onClose }) {
  const { branchId } = useBranchScope();
  const { data: agentsRaw = [] } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);

  const agents = useMemo(
    () => agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics })),
    [agentsRaw, agentMetricsMap],
  );
  const feed = useMemo(() => generateActivity(agents), [agents]);

  const [readAll, setReadAll] = useState(false);
  // Reset the local read state on close so the next peek shows the unread dots
  // again (equivalent to resetting on open, without a setState-in-effect).
  const handleClose = useCallback(() => {
    setReadAll(false);
    onClose();
  }, [onClose]);

  const headerRight = (
    <button
      type="button"
      className={sheet.markAll}
      onClick={() => setReadAll(true)}
      disabled={readAll || feed.length === 0}
    >
      Mark all read
    </button>
  );

  return (
    <BottomSheet open={open} onClose={handleClose} title="Notifications" icon={BellIcon} height="72%" headerRight={headerRight}>
      {feed.length === 0 ? (
        <p className={sheet.empty}>
          No new activity yet — agent onboardings and collections will appear here.
        </p>
      ) : (
        <ul className={sheet.feed}>
          {feed.map((ev) => (
            <li key={ev.id} className={`${sheet.nrow} ${readAll ? sheet.nrowRead : ''}`}>
              <span className={sheet.ndot} aria-hidden="true"><i /></span>
              <span className={sheet.nIc} aria-hidden="true">
                {ev.type === 'contribution' ? coinsIcon(18) : handAddIcon(18)}
              </span>
              <span className={sheet.nb}>
                <b>{ev.text}</b>
                <time>{formatRelativeTime(ev.time)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
