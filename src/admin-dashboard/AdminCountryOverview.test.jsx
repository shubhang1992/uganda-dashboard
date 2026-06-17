// AdminCountryOverview — the Platform Overview data-scope filter (audit: zero
// coverage for the re-scoping useMemo at AdminCountryOverview.jsx:61-74).
//
// The headline metrics (AUM / contributions / withdrawals / subscriber total /
// active rate) are driven by a `scope`-keyed useMemo over `usePlatformOverview`'s
// `byChannel` map:
//   ALL          → platform totals (totalSubscribers / aum / …) + the per-channel
//                  acquisition card (via distributors / via employers)
//   DISTRIBUTORS → byChannel.distributor slice
//   EMPLOYERS    → byChannel.employer slice + the employer-activity trends strip
//
// This mounts the REAL DataScopeProvider (so clicking a PillChip drives the real
// context → the real useMemo), stubs the data hooks with three clearly-distinct
// channel slices, and asserts the displayed cards switch correctly per scope.
// It also pins the distributor-isolation contract: the admin-only employer
// ACTIVITY rollup is enabled ONLY in the EMPLOYERS scope.

import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { DataScopeProvider } from '../contexts/DataScopeContext';
import { SCOPES } from '../constants/scopes';

// ── Distinct, non-overlapping numbers per channel so a wrong slice is obvious ──
const OVERVIEW = {
  distributors: 7,
  employers: 4,
  // Platform totals (ALL scope).
  totalSubscribers: 5017,
  activeSubscribers: 4000,
  inactiveSubscribers: 1017,
  aum: 900000000,
  totalContributions: 800000000,
  totalWithdrawals: 50000000,
  // Acquisition channel headcounts (ALL-scope card only).
  subscribersViaDistributor: 5000,
  subscribersViaEmployer: 17,
  subscribersDirect: 0,
  byChannel: {
    distributor: {
      subscribers: 5000, active: 3990, inactive: 1010,
      aum: 880000000, contributions: 790000000, withdrawals: 49000000,
    },
    employer: {
      subscribers: 17, active: 10, inactive: 7,
      aum: 20000000, contributions: 10000000, withdrawals: 1000000,
    },
  },
};

// Track the enabled flag the employer-activity rollup is called with so we can
// pin the distributor-isolation contract (fetched ONLY in the EMPLOYERS scope).
const employerActivityCalls = [];

vi.mock('../hooks/useEntity', () => ({
  usePlatformOverview: () => ({ data: OVERVIEW, isError: false }),
  useEntityMetrics: () => ({ data: null }),
  useChildren: () => ({ data: [] }),
  useChildrenMetrics: () => ({ data: {} }),
  useEmployerGeoRollup: () => ({ data: null }),
  useEmployerActivityRollup: (enabled) => {
    employerActivityCalls.push(enabled);
    return { data: null };
  },
}));

// The country card pulls GlobalSearch / TimePeriodCard / CollapsibleSection from
// the (heavy, data-bound) distributor OverlayPanel — stub them so we exercise the
// scope logic alone, not the whole overlay data graph.
vi.mock('../dashboard/overlay/OverlayPanel', () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
  TimePeriodCard: () => <div data-testid="time-period-card" />,
  CollapsibleSection: ({ children }) => <div>{children}</div>,
}));

// Dashboard + admin-panel contexts: only the setters the card calls are needed.
vi.mock('../contexts/DashboardContext', () => ({
  useDashboard: () => ({
    drillDown: vi.fn(),
    setViewReportsOpen: vi.fn(),
    setReportContext: vi.fn(),
  }),
}));
vi.mock('../contexts/AdminPanelContext', () => ({
  useAdminPanel: () => ({
    setViewDistributorsOpen: vi.fn(),
    setViewEmployersOpen: vi.fn(),
  }),
}));

const { default: AdminCountryOverview } = await import('./AdminCountryOverview');

function renderOverview() {
  return render(
    <DataScopeProvider defaultScope={SCOPES.ALL}>
      <AdminCountryOverview />
    </DataScopeProvider>,
  );
}

// The Subscribers count lives in a labelled button — read its number sibling.
function subscribersCount() {
  const label = screen.getByText('Subscribers');
  return within(label.closest('button')).getByText(/[\d,]+/).textContent;
}

function clickScope(name) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

beforeEach(() => {
  employerActivityCalls.length = 0;
});

describe('<AdminCountryOverview /> data-scope filter', () => {
  it('defaults to ALL: platform totals + the acquisition (via distributors/employers) card', () => {
    renderOverview();
    // Platform-wide subscriber total (the 5,000-vs-5,017 fix), not a channel slice.
    expect(subscribersCount()).toBe('5,017');
    // The acquisition channel card is shown ONLY in the ALL scope.
    expect(screen.getByText('via distributors')).toBeInTheDocument();
    expect(screen.getByText('via employers')).toBeInTheDocument();
    // ALL scope must NOT fetch the employer-activity rollup.
    expect(employerActivityCalls).not.toContain(true);
  });

  it('DISTRIBUTORS scope swaps the headline to the distributor channel slice', () => {
    renderOverview();
    clickScope('Distributors');
    // Subscriber total now reflects byChannel.distributor (5000), not the 5017 total.
    expect(subscribersCount()).toBe('5,000');
    // The acquisition card is hidden under a single-channel scope.
    expect(screen.queryByText('via distributors')).not.toBeInTheDocument();
    // Still no employer-activity fetch outside the EMPLOYERS scope.
    expect(employerActivityCalls).not.toContain(true);
  });

  it('EMPLOYERS scope swaps to the employer slice AND enables the employer-activity rollup', () => {
    renderOverview();
    clickScope('Employers');
    // Subscriber total now reflects byChannel.employer (17).
    expect(subscribersCount()).toBe('17');
    expect(screen.queryByText('via distributors')).not.toBeInTheDocument();
    // Distributor-isolation contract: the admin-only activity rollup is fetched
    // (enabled === true) ONLY once the EMPLOYERS scope is active.
    expect(employerActivityCalls).toContain(true);
  });

  it('re-scopes back to platform totals when ALL is reselected', () => {
    renderOverview();
    clickScope('Employers');
    expect(subscribersCount()).toBe('17');
    clickScope('All data');
    expect(subscribersCount()).toBe('5,017');
    expect(screen.getByText('via employers')).toBeInTheDocument();
  });
});
