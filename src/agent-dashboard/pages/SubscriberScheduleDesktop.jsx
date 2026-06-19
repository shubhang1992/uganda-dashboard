import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers, useUpdateSubscriberSchedule } from '../../hooks/useAgent';
import { useToast } from '../../contexts/ToastContext';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import ContributionSettingsForm from '../../components/contribution/ContributionSettingsForm';
import SkeletonRow from '../../components/SkeletonRow';
import EditScheduleConsent from './subscriber/EditScheduleConsent';
import styles from './SubscriberScheduleDesktop.module.css';

/**
 * SubscriberScheduleDesktop — desktop (>=1024px) layout for the agent's
 * subscriber contribution-schedule sub-page. Forked from SubscriberSchedulePage
 * via the useIsDesktop() gate; the mobile page is never mounted at this width,
 * so this component owns its own hooks (rules-of-hooks safe).
 *
 * It is a SUB-page (a routed detail destination), so it uses the default
 * PageHeader variant (back chevron + h1). The body is a width-capped, centred
 * wrapper around the SAME ContributionSettingsForm the mobile page renders, with
 * the SAME useUpdateSubscriberSchedule(subscriberId, agentId) mutation and the
 * SAME save / toast / back behaviour. React Query dedupes the shared data hooks.
 */
export default function SubscriberScheduleDesktop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const updateSchedule = useUpdateSubscriberSchedule(id, agentId);
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // Editing an existing schedule requires the subscriber's OTP consent first.
  const [consentGiven, setConsentGiven] = useState(false);

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
        <PageHeader
          title="Loading schedule…"
          fallback={`/dashboard/subscribers/${id}`}
        />
        <div className={styles.frame}>
          <SkeletonRow count={4} label="Loading subscriber schedule" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <PageHeader title="Schedule" fallback={`/dashboard/subscribers/${id}`} />
        <div className={styles.frame}>
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

  // Gate edits to an existing schedule behind subscriber OTP consent.
  if (!isNew && !consentGiven) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="Edit contribution schedule"
          subtitle={`for ${subscriber.name}`}
          fallback={`/dashboard/subscribers/${id}`}
        />
        <div className={styles.frame}>
          <EditScheduleConsent
            phone={subscriber.phone}
            subscriberName={subscriber.name}
            onVerified={() => setConsentGiven(true)}
            onCancel={handleCancel}
          />
        </div>
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
      <div className={styles.frame}>
        <ContributionSettingsForm
          initial={existing}
          age={subscriber.age}
          layout="split"
          onSave={handleSave}
          onCancel={handleCancel}
          submitting={submitting}
          submitLabel={isNew ? 'Set up schedule' : undefined}
        />
      </div>
    </div>
  );
}
