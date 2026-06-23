import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import InsuranceMobile from '../mobile/InsuranceMobile';

const InsuranceDesktop = lazy(() => import('../desktop/InsuranceDesktop'));

export default function InsurancePage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <InsuranceMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <InsuranceDesktop />
    </Suspense>
  );
}
