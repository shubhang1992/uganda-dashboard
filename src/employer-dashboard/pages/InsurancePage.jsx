import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const InsuranceDesktop = lazy(() => import('../desktop/InsuranceDesktop'));

export default function InsurancePage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Insurance & benefits" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <InsuranceDesktop />
    </Suspense>
  );
}
