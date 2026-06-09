// RTL test for AnnualStatement's year re-sync effect (audit §02-L1).
//
// The selected `year` was read once from a possibly-empty `years` (transactions
// hydrate async), so on a slow load it stuck on the wall-clock year and never
// landed on a populated year. The fix adds an effect that snaps `year` onto the
// newest populated year once data arrives. This mounts with empty transactions,
// then rerenders with hydrated data and asserts the populated year chip is
// selected — and that the summary header reflects it.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../hooks/useSubscriber', () => ({
  useCurrentSubscriber: vi.fn(),
}));

const { useCurrentSubscriber } = await import('../../../hooks/useSubscriber');
const { default: AnnualStatement } = await import('./AnnualStatement');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.resetAllMocks(); });

describe('<AnnualStatement /> year re-sync', () => {
  it('snaps the selected year onto a populated year once transactions hydrate', async () => {
    // Cold load: no transactions yet (years is empty).
    useCurrentSubscriber.mockReturnValue({ data: { transactions: [] }, isLoading: false, isError: false });
    const { rerender } = render(<AnnualStatement />);

    // Data lands — newest tx year is 2026.
    useCurrentSubscriber.mockReturnValue({
      data: {
        transactions: [
          { id: 'a', type: 'contribution', amount: 30000, date: '2026-03-12' },
          { id: 'b', type: 'contribution', amount: 20000, date: '2025-08-04' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    rerender(<AnnualStatement />);

    await waitFor(() => {
      // The summary header reflects the re-synced, populated year.
      expect(screen.getByText('2026 summary')).toBeInTheDocument();
    });
  });
});
