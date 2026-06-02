// Settings panel — STUB (Phase 1). Real company profile + default
// contribution-config form + password tab land in Phase 8.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import StubPanel from '../panels/StubPanel';

export default function EmployerSettings({ splitMode = false }) {
  const { settingsOpen, setSettingsOpen } = useEmployerPanel();
  return (
    <StubPanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="Settings"
      phase="Phase 8"
      description="Company profile, default contribution config and the password tab"
      width={480}
      splitMode={splitMode}
    />
  );
}
