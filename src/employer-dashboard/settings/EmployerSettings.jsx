// Settings panel (Phase 8) — the real employer settings surface. Four tabs
// inside the shared `EmployerSlidePanel` chrome (width 480), switched by a
// local `tab` state with full ARIA tab semantics (tablist / tab / tabpanel):
//
//   'profile'   — company profile editor (name, sector, registration, contact,
//                 district, payroll cadence). Pre-filled from `useEmployer`.
//                 Save → `useUpdateEmployerProfile(employerId).mutate(patch)`
//                 with the camelCase profile keys the 0035 RPC honours.
//   'pension'   — the company-level DEFAULT contribution config (the template a
//                 new run starts from). Mode + employer % + employee %, plus the
//                 shared <GroupInsuranceFieldset>. Save → `saveConfig(...)`.
//   'insurance' — group life cover, the same <GroupInsuranceFieldset> bound to
//                 the SAME draft as the pension tab + the live exposure summary.
//                 Save → `saveConfig(...)`.
//   'password'  — current + new + confirm → `changePassword(current, next)`
//                 (real signed JWT). Mirrors the dashboard Settings password
//                 form: client shape check, AuthError-aware error routing,
//                 clear-on-success, toast on auth failure.
//
// The Pension and Insurance tabs share ONE `default_contribution_config` draft
// (lifted to the `SettingsBody` level) so editing funding mode on one tab and
// group cover on the other never clobber each other — a single source of truth.
//
// This component never imports `employerSeed` / `mockData`; all company data
// arrives through the employer hooks, and scope (`employerId`) via the
// EmployerScopeContext the shell wraps every panel in.

import { useState, useEffect, useMemo } from 'react';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  useEmployer,
  useEmployees,
  useUpdateEmployerProfile,
} from '../../hooks/useEmployer';
import { changePassword, AuthError } from '../../services/auth';
import { formatUGX, formatNumber } from '../../utils/currency';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import GroupInsuranceFieldset from './GroupInsuranceFieldset';
import styles from './EmployerSettings.module.css';

const round = (n) => Math.round(n);

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

const SECTOR_OPTIONS = [
  'Agriculture',
  'Construction',
  'Education',
  'Financial Services',
  'Healthcare',
  'Hospitality',
  'Manufacturing',
  'Mining',
  'Retail',
  'Technology',
  'Telecommunications',
  'Transport & Logistics',
  'Other',
];

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        />
      )}
    </EmployerSlidePanel>
  );
}

// =============================================================================
// Settings body — owns the SHARED contribution-config draft so the Pension and
// Insurance tabs are a single source of truth, and exposes the one `saveConfig`
// seam (insurance-tab + pension-tab config save) that C4 will replace with a
// single atomic RPC.
// =============================================================================

