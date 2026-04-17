import { useMemo } from 'react';
import { DashboardNavProvider, useDashboardNav } from './DashboardNavContext';
import { DashboardPanelProvider, useDashboardPanel } from './DashboardPanelContext';

/**
 * @typedef {import('./DashboardNavContext').DashboardNavContextValue & import('./DashboardPanelContext').DashboardPanelContextValue} DashboardContextValue
 */

/**
 * Convenience wrapper that composes both Nav and Panel providers.
 * Nav wraps Panel so the panel context can register into the nav context's
 * onPanelAction ref.
 */
export function DashboardProvider({ children }) {
  return (
    <DashboardNavProvider>
      <DashboardPanelProvider>
        {children}
      </DashboardPanelProvider>
    </DashboardNavProvider>
  );
}

/**
 * Backward-compatible hook — merges nav + panel contexts so existing
 * consumers don't need to change their imports.
 * @returns {DashboardContextValue}
 */
export function useDashboard() {
  const nav = useDashboardNav();
  const panel = useDashboardPanel();

  return useMemo(() => ({ ...nav, ...panel }), [nav, panel]);
}
