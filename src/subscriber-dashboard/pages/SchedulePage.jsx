import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentSubscriber, useUpdateSchedule } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageHeader from '../../components/PageHeader';
import ContributionSettingsForm from '../../components/contribution/ContributionSettingsForm';
import styles from './SchedulePage.module.css';

export default function SchedulePage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateSchedule = useUpdateSchedule(sub?.id);
  const [submitting, setSubmitting] = useState(false);
  const isDesktop = useIsDesktop();

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

  // Desktop (>=1024px): mirror the agent's schedule sub-page — a plain header
  // (no indigo hero dome) over a width-capped, centred frame wrapping the SAME
  // form in its 2-column "split" layout (inputs left / sticky summary right).
  if (isDesktop) {
    return (
      <div className={styles.page}>
        <PageHeader
          title={isNew ? 'Set up contribution schedule' : 'Tune your schedule'}
          subtitle="Frequency, amount, and the retirement/emergency split"
          fallback="/dashboard/save"
        />
        <div className={styles.frame}>
          {sub && (
            <ContributionSettingsForm
              initial={existing}
              age={sub.age}
              layout="split"
              onSave={handleSave}
              submitting={submitting}
              submitLabel={isNew ? 'Set up schedule' : undefined}
            />
          )}
        </div>
      </div>
    );
  }

  // Mobile: the persistent shell app bar now owns the page title + back arrow, so
  // the in-page hero dome is removed. A flat, light intro card carries the page's
  // brand surface at the top of the body, then the shared form follows.
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <section className={styles.intro}>
          <p className={styles.introEyebrow}>Contribution plan</p>
          <p className={styles.introTitle}>
            {isNew ? 'Set up your schedule' : 'Tune your schedule'}
          </p>
          <p className={styles.introSub}>
            Frequency, amount, and the retirement/emergency split.
          </p>
        </section>
        {sub && (
          <ContributionSettingsForm
            initial={existing}
            age={sub.age}
            onSave={handleSave}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}
