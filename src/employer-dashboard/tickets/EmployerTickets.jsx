// Support / Tickets panel — STUB (Phase 1). Real employer↔platform ticketing
// (raise + reply, with a composer) lands in Phase 7.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function EmployerTickets({ splitMode = false }) {
  const { supportOpen, setSupportOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={supportOpen}
      onClose={() => setSupportOpen(false)}
      title="Support"
      phase="Phase 7"
      description="Employer↔platform support tickets — raise and reply —"
      width={560}
      splitMode={splitMode}
    />
  );
}
