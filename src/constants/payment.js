// Shared mobile-money payment methods for the subscriber demo pay surfaces.
// Single-sourced so the mobile <PaySheet> and the desktop <InlinePayPanel>
// offer an identical picker on every pay flow (renewals, insurance cover,
// settle-this-period). The `full` value is what callers pass straight to their
// RPC (e.g. 'MTN Mobile Money').
export const MOBILE_MONEY_METHODS = [
  { id: 'mtn', label: 'MTN MoMo', full: 'MTN Mobile Money', helper: '+256 71 100 0001' },
  { id: 'airtel', label: 'Airtel Money', full: 'Airtel Money', helper: '+256 70 100 0001' },
];
