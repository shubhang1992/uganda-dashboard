import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import RunsMobile from '../mobile/RunsMobile';

const RunsDesktop = lazy(() => import('../desktop/RunsDesktop'));

export default function RunsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <RunsMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <RunsDesktop />
    </Suspense>
  );
}
