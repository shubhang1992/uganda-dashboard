import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const MemberDetailDesktop = lazy(() => import('../desktop/MemberDetailDesktop'));

export default function MemberDetailPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Staff member" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <MemberDetailDesktop />
    </Suspense>
  );
}
