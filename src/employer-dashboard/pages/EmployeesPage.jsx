import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import EmployeesMobile from '../mobile/EmployeesMobile';

const EmployeesDesktop = lazy(() => import('../desktop/EmployeesDesktop'));

export default function EmployeesPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <EmployeesMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <EmployeesDesktop />
    </Suspense>
  );
}
