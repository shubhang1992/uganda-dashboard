import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const SupportDesktop = lazy(() => import('../desktop/SupportDesktop'));

export default function SupportPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Support" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <SupportDesktop />
    </Suspense>
  );
}
