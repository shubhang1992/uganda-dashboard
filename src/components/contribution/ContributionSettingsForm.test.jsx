// Tests for the insurance pre-check + dirty baseline on ContributionSettingsForm.
//
// Regression guard for the "held insurance resets to unchecked" bug: the form
// must pre-check exactly the products the subscriber holds (passed via
// `initialInsuranceTypes`, derived from live policies) — which is the SAME set
// the settle flow treats as already-paid — so a fully-held plan opened untouched
// reads as "No changes to save" and never re-prompts payment for held cover.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContributionSettingsForm from './ContributionSettingsForm';

// A valid existing schedule (isNew=false, amount above the minimum).
const BASE = { frequency: 'monthly', amount: 50000, retirementPct: 80, emergencyPct: 20, includeInsurance: true };

function renderForm(props) {
  return render(<ContributionSettingsForm onSave={() => {}} {...props} />);
}

describe('<ContributionSettingsForm /> insurance pre-check', () => {
  it('pre-checks every held product passed via initialInsuranceTypes', () => {
    renderForm({ initial: BASE, initialInsuranceTypes: ['life', 'health', 'funeral'] });
    expect(screen.getByRole('switch', { name: /Life insurance/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Health insurance/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Funeral insurance/ })).toBeChecked();
  });

  it('reads "No changes to save" (disabled) when a fully-held plan is opened untouched', () => {
    // This is the core no-double-charge invariant: the dirty baseline equals the
    // pre-checked held set, so an untouched save is a no-op.
    renderForm({ initial: BASE, initialInsuranceTypes: ['life', 'health', 'funeral'] });
    const save = screen.getByRole('button', { name: 'No changes to save' });
    expect(save).toBeDisabled();
  });

  it('lets initialInsuranceTypes override the legacy include_insurance fallback', () => {
    renderForm({ initial: { ...BASE, includeInsurance: true }, initialInsuranceTypes: ['health'] });
    expect(screen.getByRole('switch', { name: /Health insurance/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Life insurance/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Funeral insurance/ })).not.toBeChecked();
  });

  it('falls back to life-only when no held set is supplied (onboarding/agent path)', () => {
    renderForm({ initial: { ...BASE, includeInsurance: true } });
    expect(screen.getByRole('switch', { name: /Life insurance/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Health insurance/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Funeral insurance/ })).not.toBeChecked();
  });

  it('checks nothing when the held set is empty', () => {
    renderForm({ initial: { ...BASE, includeInsurance: false }, initialInsuranceTypes: [] });
    expect(screen.getByRole('switch', { name: /Life insurance/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Health insurance/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Funeral insurance/ })).not.toBeChecked();
  });
});

describe('<ContributionSettingsForm /> collapsible (mobile)', () => {
  it('collapses each section to a summary row + Edit when editing an existing schedule', () => {
    renderForm({ initial: BASE, initialInsuranceTypes: ['life'], collapsible: true });
    // Controls are hidden until the user taps Edit on a section.
    expect(screen.queryByRole('radio', { name: /Weekly/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Health insurance/ })).toBeNull();
    // One Edit toggle per section (frequency, amount, split, insurance).
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(4);
  });

  it('expands a section on Edit, revealing its controls', async () => {
    const user = userEvent.setup();
    renderForm({ initial: BASE, initialInsuranceTypes: ['life'], collapsible: true });
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]); // frequency
    expect(screen.getByRole('radio', { name: /Weekly/ })).toBeInTheDocument();
  });

  it('keeps the full form (no collapse) for a brand-new schedule', () => {
    renderForm({ initial: null, collapsible: true });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('radio', { name: /Weekly/ })).toBeInTheDocument();
  });
});
