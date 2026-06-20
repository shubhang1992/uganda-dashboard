import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import ErrorCard from '../../components/feedback/ErrorCard';
import HomeDesktop from './HomeDesktop';
import HomeMobile from './HomeMobile';
import styles from './HomePage.module.css';

export default function HomePage() {
  const isDesktop = useIsDesktop();
  const { data: sub, isLoading, isError, error, refetch } = useCurrentSubscriber();

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className={styles.loading}>
        <ErrorCard
          title="We couldn't load your account"
          message={error}
          onRetry={refetch}
        />
      </div>
    );
  }
  if (!sub) {
    return (
      <div className={styles.loading}>
        <ErrorCard
          title="No account found"
          message="We couldn't find a subscriber profile for your sign-in. Please sign in again or contact support."
        />
      </div>
    );
  }

  // >=1024px renders the dedicated wide desktop overview (KPI row + 2-up widget
  // grid). Below that the redesigned mobile home (flat cards + indigo-text
  // balance, the new app-bar language). Gated here (not in the shell) so the
  // loading / error / no-account guards above run once for both layouts and each
  // surface always receives a resolved subscriber.
  if (isDesktop) return <HomeDesktop subscriber={sub} />;

  return <HomeMobile subscriber={sub} />;
}
