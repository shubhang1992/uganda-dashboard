import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import OverviewMobile from '../mobile/OverviewMobile';

const OverviewDesktop = lazy(() => import('../desktop/OverviewDesktop'));

export default function OverviewPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <OverviewMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <OverviewDesktop />
    </Suspense>
  );
}
