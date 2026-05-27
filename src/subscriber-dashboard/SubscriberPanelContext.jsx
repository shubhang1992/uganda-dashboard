import { createContext, useContext, useMemo } from 'react';
import { DashboardPanelProvider, useDashboardPanel } from '../contexts/DashboardPanelContext';

/**
 * Subscriber-specific extension of DashboardPanelContext.
 *
 * Background (F5 — DASHBOARD_AUDIT.md finding #27):
 * `SubscriberDashboardShell` historically mounted the full
 * `DashboardProvider`, which exposes a wide surface of drill-down nav +
 * distributor/branch panel toggles (branch menus, agent menus, view
 * subscribers, etc.) that subscribers never consume — wasted re-renders.
 *
 * This wrapper is the canonical seam for subscriber-only panel state. Today
 * the subscriber dashboard only needs the generic `settingsOpen` key from
 * `DashboardPanelContext`, so this provider currently adds no extra keys —
 * it exists to:
 *   1. Make role intent explicit at the shell layer (`SubscriberPanelProvider`
 *      instead of the generic provider).
 *   2. Give future subscriber-specific UI state (e.g. nominee/withdraw flow
 *      drafts, claim wizard steps) a properly scoped home that won't leak
 *      into other dashboards.
 *
 * Generic panel keys (`settingsOpen`, etc.) continue to flow through
 * `useDashboardPanel()` and `useDashboard()` unchanged.
 *
 * @typedef {Object} SubscriberPanelExtension
 * (Add subscriber-only keys here as features land — e.g. `claimWizardOpen`,
 *  `nomineesPanelOpen`, `withdrawDraft`.)
 */

const SubscriberPanelContext = createContext(null);

function SubscriberPanelExtensionProvider({ children }) {
  // No subscriber-specific keys yet. Memoise the empty object so consumers
  // of useSubscriberPanel() don't re-render on every parent render.
  const value = useMemo(() => ({}), []);
  return (
    <SubscriberPanelContext value={value}>
      {children}
    </SubscriberPanelContext>
  );
}

/**
 * Wraps the generic DashboardPanelProvider with the subscriber-specific
 * extension layer. Mount this at the subscriber dashboard shell only.
 */
export function SubscriberPanelProvider({ children }) {
  return (
    <DashboardPanelProvider>
      <SubscriberPanelExtensionProvider>
        {children}
      </SubscriberPanelExtensionProvider>
    </DashboardPanelProvider>
  );
}

/**
 * Access subscriber-specific panel UI state, merged with the generic
 * dashboard panel state. Use this inside subscriber-dashboard surfaces that
 * need either layer; generic-only consumers can keep using
 * `useDashboardPanel()` or `useDashboard()`.
 */
export function useSubscriberPanel() {
  const ext = useContext(SubscriberPanelContext);
  if (!ext) {
    throw new Error('useSubscriberPanel must be used within SubscriberPanelProvider');
  }
  const generic = useDashboardPanel();
  return useMemo(() => ({ ...generic, ...ext }), [generic, ext]);
}
