import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import SupportMobile from '../mobile/SupportMobile';

const SupportDesktop = lazy(() => import('../desktop/SupportDesktop'));

export default function SupportPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <SupportMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <SupportDesktop />
    </Suspense>
  );
}
