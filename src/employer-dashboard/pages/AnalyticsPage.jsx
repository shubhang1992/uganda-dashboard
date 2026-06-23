import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const AnalyticsDesktop = lazy(() => import('../desktop/AnalyticsDesktop'));

export default function AnalyticsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Analytics" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <AnalyticsDesktop />
    </Suspense>
  );
}
