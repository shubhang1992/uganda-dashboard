import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MemberDetailMobile from '../mobile/MemberDetailMobile';

const MemberDetailDesktop = lazy(() => import('../desktop/MemberDetailDesktop'));

export default function MemberDetailPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MemberDetailMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <MemberDetailDesktop />
    </Suspense>
  );
}
