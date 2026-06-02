// Contribution Runs panel — STUB (Phase 1). Real run history + run detail +
// new-run wizard (server-side amount recompute, nonce idempotency, inline
// `employees` balance writes, NO commission side-effects) land in Phase 4.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function ContributionRuns({ splitMode = false }) {
  const { runsOpen, setRunsOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={runsOpen}
      onClose={() => setRunsOpen(false)}
      title="Contribution runs"
      phase="Phase 4"
      description="The contribution-run history, run detail and new-run wizard"
      width={680}
      splitMode={splitMode}
    />
  );
}
