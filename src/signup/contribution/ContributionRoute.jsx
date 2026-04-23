import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSignup } from '../SignupContext';
import ContributionSettings from './ContributionSettings';

/**
 * Route wrapper for `/signup/contribution`.
 *
 * Reads the existing schedule (if any) from the signup context so editing
 * pre-fills. On payment confirm, the subscriber is logged in and sent to
 * the subscriber dashboard (currently `/coming-soon`, since that dashboard
 * hasn't been built yet). Cancel returns to the activation step without
 * saving.
 */
export default function ContributionRoute() {
  const navigate = useNavigate();
  const { contributionSchedule, dob, phone, fullName, patch } = useSignup();
  const { login } = useAuth();

  function handleConfirm(schedule) {
    patch({ contributionSchedule: schedule });
    login({ role: 'subscriber', phone, name: fullName || 'Subscriber' });
    navigate('/dashboard', { replace: true });
  }

  function handleCancel() {
    navigate('/signup');
  }

  return (
    <ContributionSettings
      initial={contributionSchedule}
      dob={dob}
      phone={phone}
      onClose={handleCancel}
      onConfirm={handleConfirm}
    />
  );
}
