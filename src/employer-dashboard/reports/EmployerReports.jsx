// Reports panel — STUB (Phase 1). Real printable/exportable summaries (staff
// roster, contribution-runs summary, employer-vs-employee funding breakdown,
// staff balance growth) land in Phase 6.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function EmployerReports({ splitMode = false }) {
  const { reportsOpen, setReportsOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={reportsOpen}
      onClose={() => setReportsOpen(false)}
      title="Reports"
      phase="Phase 6"
      description="The printable / exportable employer report hub"
      width={680}
      splitMode={splitMode}
    />
  );
}
