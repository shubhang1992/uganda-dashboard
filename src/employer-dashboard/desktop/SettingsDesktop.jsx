// SettingsDesktop — the routed Settings page for the employer DESKTOP dashboard.
// Reuses the SAME tab bodies as the mobile EmployerSettings panel via the shared
// SettingsBody (src/employer-dashboard/settings/settingsTabs.jsx) — so the REAL
// save paths (useUpdateEmployerProfile / atomic saveConfig / changePassword) are
// shared, not stubbed. A tablist switches the active section; the Insurance
// "Manage cover" deep-link lands here via ?tab=insurance (useSearchParams).
// Pension + Insurance share one config draft inside SettingsBody, so editing the
// funding mode on one tab reflects on the other before save.

import { useSearchParams } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import { SettingsBody } from '../settings/settingsTabs';
import settingsStyles from '../settings/EmployerSettings.module.css';
import { PageHead, Card } from './ui';
import ui from './ui.module.css';

const TABS = [
  { key: 'profile', label: 'Company profile' },
  { key: 'pension', label: 'Pension contribution' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'password', label: 'Password' },
];

export default function SettingsDesktop() {
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab');
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab : 'profile';
  const setTab = (key) => setParams(key === 'profile' ? {} : { tab: key }, { replace: true });

  const { data: employer, isLoading, isError, error, refetch } = useEmployer(employerId);
  const isCold = isLoading && !employer;

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Manage"
        title="Settings"
        sub="Company profile, contribution model, and group insurance."
      />

      <Card>
        <div className={settingsStyles.tablist} role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`emp-settings-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`emp-settings-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className={settingsStyles.tab}
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
            settingsOpen
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
      </Card>
    </div>
  );
}
