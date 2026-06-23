import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const OverviewDesktop = lazy(() => import('../desktop/OverviewDesktop'));

export default function OverviewPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Overview" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <OverviewDesktop />
    </Suspense>
  );
}
