// OverlayPanel — the admin district-level Branches | Employers bifurcation
// (OverlayPanel.jsx:383 DistrictBifurcation + its render gate at ~814). It was
// referenced by no test/spec. The branch is taken ONLY when
// `displayLevel === 'district' && employerAware && nextLevel` — i.e. the admin
// shell (real DataScopeProvider → employerAware true) drilled to a district.
//
// DistrictBifurcation is a private inner component, so we exercise it through the
// public OverlayPanel: mount it at the district level inside a real
// DataScopeProvider (employerAware), stub the data hooks so the district has both
// active branches (drillable agent-tree leaves) and employer leaves (terminal),
// then assert the [Branches|Employers] tablist renders, defaults to Branches, and
// switches to the employer leaf list on tab click.
//
// The distributor path (no provider → employerAware false) is NOT this branch and
// is covered elsewhere; here we pin the admin-only bifurcation specifically.

import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataScopeProvider } from '../../contexts/DataScopeContext';
import { SCOPES } from '../../constants/scopes';

const DISTRICT_ID = 'd-kampala';

// Drillable agent-tree branches for the district (Branches tab).
const BRANCHES = [
  { id: 'b-001', name: 'Kampala Central Branch', active: true, metrics: { totalSubscribers: 120 } },
  { id: 'b-002', name: 'Nakawa Branch', active: false, metrics: { totalSubscribers: 0 } },
];

// Per-district employer leaf list (Employers tab) from the geo rollup.
const GEO = {
  byDistrict: {
    [DISTRICT_ID]: {
      subscribers: 42, active: 30, aum: 5000000, employers: 2,
      list: [
        { id: 'emp-001', name: 'Nile Breweries Demo Ltd', subscribers: 30 },
        { id: 'emp-002', name: 'Kampala Coffee Co', subscribers: 12 },
      ],
    },
  },
};

const drillDown = vi.fn();

vi.mock('../../contexts/DashboardContext', () => ({
  useDashboard: () => ({
    level: 'district',
    selectedIds: { district: DISTRICT_ID },
    drillDown,
    drillUp: vi.fn(),
    reset: vi.fn(),
    branchMenuOpen: false, agentMenuOpen: false, subscriberMenuOpen: false,
    setViewReportsOpen: vi.fn(), setReportContext: vi.fn(), setCommissionsOpen: vi.fn(),
  }),
}));

vi.mock('../../hooks/useEntity', () => ({
  // currentEntity must be truthy to clear the skeleton guard.
  useCurrentEntity: () => ({ data: { id: DISTRICT_ID, name: 'Kampala District', active: true, metrics: {} }, isLoading: false }),
  useChildren: () => ({ data: BRANCHES }),
  useChildrenMetrics: () => ({ data: {} }),
  useEntityMetrics: () => ({ data: { totalSubscribers: 120, activeRate: 80, aum: 9000000 }, isError: false }),
  useTopBranch: () => ({ data: null }),
  useSearch: () => ({ data: [] }),
  useEmployerGeoRollup: () => ({ data: GEO }),
}));

vi.mock('../../hooks/useCommission', () => ({
  useEntityCommissionSummary: () => ({ data: null }),
}));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../../hooks/useDebouncedValue', () => ({ useDebouncedValue: (v) => v }));

const { default: OverlayPanel } = await import('./OverlayPanel');

function renderPanel(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataScopeProvider defaultScope={SCOPES.ALL}>
        <OverlayPanel {...props} />
      </DataScopeProvider>
    </QueryClientProvider>,
  );
}

// The panel renders TWO tablists at the district level — the TimePeriodCard's
// Today/Week/Month strip AND this bifurcation. Scope to the bifurcation via its
// distinctive "Branches (N)" / "Employers (N)" tab labels rather than the role.
const branchesTab = () => screen.getByRole('tab', { name: /^Branches \(\d+\)$/ });
const employersTab = () => screen.getByRole('tab', { name: /^Employers \(\d+\)$/ });

// drillDown is a module-level spy shared by the mocked useDashboard — reset it
// between tests so a prior branch-drill doesn't leak into a later assertion.
beforeEach(() => drillDown.mockClear());

describe('<OverlayPanel /> district Branches|Employers bifurcation (admin scope)', () => {
  it('renders the bifurcation tabs with both branch + employer counts', () => {
    renderPanel();
    // Counts come from the branch list (2) and the employer leaf list (2).
    expect(branchesTab()).toHaveTextContent('Branches (2)');
    expect(employersTab()).toHaveTextContent('Employers (2)');
  });

  it('defaults to the Branches tab (drillable agent-tree leaves)', () => {
    renderPanel();
    expect(branchesTab()).toHaveAttribute('aria-selected', 'true');
    expect(employersTab()).toHaveAttribute('aria-selected', 'false');
    // Active branch row is present; the employer leaves are not yet shown.
    expect(screen.getByText('Kampala Central Branch')).toBeInTheDocument();
    expect(screen.queryByText('Nile Breweries Demo Ltd')).not.toBeInTheDocument();
  });

  it('drills into a branch when an active branch row is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Kampala Central Branch'));
    // nextLevel for district === 'branch'.
    expect(drillDown).toHaveBeenCalledWith('branch', 'b-001');
  });

  // The tab body animates via AnimatePresence mode="wait" (the outgoing list
  // lingers during exit), so the post-switch content is awaited with findByText.
  it('switches to the Employers tab and lists the per-district employer leaves', async () => {
    renderPanel();
    fireEvent.click(employersTab());
    expect(await screen.findByText('Nile Breweries Demo Ltd')).toBeInTheDocument();
    expect(screen.getByText('Kampala Coffee Co')).toBeInTheDocument();
    // Branch rows are gone once the Employers tab is active.
    expect(screen.queryByText('Kampala Central Branch')).not.toBeInTheDocument();
  });

  it('clicking an employer leaf fires the onEmployerSelect callback (terminal — no drill)', async () => {
    const onEmployerSelect = vi.fn();
    renderPanel({ onEmployerSelect });
    fireEvent.click(employersTab());
    fireEvent.click(await screen.findByText('Nile Breweries Demo Ltd'));
    expect(onEmployerSelect).toHaveBeenCalledWith('emp-001');
    // An employer is a leaf — it must NOT trigger a map drill-down.
    expect(drillDown).not.toHaveBeenCalled();
  });
});
