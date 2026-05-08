import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../SignupContext';
import ContributionSettings from './ContributionSettings';

/**
 * Route wrapper for `/signup/contribution`.
 *
 * Reads the existing schedule (if any) from the signup context so editing
 * pre-fills. On payment confirm, the subscriber is logged in and sent to
 * the subscriber dashboard at `/dashboard`. Cancel returns to the activation
 * step without saving.
 */
export default function ContributionRoute() {
  const navigate = useNavigate();
  const { contributionSchedule, dob, phone, fullName, patch } = useSignup();
  const { login } = useAuth();
  const { addToast } = useToast();

  async function handleConfirm(schedule) {
    patch({ contributionSchedule: schedule });
    try {
      // login() is sync today but may become async with a real backend.
      // Promise.resolve makes the try/catch correct in either case.
      await Promise.resolve(
        login({ role: 'subscriber', phone, name: fullName || 'Subscriber' })
      );
      navigate('/dashboard', { replace: true });
    } catch {
      addToast('error', 'Could not finish signup. Please try again.');
    }
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
