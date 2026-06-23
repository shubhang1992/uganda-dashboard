import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import AnalyticsMobile from '../mobile/AnalyticsMobile';

const AnalyticsDesktop = lazy(() => import('../desktop/AnalyticsDesktop'));

export default function AnalyticsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <AnalyticsMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <AnalyticsDesktop />
    </Suspense>
  );
}
