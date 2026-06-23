import { Navigate } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import MobilePlaceholder from '../shell/MobilePlaceholder';

// Mobile-only route. On desktop, pending-KYC is a slide-over opened from the
// Employees/Overview pages (useEmployerPanel.setKycOpen), so this route
// redirects there and the shipped desktop flow is unchanged.
export default function PendingKycPage() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <Navigate to="/dashboard/employees" replace />;
  return <MobilePlaceholder name="Pending KYC" />;
}
