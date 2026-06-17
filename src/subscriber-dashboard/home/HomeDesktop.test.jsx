// RTL tests for HomeDesktop's "Savings split" card.
//
// Retirement + Emergency are the two pots that sum to net balance, so the two
// share-of-balance labels MUST sum to exactly 100%. Rounding each pot's share
// independently can yield 99% or 101% (when both fractional parts are .5);
// the fix derives the emergency share as the complement of the rounded
// retirement share so the pair is always exactly 100. This test pins a balance
// whose naive rounding would print 84% + 17% = 101% and asserts the sum is 100.
//
// The 4 KPI tiles (Total balance / Amount invested / Savings split / Insurance
// cover) get a smoke assertion. The Home widgets are stubbed — they have their
// own data dependencies and aren't under test here.

import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Reduced motion → useCountUp snaps to the resolved balance (no rAF timing),
// keeping the rendered figures deterministic.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

// Stub the child widgets — irrelevant to the KPI tiles + savings split, and
// they pull on hooks/services we don't want to wire for this unit test.
vi.mock('./widgets/TopUpWidget', () => ({ default: () => null }));
vi.mock('./widgets/CoPilotWidget', () => ({ default: () => null }));
vi.mock('./widgets/PoliciesWidget', () => ({ default: () => null }));
vi.mock('./widgets/ActivityWidget', () => ({ default: () => null }));
vi.mock('./widgets/EmployerBenefitsWidget', () => ({ default: () => null }));

const { default: HomeDesktop } = await import('./HomeDesktop');

function renderHome(subscriber) {
  return render(
    <MemoryRouter>
      <HomeDesktop subscriber={subscriber} />
    </MemoryRouter>,
  );
}

describe('<HomeDesktop /> savings split', () => {
  it('the two percentages sum to exactly 100 even when naive rounding would give 101', () => {
    // 83.5% / 16.5% — each fractional part is exactly .5, so rounding both
    // independently gives 84 + 17 = 101. The complement-based fix prints 100.
    renderHome({
      name: 'Mary Aol',
      netBalance: 2_000_000,
      retirementBalance: 1_670_000, // 83.5%
      emergencyBalance: 330_000, //    16.5%
    });

    // The legend renders "<amount> · <pct>%" for each pot. Pull the integer
    // percentages out of the split-bar's aria-label and assert they sum to 100.
    const bar = screen.getByRole('img', { name: /Retirement \d+%, Emergency \d+%/ });
    const label = bar.getAttribute('aria-label');
    const [retPct, emerPct] = (label.match(/\d+/g) || []).map(Number);

    expect(retPct + emerPct).toBe(100);
    // The retirement share is the directly-rounded value (83.5 → 84); emergency
    // is its complement (16), NOT the independently-rounded 17.
    expect(retPct).toBe(84);
    expect(emerPct).toBe(16);
  });

  it('renders the 4 KPI tiles', () => {
    renderHome({
      name: 'Mary Aol',
      netBalance: 2_000_000,
      retirementBalance: 1_670_000,
      emergencyBalance: 330_000,
      insurance: { cover: 5_000_000, premiumMonthly: 2_000 },
    });

    expect(screen.getByText('Total balance')).toBeInTheDocument();
    expect(screen.getByText('Amount invested')).toBeInTheDocument();
    expect(screen.getByText('Savings split')).toBeInTheDocument();
    expect(screen.getByText('Insurance cover')).toBeInTheDocument();
  });
});
