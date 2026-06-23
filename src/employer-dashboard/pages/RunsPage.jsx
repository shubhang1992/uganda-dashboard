import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const RunsDesktop = lazy(() => import('../desktop/RunsDesktop'));

export default function RunsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Contribution runs" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <RunsDesktop />
    </Suspense>
  );
}
