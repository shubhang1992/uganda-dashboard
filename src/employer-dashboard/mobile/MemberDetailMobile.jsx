import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployee, useRemoveEmployee } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import MemberDetailBody from '../employees/MemberDetailBody';
import s from './employerMobile.module.css';

function initials(name) {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/**
 * MemberDetailMobile — the routed staff-member detail (/dashboard/employees/:id)
 * on the phone. Reuses the shipped MemberDetailBody VERBATIM (its only prop is
 * employeeId; it reads scope + data internally), adds a compact identity hero,
 * and the "Remove from company" danger action + confirm — mirroring
 * MemberDetailDesktop's remove flow (shared Modal → useRemoveEmployee → toast).
 */
export default function MemberDetailMobile() {
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
          addToast('success', `${name.split(' ')[0]} was removed from your company. Their account stays active.`);
          setConfirmOpen(false);
          navigate('/dashboard/employees');
        },
        onError: (err) => addToast('error', err?.message || 'Could not remove this member.'),
      },
    );
  }

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`}>
        <div className={s.acct}>
          <span className={s.acctAv}>{initials(name)}</span>
          <div>
            <div className={s.acctNm}>{name}</div>
            {employee?.phone && <div className={s.acctMt}>{employee.phone}</div>}
          </div>
        </div>
        {employee && (
          <div className={s.tagRow}>
            <span className={`${s.pill} ${isActive ? s.pillOk : s.pillWarn}`}><i />{isActive ? 'Active' : 'Inactive'}</span>
          </div>
        )}
      </div>

      <MemberDetailBody employeeId={id} />

      {employee && (
        <button type="button" className={s.signout} onClick={() => setConfirmOpen(true)}>
          Remove from company
        </button>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Remove from company?" size="sm">
        <p style={{ fontSize: 13, color: 'var(--color-gray)', lineHeight: 1.6, margin: '0 0 18px' }}>
          <strong style={{ color: 'var(--color-slate)' }}>{name}</strong> will be removed from your roster and won&apos;t be included in future contribution runs. Their pension account stays active — they simply continue as an individual subscriber.
        </p>
        <div className={s.btnRow}>
          <button type="button" className={`${s.btn} ${s.btnSec}`} onClick={() => setConfirmOpen(false)} disabled={removeEmployee.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.btnPri}`}
            style={{ background: 'var(--color-status-poor)', borderColor: 'var(--color-status-poor)' }}
            onClick={confirmRemove}
            disabled={removeEmployee.isPending}
          >
            {removeEmployee.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
