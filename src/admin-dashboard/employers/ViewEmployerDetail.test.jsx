// RTL smoke test for the admin ViewEmployerDetail panel.
//
// Opened by clicking an employer in the map district drill-down. Mounts with the
// real AdminPanelProvider (open/detail state) + QueryClientProvider, and a mocked
// employer service so no Supabase call is made. Asserts: the panel renders the
// employer name + KPI tiles + the member roster when focused on an employer.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/employer', () => ({
  getAllEmployersMetrics: vi.fn(),
  getEmployees: vi.fn(),
  getEmployer: vi.fn(),
  setEmployerStatus: vi.fn(),
}));

const employer = await import('../../services/employer');
const { AdminPanelProvider, useAdminPanel } = await import('../../contexts/AdminPanelContext');
const { ToastProvider } = await import('../../contexts/ToastContext');
const { default: ViewEmployerDetail } = await import('./ViewEmployerDetail');

// Host that focuses the detail panel on emp-001 on mount (the panel renders
// nothing while viewEmployerDetailOpen is false).
function OpenOnMount() {
  const { setDetailEmployerId, setViewEmployerDetailOpen } = useAdminPanel();
  React.useEffect(() => {
    setDetailEmployerId('emp-001');
    setViewEmployerDetailOpen(true);
  }, [setDetailEmployerId, setViewEmployerDetailOpen]);
  return <ViewEmployerDetail />;
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdminPanelProvider>
          <OpenOnMount />
        </AdminPanelProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  employer.getAllEmployersMetrics.mockResolvedValue([
    { id: 'emp-001', name: 'Nile Breweries Demo Ltd', sector: 'Manufacturing', district: 'Kampala',
      status: 'active', headcount: 16, activeCount: 14, totalBalance: 12400000, totalContributions: 7100000,
      employerContributions: 4200000, payrollCadence: 'monthly', insuredCount: 12 },
  ]);
  employer.getEmployees.mockResolvedValue([
    { id: 'empe-001', name: 'Brian Okello', occupation: 'Plant Manager', netBalance: 6300000, isActive: true },
    { id: 'empe-013', name: 'Henry Kato', occupation: 'Driver', netBalance: 1540000, isActive: false },
  ]);
  employer.getEmployer.mockResolvedValue({
    id: 'emp-001', name: 'Nile Breweries Demo Ltd',
    contactName: 'Patience Namaganda', contactPhone: '+256700000031', contactEmail: 'hr@nilebreweries.demo',
  });
});
afterEach(() => { vi.resetAllMocks(); });

describe('<ViewEmployerDetail />', () => {
  it('renders the employer name, KPI tiles, contact + scheme cards, and member roster', async () => {
    renderPanel();
    // Profile header + KPI (Members = headcount).
    expect(await screen.findByRole('heading', { name: 'Nile Breweries Demo Ltd' })).toBeInTheDocument();
    expect(screen.getByText('Manufacturing · Kampala')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument(); // KPI label (header reads "Members (2)")
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Active Rate')).toBeInTheDocument();
    // Employer Contact card — resolves from useEmployer (getEmployer).
    expect(await screen.findByText('Patience Namaganda')).toBeInTheDocument();
    expect(screen.getByText('hr@nilebreweries.demo')).toBeInTheDocument();
    // Scheme Summary card.
    expect(screen.getByText('Employer-funded')).toBeInTheDocument();
    // Roster rows resolve from useEmployees.
    expect(await screen.findByText('Brian Okello')).toBeInTheDocument();
    expect(screen.getByText('Henry Kato')).toBeInTheDocument();
    // Roster status — "Inactive" is unique to the suspended member's meta line.
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(employer.getEmployees).toHaveBeenCalledWith('emp-001');
    expect(employer.getEmployer).toHaveBeenCalledWith('emp-001');
  });

  // Audit L6: the admin deactivate / reactivate confirm flow. The panel control
  // opens a confirm Modal; confirming calls set_employer_status (via
  // useSetEmployerStatus → setEmployerStatus) with the TOGGLED status. On
  // 'inactive' the RPC detaches every member (employer_id → NULL); the test
  // asserts the toggled-status argument, which is the load-bearing contract.
  it('deactivates an ACTIVE employer: confirm calls setEmployerStatus with "inactive"', async () => {
    // The beforeEach seeds emp-001 with status 'active'.
    employer.setEmployerStatus.mockResolvedValue({ id: 'emp-001', status: 'inactive', membersDetached: 16 });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole('heading', { name: 'Nile Breweries Demo Ltd' });

    // The panel control on an active employer reads "Deactivate employer".
    const panelBtn = await screen.findByRole('button', { name: /deactivate employer/i });
    await user.click(panelBtn);

    // Confirm inside the modal dialog — its confirm button is the bare
    // "Deactivate" (the panel button is "Deactivate employer"), so scope to the
    // dialog and match exactly.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => expect(employer.setEmployerStatus).toHaveBeenCalledTimes(1));
    expect(employer.setEmployerStatus).toHaveBeenCalledWith('emp-001', 'inactive');
  });

  it('reactivates an INACTIVE employer: control reads "Reactivate" and confirms with "active"', async () => {
    // Re-seed the metrics rollup so emp-001 is inactive for this case.
    employer.getAllEmployersMetrics.mockResolvedValue([
      { id: 'emp-001', name: 'Nile Breweries Demo Ltd', sector: 'Manufacturing', district: 'Kampala',
        status: 'inactive', headcount: 16, activeCount: 14, totalBalance: 12400000, totalContributions: 7100000,
        employerContributions: 4200000, payrollCadence: 'monthly', insuredCount: 12 },
    ]);
    employer.setEmployerStatus.mockResolvedValue({ id: 'emp-001', status: 'active', membersDetached: 0 });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole('heading', { name: 'Nile Breweries Demo Ltd' });

    // An inactive employer's panel control reads "Reactivate employer".
    expect(screen.queryByRole('button', { name: /deactivate employer/i })).toBeNull();
    const panelBtn = await screen.findByRole('button', { name: /reactivate employer/i });
    await user.click(panelBtn);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^reactivate$/i }));

    await waitFor(() => expect(employer.setEmployerStatus).toHaveBeenCalledTimes(1));
    expect(employer.setEmployerStatus).toHaveBeenCalledWith('emp-001', 'active');
  });
});
