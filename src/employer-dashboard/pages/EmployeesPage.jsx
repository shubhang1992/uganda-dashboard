import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const EmployeesDesktop = lazy(() => import('../desktop/EmployeesDesktop'));

export default function EmployeesPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Staff" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <EmployeesDesktop />
    </Suspense>
  );
}
