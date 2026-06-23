import { Navigate } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import OnboardStaffMobile from '../mobile/OnboardStaffMobile';

// Mobile-only route. On desktop, onboarding is a slide-over opened from the
// Employees page (useEmployerPanel.setOnboardOpen), so this route redirects
// there and the shipped desktop flow is unchanged.
export default function OnboardPage() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <Navigate to="/dashboard/employees" replace />;
  return <OnboardStaffMobile />;
}
