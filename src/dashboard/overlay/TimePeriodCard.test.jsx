// TimePeriodCard — the employer-scope `topEntity` branch (0059 admin trends).
// When `topEntity` is supplied (admin Employers scope), the card renders it as a
// "Top Employer · <amount>" row from the passed-in employer activity metrics, and
// does NOT fire the distributor `useTopBranch` query (level/parentId are null →
// the query is disabled), so the distributor card path is untouched.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimePeriodCard } from './OverlayPanel';

// Employer-activity shape (subset) — default tab is "This Month".
const metrics = {
  newSubscribersThisMonth: 4, prevNewSubscribersThisMonth: 1,
  monthlyContributions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2358000, 2358000, 7074000],
  monthlyWithdrawals: 330000, prevMonthlyWithdrawals: 90000,
};

function renderCard(props) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TimePeriodCard {...props} />
    </QueryClientProvider>,
  );
}

describe('<TimePeriodCard /> employer topEntity branch', () => {
  it('renders the provided Top Employer + employer metrics under the Employers scope', () => {
    renderCard({
      metrics, level: null, parentId: null, topEntityLabel: 'Top Employer',
      topEntity: { name: 'Nile Breweries Demo Ltd', contribution: 7074000 },
    });
    // Top Employer row (label prefix + the employer name as the value).
    expect(screen.getByText(/Top Employer/)).toBeInTheDocument();
    expect(screen.getByText('Nile Breweries Demo Ltd')).toBeInTheDocument();
    // Default "This Month" tab → New Subscribers = 4.
    expect(screen.getByText('4')).toBeInTheDocument();
    // The distributor "Top Branch" label must NOT appear in the employer card.
    expect(screen.queryByText(/Top Branch/)).not.toBeInTheDocument();
  });

  it('falls back to the distributor Top Branch path when topEntity is omitted', () => {
    // No topEntity + null parentId → useTopBranch disabled, no top row at all.
    renderCard({ metrics, level: 'country', parentId: null });
    expect(screen.queryByText(/Top Employer/)).not.toBeInTheDocument();
  });
});