function SettingsBody({ tab, settingsOpen, employer, employerId, addToast }) {
  const updateProfile = useUpdateEmployerProfile(employerId);

  // Dual-read seed: prefer the NEW keys (matchPct / maxContribution /
  // groupCoverAmount) and fall back to the legacy %-pair so an un-migrated
  // config still populates sensibly. Blank UGX fields stay '' (= no cap / no
  // cover) so the inputs render empty rather than "0". `insuranceEnabled` /
  // `groupCoverAmount` are part of this single draft so the Pension and
  // Insurance tabs edit the SAME state.
  const initial = useMemo(() => {
    const cfg = employer?.defaultContributionConfig ?? {};
    const coverRaw = cfg.groupCoverAmount;
    return {
      mode: cfg.mode ?? 'co-contribution',
      matchPct: cfg.matchPct ?? 50,
      maxContribution: cfg.maxContribution ?? '',
      // Employer-only is now a FIXED monthly amount per member (members are
      // subscribers with no salary) — Issue 2 / unified model.
      employerAmount: cfg.employerAmount ?? 50000,
      // Group insurance is a company-wide TRUE/FALSE config, independent of
      // funding mode. Back-compat: an un-migrated config with a positive cover
      // is treated as enabled so existing employers keep their cover.
      insuranceEnabled: cfg.insuranceEnabled ?? (Number(coverRaw) > 0),
      groupCoverAmount: coverRaw ?? '',
    };
  }, [employer]);

  const [draft, setDraft] = useState(initial);
  const [err, setErr] = useState('');

  // Re-seed when the cached config changes identity (post-save refetch). Same
  // render-time adjustment pattern as the profile tab — no setState-in-effect.
  const [seededFrom, setSeededFrom] = useState(initial);
  if (seededFrom !== initial) {
    setSeededFrom(initial);
    setDraft(initial);
    setErr('');
  }

  // === saveConfig — THE config-save seam ===================================
  // ATOMIC (audit §7d-3, migration 0056): persists `default_contribution_config`
  // (incl. the insurance keys) AND applies the group cover to every staff member
  // in ONE `update_employer_profile` transaction — the insurance fields ride
  // along on the same mutate call (no separate `applyGroupInsurance` step, so a
  // partial failure can no longer desync the config from `insurance_policies`).
  // Shared by the Pension AND Insurance tabs (NOT the profile-tab handleSave) so
  // both save the same draft.
  function saveConfig(e) {
    e.preventDefault();
    if (updateProfile.isPending) return;

    const isCo = draft.mode === 'co-contribution';

    // Group insurance is a company-wide TRUE/FALSE config, independent of the
    // funding mode: either every member gets the flat group cover or none do.
    const insuranceEnabled = !!draft.insuranceEnabled;
    const cover = insuranceEnabled
      ? (draft.groupCoverAmount === '' ? null : Number(draft.groupCoverAmount))
      : null;
    if (insuranceEnabled && !(cover > 0)) {
      setErr('Enter a cover amount greater than 0, or turn group insurance off.');
      return;
    }

    // Build the mode-specific config; the insurance fields ride along on both
    // modes so the company-wide setting is persisted either way.
    let defaultContributionConfig;
    if (isCo) {
      const matchPct = Number(draft.matchPct);
      const maxContribution =
        draft.maxContribution === '' ? null : Number(draft.maxContribution);
      if (!(matchPct >= 0 && matchPct <= 100)) {
        setErr('Match % must be between 0 and 100.');
        return;
      }
      if (maxContribution != null && !(maxContribution >= 0)) {
        setErr('Maximum contribution must be 0 or more (or blank for no cap).');
        return;
      }
      defaultContributionConfig = {
        mode: 'co-contribution',
        matchPct,
        maxContribution,
        insuranceEnabled,
        groupCoverAmount: cover,
      };
    } else {
      const employerAmount = Number(draft.employerAmount);
      if (!(employerAmount >= 0) || !Number.isFinite(employerAmount)) {
        setErr('Amount per member must be 0 or more.');
        return;
      }
      defaultContributionConfig = {
        mode: 'employer-only',
        employerAmount,
        insuranceEnabled,
        groupCoverAmount: cover,
      };
    }
    setErr('');

    // ONE atomic call: the config patch + the roster-wide group cover commit in
    // the same `update_employer_profile` transaction. `insuranceEnabled` +
    // `groupCover` ride along on the patch; the service forwards them as
    // p_insurance_enabled / p_group_cover. enabled → flat cover for everyone,
    // disabled → cleared (cover null/0). No second RPC, so no config↔policy desync.
    updateProfile.mutate(
      { defaultContributionConfig, insuranceEnabled, groupCover: cover },
      {
        onSuccess: () => addToast(
          'success',
          insuranceEnabled
            ? 'Settings saved — group cover applied to all staff.'
            : 'Settings saved — group cover removed for all staff.',
        ),
        onError: (e2) => addToast('error', e2?.message || 'Could not save settings.'),
      },
    );
  }

  const saving = updateProfile.isPending;

  // The Pension and Insurance tabs share the lifted insurance handlers so the
  // <GroupInsuranceFieldset> is a single source of truth across both.
  const setInsuranceEnabled = (on) => {
    setDraft((d) => ({ ...d, insuranceEnabled: on }));
    if (err) setErr('');
  };
  const setGroupCover = (value) => {
    setDraft((d) => ({ ...d, groupCoverAmount: value }));
    if (err) setErr('');
  };

  return (
    <>
      <div
        role="tabpanel"
        id="emp-settings-panel-profile"
        aria-labelledby="emp-settings-tab-profile"
        hidden={tab !== 'profile'}
      >
        {tab === 'profile' && (
          <ProfileTab
            employer={employer}
            employerId={employerId}
            addToast={addToast}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="emp-settings-panel-pension"
        aria-labelledby="emp-settings-tab-pension"
        hidden={tab !== 'pension'}
      >
        {tab === 'pension' && (
          <PensionContributionTab
            draft={draft}
            setDraft={setDraft}
            err={err}
            setErr={setErr}
            saving={saving}
            saveConfig={saveConfig}
            setInsuranceEnabled={setInsuranceEnabled}
            setGroupCover={setGroupCover}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="emp-settings-panel-insurance"
        aria-labelledby="emp-settings-tab-insurance"
        hidden={tab !== 'insurance'}
      >
        {tab === 'insurance' && (
          <InsuranceTab
            employerId={employerId}
            draft={draft}
            err={err}
            saving={saving}
            saveConfig={saveConfig}
            setInsuranceEnabled={setInsuranceEnabled}
            setGroupCover={setGroupCover}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="emp-settings-panel-password"
        aria-labelledby="emp-settings-tab-password"
        hidden={tab !== 'password'}
      >
        {tab === 'password' && <PasswordTab open={settingsOpen} addToast={addToast} />}
      </div>
    </>
  );
}

// =============================================================================
// Tab 1 — Company profile
// =============================================================================

function ProfileTab({ employer, employerId, addToast }) {
  const updateProfile = useUpdateEmployerProfile(employerId);

  // Draft mirrors the editable profile fields. Seeded once from the loaded
  // employer; re-syncs whenever the cached record changes (e.g. after a save
  // invalidates + refetches).
  const initial = useMemo(
    () => ({
      name: employer?.name ?? '',
      sector: employer?.sector ?? '',
      registrationNo: employer?.registrationNo ?? '',
      contactName: employer?.contactName ?? '',
      contactPhone: employer?.contactPhone ?? '',
      contactEmail: employer?.contactEmail ?? '',
      district: employer?.district ?? '',
      payrollCadence: employer?.payrollCadence ?? 'monthly',
    }),
    [employer],
  );

  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState({});

  // Re-seed the draft when the underlying record changes identity (e.g. after a
  // save invalidates + refetches). React-recommended "adjust state during
  // render" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // — avoids the cascading-render lint rule that bans setState in an effect.
  const [seededFrom, setSeededFrom] = useState(initial);
  if (seededFrom !== initial) {
    setSeededFrom(initial);
    setDraft(initial);
    setErrors({});
  }

  function setField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  }

  function handleSave(e) {
    e.preventDefault();
    if (updateProfile.isPending) return;

    const next = {};
    if (!draft.name.trim()) next.name = 'Company name is required.';
    if (draft.contactEmail.trim() && !EMAIL_RE.test(draft.contactEmail.trim())) {
      next.contactEmail = 'Enter a valid email address.';
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});

    // Send exactly the camelCase profile keys the 0035 `update_employer_profile`
    // RPC reads. Strings are trimmed; the config tab owns defaultContributionConfig.
    const patch = {
      name: draft.name.trim(),
      sector: draft.sector,
      registrationNo: draft.registrationNo.trim(),
      contactName: draft.contactName.trim(),
      contactPhone: draft.contactPhone.trim(),
      contactEmail: draft.contactEmail.trim(),
      district: draft.district.trim(),
      payrollCadence: draft.payrollCadence,
    };

    updateProfile.mutate(patch, {
      onSuccess: () => addToast('success', 'Company profile updated.'),
      onError: (err) => addToast('error', err?.message || 'Could not update profile.'),
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSave} noValidate>
      <p className={styles.intro}>
        Your company details. These appear on reports and identify your account.
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-name">
          Company name <span className={styles.req}>*</span>
        </label>
        <input
          id="emp-name"
          className={styles.input}
          type="text"
          value={draft.name}
          onChange={(e) => setField('name', e.target.value)}
          placeholder="e.g. Nile Breweries Ltd"
          data-error={!!errors.name || undefined}
          autoComplete="organization"
        />
        {errors.name && <p className={styles.error} role="alert">{errors.name}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-sector">Sector</label>
        <select
          id="emp-sector"
          className={styles.select}
          value={draft.sector}
          onChange={(e) => setField('sector', e.target.value)}
        >
          <option value="">Select a sector…</option>
          {SECTOR_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-reg">Registration number</label>
        <input
          id="emp-reg"
          className={styles.input}
          type="text"
          value={draft.registrationNo}
          onChange={(e) => setField('registrationNo', e.target.value)}
          placeholder="e.g. UG-REG-2019-04412"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-district">District</label>
        <input
          id="emp-district"
          className={styles.input}
          type="text"
          value={draft.district}
          onChange={(e) => setField('district', e.target.value)}
          placeholder="e.g. Kampala"
          autoComplete="address-level2"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-cadence">Payroll cadence</label>
        <select
          id="emp-cadence"
          className={styles.select}
          value={draft.payrollCadence}
          onChange={(e) => setField('payrollCadence', e.target.value)}
        >
          {CADENCE_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.divider} />

      <h3 className={styles.sectionTitle}>Primary contact</h3>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-contact-name">Contact name</label>
        <input
          id="emp-contact-name"
          className={styles.input}
          type="text"
          value={draft.contactName}
          onChange={(e) => setField('contactName', e.target.value)}
          placeholder="e.g. Patience Namaganda"
          autoComplete="name"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-contact-phone">Contact phone</label>
        <input
          id="emp-contact-phone"
          className={styles.input}
          type="tel"
          value={draft.contactPhone}
          onChange={(e) => setField('contactPhone', e.target.value)}
          placeholder="+256 7XX XXX XXX"
          autoComplete="tel"
          spellCheck={false}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-contact-email">Contact email</label>
        <input
          id="emp-contact-email"
          className={styles.input}
          type="email"
          value={draft.contactEmail}
          onChange={(e) => setField('contactEmail', e.target.value)}
          placeholder="hr@company.com"
          data-error={!!errors.contactEmail || undefined}
          autoComplete="email"
          spellCheck={false}
        />
        {errors.contactEmail && (
          <p className={styles.error} role="alert">{errors.contactEmail}</p>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Tab 2 — Pension contribution (the company-wide funding template a run starts
// from) + the shared group-insurance fieldset. The draft + saveConfig seam are
// owned by SettingsBody; this tab is presentational over the funding-mode slice.
// =============================================================================

function PensionContributionTab({
  draft,
  setDraft,
  err,
  setErr,
  saving,
  saveConfig,
  setInsuranceEnabled,
  setGroupCover,
}) {
  const isCo = draft.mode === 'co-contribution';

  // Illustrative previews — display-only; runs re-derive per member.
  //  • Co mode reads off an EXAMPLE member monthly saving (the match base).
  //  • Employer-only is a fixed monthly amount per member.
  const EXAMPLE_MONTHLY = 100000;
  const coPreview = useMemo(() => {
    const capSet = draft.maxContribution !== '' && draft.maxContribution != null;
    const uncapped = round(EXAMPLE_MONTHLY * (Number(draft.matchPct) || 0) / 100);
    const match = capSet ? Math.min(uncapped, round(Number(draft.maxContribution))) : uncapped;
    return { match, capped: capSet && uncapped > match };
  }, [draft.matchPct, draft.maxContribution]);

  return (
    <form className={styles.form} onSubmit={saveConfig} noValidate>
      <p className={styles.intro}>
        This is the single company-wide funding model — it applies to{' '}
        <strong>all</strong> members. Every contribution run uses these settings
        for everyone; it cannot be changed per member.
      </p>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Funding mode</legend>
        <div className={styles.radioRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="emp-default-mode"
              checked={draft.mode === 'employer-only'}
              onChange={() => { setDraft((d) => ({ ...d, mode: 'employer-only' })); if (err) setErr(''); }}
            />
            Employer-only
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="emp-default-mode"
              checked={draft.mode === 'co-contribution'}
              onChange={() => { setDraft((d) => ({ ...d, mode: 'co-contribution' })); if (err) setErr(''); }}
            />
            Co-contribution
          </label>
        </div>
      </fieldset>

      {isCo ? (
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-default-match">Match %</label>
            <input
              id="emp-default-match"
              className={styles.input}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={draft.matchPct}
              onChange={(e) => {
                setDraft((d) => ({ ...d, matchPct: e.target.value }));
                if (err) setErr('');
              }}
            />
            <span className={styles.hint}>
              You match this % of each employee&apos;s own monthly contribution.
            </span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-default-max">Maximum contribution (UGX)</label>
            <input
              id="emp-default-max"
              className={styles.input}
              type="number"
              min="0"
              step="1000"
              value={draft.maxContribution}
              placeholder="No cap"
              onChange={(e) => {
                setDraft((d) => ({ ...d, maxContribution: e.target.value }));
                if (err) setErr('');
              }}
            />
            <span className={styles.hint}>Optional — caps the employer top-up per employee.</span>
          </div>
        </div>
      ) : (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="emp-default-er">Amount per member / month (UGX)</label>
          <input
            id="emp-default-er"
            className={styles.input}
            type="number"
            min="0"
            step="1000"
            value={draft.employerAmount}
            onChange={(e) => {
              setDraft((d) => ({ ...d, employerAmount: e.target.value }));
              if (err) setErr('');
            }}
          />
          <span className={styles.hint}>The employer contributes this fixed amount to each member every month.</span>
        </div>
      )}

      {isCo ? (
        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewLabel}>
            If an employee saves {formatUGX(EXAMPLE_MONTHLY, { compact: false })}/mo
          </span>
          <div className={styles.previewRow}>
            <span>You add: <strong>{formatUGX(coPreview.match, { compact: false })}</strong>{coPreview.capped ? ' (capped)' : ''}</span>
            <span>Total: <strong>{formatUGX(EXAMPLE_MONTHLY + coPreview.match, { compact: false })}</strong></span>
          </div>
        </div>
      ) : (
        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewLabel}>Each member, every month</span>
          <div className={styles.previewRow}>
            <span>You contribute: <strong>{formatUGX(Number(draft.employerAmount) || 0, { compact: false })}</strong></span>
          </div>
        </div>
      )}

      {/* Group insurance — a company-wide TRUE/FALSE config, independent of the
          funding mode above. Same <GroupInsuranceFieldset> rendered on the
          Insurance tab, bound to the SAME draft (single source of truth). */}
      <GroupInsuranceFieldset
        enabled={draft.insuranceEnabled}
        coverAmount={draft.groupCoverAmount}
        onToggle={setInsuranceEnabled}
        onCoverChange={setGroupCover}
      />

      {err && <p className={styles.error} role="alert">{err}</p>}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Tab 3 — Insurance. Primary <GroupInsuranceFieldset> (same draft as Pension) +
// the live company-wide exposure summary. Saves through the SAME saveConfig
// seam so config and policies stay consistent.
// =============================================================================

function InsuranceTab({
  employerId,
  draft,
  err,
  saving,
  saveConfig,
  setInsuranceEnabled,
  setGroupCover,
}) {
  const { data: employees = [] } = useEmployees(employerId);
  const headcount = employees.length;

  // Live exposure reflects the in-progress draft so the summary updates as the
  // employer edits cover before saving (mirrors the read-only panel's numbers).
  const enabled = !!draft.insuranceEnabled;
  const cover = Number(draft.groupCoverAmount) || 0;

  return (
    <form className={styles.form} onSubmit={saveConfig} noValidate>
      <p className={styles.intro}>
        Group life cover is company-wide and all-or-nothing — a single flat
        amount applies to <strong>every</strong> staff member, or no-one.
      </p>

      <GroupInsuranceFieldset
        enabled={draft.insuranceEnabled}
        coverAmount={draft.groupCoverAmount}
        onToggle={setInsuranceEnabled}
        onCoverChange={setGroupCover}
      />

      {/* Company-wide exposure summary — same numbers the read-only
          InsuranceBenefits panel shows, kept in sync with the draft. */}
      <div className={styles.preview} aria-live="polite">
        <span className={styles.previewLabel}>Company exposure</span>
        <div className={styles.previewRow}>
          <span>Staff covered: <strong>{enabled ? formatNumber(headcount) : '0'}</strong></span>
          <span>
            Total exposure:{' '}
            <strong>{enabled ? formatUGX(cover * headcount, { compact: false }) : '—'}</strong>
          </span>
        </div>
      </div>

      {err && <p className={styles.error} role="alert">{err}</p>}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Tab 4 — Password (real signed JWT via the auth endpoint)
// =============================================================================

function PasswordTab({ open, addToast }) {
  const { user, updateUser } = useAuth();
  const hasPassword = user?.hasPassword === true;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwErrors, setPwErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Clear fields + errors whenever the panel closes.
  useEffect(() => {
    if (open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setPwErrors({});
  }, [open]);

  function clearPwError(field) {
    if (pwErrors[field]) setPwErrors((prev) => ({ ...prev, [field]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    // Client-side shape check on newPassword (≥8 chars, ≥1 letter, ≥1 digit).
    // The server is still authoritative — this is just a faster failure path.
    const next = {};
    if (newPassword.length < 8) {
      next.newPassword = 'Password must be at least 8 characters.';
    } else if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      next.newPassword = 'Password must include a letter and a number.';
    }
    if (newPassword !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }
    if (Object.keys(next).length > 0) {
      setPwErrors(next);
      return;
    }

    setPwErrors({});
    setSubmitting(true);
    try {
      await changePassword(hasPassword ? currentPassword : '', newPassword);
      // Reflect the new state in AuthContext so the card re-renders into the
      // "Change password" variant immediately after an initial set.
      if (!hasPassword) updateUser({ hasPassword: true });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('success', hasPassword ? 'Password updated.' : 'Password set.');
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === 'current_password_invalid' || err.code === 'current_password_required') {
          setPwErrors({ currentPassword: err.message });
        } else if (
          err.code === 'password_too_short' ||
          err.code === 'password_too_weak' ||
          err.code === 'password_too_long' ||
          err.code === 'password_required'
        ) {
          setPwErrors({ newPassword: err.message });
        } else {
          addToast('error', err.message || 'Could not update password.');
        }
      } else {
        addToast('error', err?.message || 'Could not update password.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h3 className={styles.sectionTitle}>{hasPassword ? 'Change password' : 'Set password'}</h3>
      <p className={styles.intro}>
        {hasPassword
          ? 'Update the password you use to sign in.'
          : 'Set a password so you can sign in without a one-time code.'}
      </p>

      {hasPassword && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="emp-current-pw">Current password</label>
          <div className={styles.passwordWrap}>
            <input
              id="emp-current-pw"
              className={styles.input}
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); clearPwError('currentPassword'); }}
              autoComplete="current-password"
              spellCheck={false}
              data-error={!!pwErrors.currentPassword || undefined}
            />
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
              aria-pressed={showCurrent}
            >
              {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {pwErrors.currentPassword && (
            <p className={styles.error} role="alert">{pwErrors.currentPassword}</p>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-new-pw">New password</label>
        <div className={styles.passwordWrap}>
          <input
            id="emp-new-pw"
            className={styles.input}
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); clearPwError('newPassword'); }}
            autoComplete="new-password"
            spellCheck={false}
            data-error={!!pwErrors.newPassword || undefined}
          />
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? 'Hide password' : 'Show password'}
            aria-pressed={showNew}
          >
            {showNew ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <span className={styles.hint}>8+ characters with at least one letter and one number.</span>
        {pwErrors.newPassword && (
          <p className={styles.error} role="alert">{pwErrors.newPassword}</p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-confirm-pw">Confirm new password</label>
        <div className={styles.passwordWrap}>
          <input
            id="emp-confirm-pw"
            className={styles.input}
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); clearPwError('confirmPassword'); }}
            autoComplete="new-password"
            spellCheck={false}
            data-error={!!pwErrors.confirmPassword || undefined}
          />
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            aria-pressed={showConfirm}
          >
            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {pwErrors.confirmPassword && (
          <p className={styles.error} role="alert">{pwErrors.confirmPassword}</p>
        )}
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.primaryBtn} disabled={submitting}>
          {submitting ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
        </button>
      </div>
    </form>
  );
}

/* Eye icons for password show/hide toggles — same shapes as the dashboard
   Settings password form so the visual language stays consistent. */
function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.2 5.2A8.8 8.8 0 0 1 10 5c5 0 8 5 8 5a14.2 14.2 0 0 1-2.4 2.9M5.7 6.7C3.4 8.3 2 10 2 10s3 5 8 5a8.8 8.8 0 0 0 3.3-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 8.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
