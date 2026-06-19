// RTL tests for the v5 HomeDesktop redesign.
//
// The load-bearing invariant: Retirement + Emergency are the two pots that sum
// to net balance, so their two share-of-balance percentages MUST sum to exactly
// 100. Rounding each pot's share independently can yield 101% (when both
// fractional parts are .5); the fix derives the emergency share as the
// complement of the rounded retirement share. This test pins a balance whose
// naive rounding would print 84% + 17% = 101% and asserts the emergency share
// is the complement (16%), not the independently-rounded 17%.
//
// Plus smoke assertions for the rebuilt hero / KPI / cards and the employer-vs-
// self conditional rendering.

import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Reduced motion → useCountUp snaps to the resolved balance (no rAF timing),
// keeping the rendered figures deterministic.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

// HomeDesktop calls these React Query hooks directly (employer split + activity);
// stub them so the unit test needs no QueryClient / network.
vi.mock('../../hooks/useSubscriber', () => ({
  useContributionBreakdown: () => ({ data: undefined }),
  useSubscriberTransactions: () => ({ data: [] }),
}));

const { default: HomeDesktop } = await import('./HomeDesktop');

function renderHome(subscriber) {
  return render(
    <MemoryRouter>
      <HomeDesktop subscriber={subscriber} />
    </MemoryRouter>,
  );
}

const SPLIT_FIXTURE = {
  name: 'Mary Aol',
  netBalance: 2_000_000,
  retirementBalance: 1_670_000, // 83.5%
  emergencyBalance: 330_000, //    16.5%
};

describe('<HomeDesktop /> savings split', () => {
  it('retirement + emergency shares sum to exactly 100 (complement rounding)', () => {
    renderHome(SPLIT_FIXTURE);

    // The "Your savings & cover" card prints each pot's share in its sub-line.
    // 83.5 → 84 (direct round); 16.5 → 16 (the COMPLEMENT, not the naive 17).
    expect(screen.getByText(/^84% ·/)).toBeInTheDocument();
    expect(screen.getByText(/^16% ·/)).toBeInTheDocument();
    // Independent rounding of 16.5 would print 17% — the complement rule must not.
    expect(screen.queryByText(/^17% ·/)).not.toBeInTheDocument();
  });
});

describe('<HomeDesktop /> content', () => {
  it('renders the v5 hero, KPI row and savings & cover labels', () => {
    renderHome({
      ...SPLIT_FIXTURE,
      unitsHeld: 2000,
      insurance: { cover: 5_000_000, premiumMonthly: 2_000, status: 'active' },
    });

    expect(screen.getByText('Total balance')).toBeInTheDocument();
    expect(screen.getByText('Amount invested')).toBeInTheDocument();
    expect(screen.getByText('Investment growth')).toBeInTheDocument();
    expect(screen.getByText('Saved this month')).toBeInTheDocument();
    expect(screen.getByText(/Your savings & cover/)).toBeInTheDocument();
    expect(screen.getByText('Retirement fund')).toBeInTheDocument();
    expect(screen.getByText('Emergency fund')).toBeInTheDocument();
    expect(screen.getByText('Insurance cover')).toBeInTheDocument();
  });

  it('shows the employer-match block + chip only for employer-onboarded members', () => {
    const { unmount } = renderHome(SPLIT_FIXTURE);
    expect(screen.queryByText('Your employer tops up your pension')).not.toBeInTheDocument();
    expect(screen.queryByText('Employer-sponsored')).not.toBeInTheDocument();
    unmount();

    renderHome({ ...SPLIT_FIXTURE, employerId: 'emp-001' });
    expect(screen.getByText('Your employer tops up your pension')).toBeInTheDocument();
    // The employer chip (content-top) + the block tag both read "Employer-sponsored".
    expect(screen.getAllByText('Employer-sponsored').length).toBeGreaterThanOrEqual(2);
  });
});
