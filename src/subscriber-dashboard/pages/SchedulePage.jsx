import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentSubscriber, useUpdateSchedule } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import ContributionSettingsForm from '../../components/contribution/ContributionSettingsForm';
import styles from './SchedulePage.module.css';

export default function SchedulePage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateSchedule = useUpdateSchedule(sub?.id);
  const [submitting, setSubmitting] = useState(false);

  const existing = sub?.contributionSchedule;
  const isNew = !existing;

  async function handleSave(schedule) {
    if (!sub) return;
    setSubmitting(true);
    try {
      await updateSchedule.mutateAsync(schedule);
      addToast('success', isNew ? 'Schedule set up.' : 'Contribution schedule updated.');
      navigate('/dashboard');
    } catch (err) {
      addToast('error', err?.message || 'Could not save schedule.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={isNew ? 'Set a schedule' : 'Tune your schedule'}
        subtitle="Frequency, amount, and the retirement/emergency split"
        fallback="/dashboard/save"
      />
      {sub && (
        <ContributionSettingsForm
          initial={existing}
          age={sub.age}
          onSave={handleSave}
          submitting={submitting}
        />
      )}
    </div>
  );
}
