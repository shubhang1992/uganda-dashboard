import { useSearchParams } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import { SettingsBody } from '../settings/settingsTabs';
import s from './employerMobile.module.css';

const TABS = [
  { key: 'profile', label: 'Company' },
  { key: 'pension', label: 'Pension' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'password', label: 'Password' },
];

/**
 * SettingsMobile — the Settings page on the phone. Drives the SHARED SettingsBody
 * (the same render-prop component SettingsDesktop uses), so the real save paths
 * (useUpdateEmployerProfile / atomic saveConfig / changePassword) are shared, not
 * stubbed. A segmented tab strip switches sections; the Insurance "Manage cover"
 * deep-link lands here via ?tab=insurance.
 */
export default function SettingsMobile() {
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab');
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab : 'profile';
  const setTab = (key) => setParams(key === 'profile' ? {} : { tab: key }, { replace: true });

  const { data: employer, isLoading, isError, error, refetch } = useEmployer(employerId);
  const isCold = isLoading && !employer;

  return (
    <div className={s.page}>
      <div className={s.seg} role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={s.segBtn}
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
        <ErrorCard title="We couldn't load your company settings" message={error} onRetry={refetch} />
      ) : (
        <div className={s.card}>
          <SettingsBody
            tab={tab}
            settingsOpen
            employer={employer}
            employerId={employerId}
            addToast={addToast}
            render={({ tab: activeTab, tabs }) => (
              <div role="tabpanel">{tabs[activeTab]}</div>
            )}
          />
        </div>
      )}
    </div>
  );
}
