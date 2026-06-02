// Insurance / Benefits panel — STUB (Phase 1). Real company-wide insurance
// oversight (count covered, total premium, per-employee cover/status table)
// lands in Phase 5.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function InsuranceBenefits({ splitMode = false }) {
  const { insuranceOpen, setInsuranceOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={insuranceOpen}
      onClose={() => setInsuranceOpen(false)}
      title="Insurance & benefits"
      phase="Phase 5"
      description="The company-wide insurance oversight view"
      width={600}
      splitMode={splitMode}
    />
  );
}
