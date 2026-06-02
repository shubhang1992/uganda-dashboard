// Employees roster panel — STUB (Phase 1). Real roster table + filters land in
// Phase 3. Reads its open-state + close handler from the employer panel
// context; accepts `splitMode` for the future split-view reflow.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function ViewEmployees({ splitMode = false }) {
  const { employeesOpen, setEmployeesOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={employeesOpen}
      onClose={() => setEmployeesOpen(false)}
      title="Employees"
      phase="Phase 3"
      description="The full staff roster — table, search, status filter and per-employee detail —"
      width={640}
      splitMode={splitMode}
    />
  );
}
