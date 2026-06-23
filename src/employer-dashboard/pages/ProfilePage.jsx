import { Navigate } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import MobilePlaceholder from '../shell/MobilePlaceholder';

// Mobile-only route (the "Company" bottom-nav tab). Desktop has no Profile hub —
// the left rail handles navigation — so this redirects to the overview.
export default function ProfilePage() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <Navigate to="/dashboard" replace />;
  return <MobilePlaceholder name="Company" />;
}
