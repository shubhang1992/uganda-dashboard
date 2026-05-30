import { useState } from 'react';
import styles from './ViewBranches.module.css';

/**
 * Edit-branch form panel.
 *
 * Stateless w.r.t. context: does NOT call `useToast()` or any scope hooks.
 * Parent bubbles toast success/error via the `onSave` callback (which is
 * expected to handle the mutation and surface feedback).
 *
 * Props:
 *  - branch: the branch being edited (current values seed local state).
 *  - section: `'admin'` or `'details'` — selects which field set renders.
 *  - onSave(updates): called with the patch object (`{ managerName, managerPhone, managerEmail }`
 *    or `{ name }`). Parent handles the mutation + toast.
 *  - onCancel(): called when user presses Cancel.
 */
export default function BranchEditForm({ branch, section, onSave, onCancel }) {
  const [name, setName] = useState(branch.managerName);
  const [phone, setPhone] = useState(branch.managerPhone);
  const [email, setEmail] = useState(branch.managerEmail);
  const [branchName, setBranchName] = useState(branch.name);

  function handleSave() {
    if (section === 'admin') {
      onSave({ managerName: name, managerPhone: phone, managerEmail: email });
    } else {
      onSave({ name: branchName });
    }
  }

  return (
    <>
      <div className={styles.detailContent}>
        <div className={styles.editForm}>
          {section === 'admin' ? (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Full Name</label>
                <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Manager name" name="managerName" autoComplete="name" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Phone Number</label>
                <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256…" name="phone" type="tel" autoComplete="tel" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Email Address</label>
                <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" name="email" type="email" autoComplete="email" />
              </div>
            </>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>Branch Name</label>
              <input className={styles.input} value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Branch name" name="branchName" autoComplete="off" />
            </div>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <div className={styles.footerSpacer} />
        <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
      </div>
    </>
  );
}
