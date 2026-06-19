// Settings panel (Phase 8) — the MOBILE employer settings surface: the shared
// EmployerSlidePanel chrome (width 480) with full ARIA tab semantics (tablist /
// tab / tabpanel) over the four settings tabs.
//
// The tab BODIES + the shared `default_contribution_config` draft + the atomic
// `saveConfig` seam now live in ./settingsTabs (SettingsBody), so this panel and
// the routed desktop SettingsDesktop page render the SAME settings logic with the
// SAME real save paths (useUpdateEmployerProfile / saveConfig / changePassword) —
// a single source of truth, no drift. This file is the thin mobile wrapper: panel
// chrome + local `tab` state + the cross-panel "open on tab X" pub/sub.
//
// This component never imports `employerSeed` / `mockData`; all company data
// arrives through the employer hooks, and scope (`employerId`) via the
// EmployerScopeContext the shell wraps every panel in.

import { useState, useEffect } from 'react';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { useEmployer } from '../../hooks/useEmployer';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { SettingsBody } from './settingsTabs';
import styles from './EmployerSettings.module.css';

const TABS = [
  { key: 'profile', label: 'Company profile' },
  { key: 'pension', label: 'Pension contribution' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'password', label: 'Password' },
];

// Cross-panel signal: a sibling panel (e.g. InsuranceBenefits' "Manage cover")
// can request that Settings open on a specific tab. The shared
// `EmployerPanelContext` only exposes a single `settingsOpen` boolean and isn't
// owned here, so this minimal module-scoped pub/sub carries the desired initial
// tab alongside the open flag without widening the context surface.
let pendingSettingsTab = null;
const settingsTabListeners = new Set();

export function requestSettingsTab(tabKey) {
  pendingSettingsTab = tabKey;
  settingsTabListeners.forEach((fn) => fn(tabKey));
}

export default function EmployerSettings({ splitMode = false }) {
  const { settingsOpen, setSettingsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();

  const {
    data: employer,
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployer(employerId);

  // Seed the initial tab from any cross-panel request already pending at mount
  // (e.g. InsuranceBenefits' "Manage cover" deep-links to the insurance tab and
  // sets `pendingSettingsTab` before `settingsOpen` flips true). Reading it in
  // the lazy initializer honours the deep-link on the first render WITHOUT a
  // setState inside an effect (react-hooks/set-state-in-effect).
  const [tab, setTab] = useState(() => pendingSettingsTab || 'profile');

  // Honour cross-panel "open on tab X" requests, and clear the one consumed at
  // mount. The effect body does no synchronous setState; the listener fires
  // from a sibling panel event, not during this effect.
  useEffect(() => {
    pendingSettingsTab = null;
    const listener = (tabKey) => {
      setTab(tabKey);
      pendingSettingsTab = null;
    };
    settingsTabListeners.add(listener);
    return () => settingsTabListeners.delete(listener);
  }, []);

  // Reset to the first tab a moment after the panel closes so re-opening
  // starts clean (matches the sibling panels' close-reset idiom). A pending
  // tab request (set as the panel re-opens) wins over the reset.
  useEffect(() => {
    if (settingsOpen) return undefined;
    const t = setTimeout(() => {
      if (!pendingSettingsTab) setTab('profile');
    }, 400);
    return () => clearTimeout(t);
  }, [settingsOpen]);

  const isCold = isLoading && !employer;

  return (
    <EmployerSlidePanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="Settings"
      eyebrow="Employer"
      width={480}
      splitMode={splitMode}
    >
      <div
        className={styles.tablist}
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`emp-settings-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`emp-settings-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={styles.tab}
            data-active={tab === t.key || undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isCold ? (
        <SkeletonRow count={5} label="Loading company settings" />
      ) : isError ? (
        <ErrorCard
          title="We couldn't load your company settings"
          message={error}
          onRetry={refetch}
        />
      ) : (
        <SettingsBody
          tab={tab}
          settingsOpen={settingsOpen}
          employer={employer}
          employerId={employerId}
          addToast={addToast}
          render={({ tab: activeTab, tabs }) => (
            <>
              {TABS.map((t) => (
                <div
                  key={t.key}
                  role="tabpanel"
                  id={`emp-settings-panel-${t.key}`}
                  aria-labelledby={`emp-settings-tab-${t.key}`}
                  hidden={activeTab !== t.key}
                >
                  {activeTab === t.key && tabs[t.key]}
                </div>
              ))}
            </>
          )}
        />
      )}
    </EmployerSlidePanel>
  );
}
