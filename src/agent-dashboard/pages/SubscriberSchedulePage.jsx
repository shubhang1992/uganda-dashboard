import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers, useUpdateSubscriberSchedule } from '../../hooks/useAgent';
import { useToast } from '../../contexts/ToastContext';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../shell/PageHeader';
import ContributionSettingsForm from '../../components/contribution/ContributionSettingsForm';
import styles from './SubscriberSchedulePage.module.css';

export default function SubscriberSchedulePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const updateSchedule = useUpdateSubscriberSchedule(id, agentId);
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const subscriber = subscribers.find((s) => s.id === id);
  const existing = subscriber?.contributionSchedule;
  const isNew = !existing;

  async function handleSave(schedule) {
    if (!subscriber) return;
    setSubmitting(true);
    try {
      await updateSchedule.mutateAsync(schedule);
      addToast(
        'success',
        isNew
          ? `Schedule set up for ${subscriber.name.split(' ')[0]}.`
          : `${subscriber.name.split(' ')[0]}'s schedule updated.`,
      );
      navigate(`/dashboard/subscribers/${id}`);
    } catch {
      addToast('error', 'Could not save schedule. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate(`/dashboard/subscribers/${id}`);
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Loading…" fallback={`/dashboard/subscribers/${id}`} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <PageHeader title="Schedule" fallback={`/dashboard/subscribers/${id}`} />
        <div style={{ padding: 'var(--space-4)' }}>
          <ErrorCard
            title="We couldn't load this subscriber"
            message={error}
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  if (!subscriber) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="Subscriber not found"
          fallback="/dashboard/subscribers"
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={isNew ? 'Set up contribution schedule' : 'Edit contribution schedule'}
        subtitle={`for ${subscriber.name}`}
        fallback={`/dashboard/subscribers/${id}`}
      />
      {subscriber && (
        <ContributionSettingsForm
          initial={existing}
          age={subscriber.age}
          onSave={handleSave}
          onCancel={handleCancel}
          submitting={submitting}
          submitLabel={isNew ? 'Set up schedule' : undefined}
        />
      )}
    </div>
  );
}
