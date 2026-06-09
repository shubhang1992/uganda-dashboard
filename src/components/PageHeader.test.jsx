// Tests for PageHeader's showBack prop on the default (flat) variant (§07-L4).
//
// Behaviours covered:
//   - default variant renders the back button by default (showBack defaults true)
//   - showBack={false} suppresses the back button on the default variant

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageHeader from './PageHeader';

function renderHeader(props) {
  return render(
    <MemoryRouter>
      <PageHeader title="Reports" {...props} />
    </MemoryRouter>,
  );
}

describe('<PageHeader /> showBack', () => {
  it('renders the back button by default on the flat variant', () => {
    renderHeader();
    expect(screen.getByLabelText('Back')).toBeInTheDocument();
  });

  it('suppresses the back button when showBack={false}', () => {
    renderHeader({ showBack: false });
    expect(screen.queryByLabelText('Back')).toBeNull();
    // Title still renders.
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
