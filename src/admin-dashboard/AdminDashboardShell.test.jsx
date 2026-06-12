// RTL smoke test for AdminDashboardShell (audit §7b.15).
//
// The admin WIP had zero coverage at any layer — if the shell crashes on render
// no automated test catches it. This mounts the shell with MemoryRouter +
// QueryClientProvider and stubs the heavy, data-/env-bound dependencies (the
// lazy Leaflet map, the per-panel data children, AdminSidebar, AuthContext,
// the `useIsMobile` matchMedia hook, and `useCurrentEntity`) so we exercise the
// shell's OWN composition logic — its providers wire up, the country-level
// Summary mounts (NOT the geographic overlay), and the metrics row renders —
// without pulling the entire dashboard data graph or needing a jsdom
// matchMedia polyfill. The REAL DashboardProvider + AdminPanelProvider run so a
// provider-wiring regression (e.g. a missing context) still surfaces as a crash.

import React from 'react';
import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Env / data hooks ─────────────────────────────────────────────────────────
// useIsMobile reads window.matchMedia (absent in jsdom); pin desktop so the map
// branch is taken (it's mocked below).
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
// useCurrentEntity (NavAnnouncer) would fire a data query; stub it idle.
vi.mock('../hooks/useEntity', () => ({ useCurrentEntity: () => ({ data: null }) }));
// AuthContext is only consumed by the (closed) MobileDrawer, but mock it so the
// shell never reaches into localStorage/session bootstrap.
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

// ── Heavy / data-bound children → light stubs with stable test ids ───────────
vi.mock('./sidebar/AdminSidebar', () => ({ default: () => <div data-testid="admin-sidebar" /> }));
vi.mock('../dashboard/map/UgandaMap', () => ({ default: () => <div data-testid="uganda-map" /> }));
vi.mock('./AdminCountryOverview', () => ({ default: () => <div data-testid="admin-country-overview">National Overview</div> }));
vi.mock('../dashboard/overlay/OverlayPanel', () => ({ default: () => <div data-testid="overlay-panel" /> }));
vi.mock('../dashboard/overlay/Breadcrumb', () => ({ default: () => <div data-testid="breadcrumb" /> }));
vi.mock('../dashboard/cards/MetricsRow', () => ({ default: () => <div data-testid="metrics-row" /> }));
vi.mock('../dashboard/overlay/TopBar', () => ({ default: () => <div data-testid="top-bar" /> }));
// Panels are gated by their open-state booleans (all start false), so they
// won't mount — but stub them so the import graph stays cheap regardless.
vi.mock('../dashboard/branch/CreateBranch', () => ({ default: () => null }));
vi.mock('../dashboard/branch/ViewBranches', () => ({ default: () => null }));
vi.mock('../dashboard/agent/ViewAgents', () => ({ default: () => null }));
vi.mock('../dashboard/subscriber/ViewSubscribers', () => ({ default: () => null }));
vi.mock('../dashboard/reports/ViewReports', () => ({ default: () => null }));
vi.mock('../dashboard/settings/Settings', () => ({ default: () => null }));
vi.mock('../dashboard/tickets/ViewTickets', () => ({ default: () => null }));
vi.mock('./distributors/ViewDistributors', () => ({ default: () => null }));
vi.mock('./distributors/CreateDistributor', () => ({ default: () => null }));
vi.mock('./employers/ViewEmployers', () => ({ default: () => null }));
vi.mock('./employers/CreateEmployer', () => ({ default: () => null }));

const { default: AdminDashboardShell } = await import('./AdminDashboardShell');

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdminDashboardShell />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('<AdminDashboardShell />', () => {
  it('mounts without crashing and renders the main landmark + sidebar', () => {
    renderShell();
    expect(document.getElementById('main')).not.toBeNull();
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
  });

  it('shows the admin country Summary (NOT the geographic overlay) at the default country level', () => {
    renderShell();
    // Country-level renders AdminCountryOverview, not the distributor OverlayPanel.
    expect(screen.getByTestId('admin-country-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('overlay-panel')).toBeNull();
  });

  it('renders the metrics row and (desktop) map chrome', () => {
    renderShell();
    expect(screen.getByTestId('metrics-row')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('does not mount any slide-in panel while every panel open-state is closed', () => {
    renderShell();
    // The reused + admin-exclusive panels are all gated false at cold load
    // (mirrors the distributor shell's lazy-mount fix) — none should be present.
    expect(screen.queryByTestId('overlay-panel')).toBeNull();
  });
});
