// Employee detail panel — STUB (Phase 1). Real balances / schedule /
// transactions / insurance + the contribution-config + insurance editors land
// in Phase 3. Opens for the `activeEmployeeId` set by the panel context.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function EmployeeDetail({ splitMode = false }) {
  const { employeeDetailOpen, setEmployeeDetailOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={employeeDetailOpen}
      onClose={() => setEmployeeDetailOpen(false)}
      title="Employee detail"
      phase="Phase 3"
      description="The per-employee detail view — balances, schedule, transactions, insurance and the config editors —"
      width={560}
      splitMode={splitMode}
    />
  );
}
