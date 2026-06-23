import { useNavigate } from 'react-router-dom';
import OnboardStaffBody from '../employees/OnboardStaffBody';

/**
 * OnboardStaffMobile — the routed Onboard page (/dashboard/onboard) on the phone.
 * Mounts the shared OnboardStaffBody (single/bulk/review/result) directly inside
 * the mobile shell; dismissal navigates back to the Staff roster. (Desktop reaches
 * onboarding via the EmployerSlidePanel overlay instead — this route redirects to
 * /dashboard/employees on desktop.)
 */
export default function OnboardStaffMobile() {
  const navigate = useNavigate();
  return <OnboardStaffBody onClose={() => navigate('/dashboard/employees')} />;
}
