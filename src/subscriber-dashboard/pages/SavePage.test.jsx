// RTL tests for SavePage's scheduled-payment lock.
//
// When a subscriber pays their *scheduled* contribution (reached via
// TopUpWidget's "Pay", which sets location.state.scheduled), the amount must be
// LOCKED to the configured schedule amount — no preset chips, no editable input.
// The ad-hoc "Top up extra" flow (no scheduled flag) must stay fully editable.
// A schedule amount below MIN_CONTRIBUTION must NOT lock (that would render a
// card whose Pay button is disabled with no way to edit) — it degrades to the
// editable view with the standard raise-to-minimum flow.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useSubscriber', () => ({
  useCurrentSubscriber: vi.fn(),
  useMakeContribution: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const { useCurrentSubscriber } = await import('../../hooks/useSubscriber');
const { default: SavePage } = await import('./SavePage');

function renderSave(state, schedule) {
  useCurrentSubscriber.mockReturnValue({
    data: { id: 's1', netBalance: 200000, age: 35, contributionSchedule: schedule },
  });
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/dashboard/save', state }]}>
      <SavePage />
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('<SavePage /> scheduled-payment lock', () => {
  const monthly = { amount: 39000, frequency: 'monthly', retirementPct: 90, emergencyPct: 10 };

  it('locks the amount to the schedule amount (no input, no preset chips)', () => {
    renderSave({ scheduled: true, prefillAmount: 39000 }, monthly);

    // Read-only: no editable amount input and no preset chips exist.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('100K')).toBeNull(); // a preset chip in the editable view

    // The locked, fixed amount is shown with its accessible label.
    expect(screen.getByText('Scheduled monthly contribution')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Scheduled contribution: UGX 39,000\. Amount is fixed\./ }),
    ).toBeInTheDocument();

    // Scheduled affordances: "Pay" verb (not "Top up") + a change-in-schedule link.
    expect(screen.getByText('Pay')).toBeInTheDocument();
    expect(screen.queryByText('Top up')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('keeps the amount editable for an ad-hoc top-up (no scheduled flag)', () => {
    renderSave(null, monthly);

    expect(screen.getByLabelText('Contribution amount in UGX')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount')).toBeInTheDocument();
    expect(screen.getByText('Top up')).toBeInTheDocument();
    expect(screen.queryByText(/Scheduled .* contribution/)).toBeNull();
  });

  it('does NOT lock when the schedule amount is below the minimum — falls back to editable', () => {
    // A legacy weekly schedule below MIN_CONTRIBUTION (5,000). Locking it would
    // strand the user on a disabled Pay button; instead it must be editable.
    renderSave({ scheduled: true, prefillAmount: 1000 }, { amount: 1000, frequency: 'weekly', retirementPct: 90 });

    expect(screen.queryByText('Scheduled amount')).toBeNull();
    expect(screen.getByLabelText('Contribution amount in UGX')).toBeInTheDocument();
    // The pre-filled sub-minimum amount surfaces the raise-to-minimum error.
    expect(screen.getByRole('alert')).toHaveTextContent(/Minimum/);
  });
});
