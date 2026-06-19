// MemberDetailDesktop — the single-member detail page (/dashboard/employees/:id)
// for the employer DESKTOP dashboard. Reuses the shipped MemberDetailBody
// VERBATIM (it reads scope + all data internally; its only prop is employeeId),
// adds desktop chrome (back link + name header + status badge), and a
// "Remove from company" danger action that mirrors ViewEmployees' remove flow
// (shared Modal confirm → useRemoveEmployee → toast → navigate back).

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployee, useRemoveEmployee } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import MemberDetailBody from '../employees/MemberDetailBody';
import { PageHead, StatusBadge, Btn } from './ui';
import { backIcon } from './icons';
import ui from './ui.module.css';
import styles from './MemberDetailDesktop.module.css';

export default function MemberDetailDesktop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();

  const { data: employee } = useEmployee(id);
  const removeEmployee = useRemoveEmployee(employerId);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const name = employee?.name || 'Member';
  const isActive = employee ? employee.status === 'active' : true;

  function confirmRemove() {
    if (removeEmployee.isPending) return;
    removeEmployee.mutate(
      { employeeId: id },
      {
        onSuccess: () => {
          addToast(
            'success',
            `${name.split(' ')[0]} was removed from your company. Their account stays active.`,
          );
          setConfirmOpen(false);
          navigate('/dashboard/employees');
        },
        onError: (err) => addToast('error', err?.message || 'Could not remove this member.'),
      },
    );
  }

  return (
    <div className={ui.stack}>
      <Btn variant="ghost" size="sm" to="/dashboard/employees" className={styles.back}>
        {backIcon(16)}
        Back to roster
      </Btn>

      <div className={styles.headRow}>
        <PageHead eyebrow="Workforce · Member" title={name} />
        {employee && (
          <StatusBadge tone={isActive ? 'active' : 'inactive'}>
            {isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        )}
      </div>

      <div className={styles.body}>
        <MemberDetailBody employeeId={id} />
      </div>

      {employee && (
        <div className={ui.footerActions}>
          <Btn variant="danger" onClick={() => setConfirmOpen(true)}>
            Remove from company
          </Btn>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Remove from company"
        size="sm"
      >
        <div className={styles.confirm}>
          <h2 className={styles.confirmTitle}>Remove from company?</h2>
          <p className={styles.confirmBody}>
            <strong>{name}</strong> will be removed from your roster and won&apos;t be
            included in future contribution runs. Their pension account stays
            active — they simply continue as an individual subscriber.
          </p>
          <div className={ui.footerActions}>
            <Btn
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={removeEmployee.isPending}
            >
              Cancel
            </Btn>
            <Btn
              variant="danger"
              onClick={confirmRemove}
              disabled={removeEmployee.isPending}
            >
              {removeEmployee.isPending ? 'Removing…' : 'Remove'}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
