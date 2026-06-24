import { useState } from 'react';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useEntity } from '../../hooks/useEntity';
import { useToast } from '../../contexts/ToastContext';
import { PageHead, Card, SectionHead, Btn } from '../../employer-dashboard/desktop/ui';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './SettingsDesktop.module.css';

export default function SettingsDesktop() {
  const { branchId } = useBranchScope();
  const { data: branch } = useEntity('branch', branchId);
  const { addToast } = useToast();

  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');

  // Prefill from the entity once it loads — adjust state during render (guarded
  // on branch.id so it runs once per branch), the React-recommended alternative
  // to a setState-in-effect. Mirrors the `lastSplit` sync in BranchHealthScore.
  const [synced, setSynced] = useState(null);
  if (branch && synced !== branch.id) {
    setSynced(branch.id);
    setName(branch.name || '');
    setManagerName(branch.managerName || '');
    setManagerPhone(branch.managerPhone || '');
  }

  function reset() {
    setName(branch?.name || '');
    setManagerName(branch?.managerName || '');
    setManagerPhone(branch?.managerPhone || '');
  }

  function handleSave(e) {
    e.preventDefault();
    // Demo scope: branch-profile writes aren't wired to a backend RPC. Confirm
    // the change locally so the flow reads end-to-end in a sales walkthrough.
    addToast('success', 'Branch profile saved.');
  }

  return (
    <div className={ui.stack}>
      <PageHead eyebrow="Account" title="Settings" sub="Manage your branch profile and contact details" />

      <div className={styles.wrap}>
        <Card>
          <SectionHead title="Branch profile" />
          <form onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <div className={styles.fg}>
                <label className={styles.label} htmlFor="bs-name">Branch name</label>
                <input id="bs-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label className={styles.label} htmlFor="bs-id">Branch ID</label>
                <input id="bs-id" className={styles.input} value={branch?.id || branchId || ''} disabled />
              </div>
              <div className={styles.fg}>
                <label className={styles.label} htmlFor="bs-mgr">Manager name</label>
                <input id="bs-mgr" className={styles.input} value={managerName} onChange={(e) => setManagerName(e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label className={styles.label} htmlFor="bs-phone">Manager phone</label>
                <input id="bs-phone" className={styles.input} value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} />
              </div>
            </div>
            <div className={styles.actions}>
              <Btn variant="secondary" onClick={reset}>Cancel</Btn>
              <Btn variant="primary" type="submit">Save changes</Btn>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
