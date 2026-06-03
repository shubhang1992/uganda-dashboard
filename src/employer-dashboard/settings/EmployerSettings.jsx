// Settings panel (Phase 8) — the real employer settings surface. Three tabs
// inside the shared `EmployerSlidePanel` chrome (width 480), switched by a
// local `tab` state with full ARIA tab semantics (tablist / tab / tabpanel):
//
//   'profile'  — company profile editor (name, sector, registration, contact,
//                district, payroll cadence). Pre-filled from `useEmployer`.
//                Save → `useUpdateEmployerProfile(employerId).mutate(patch)`
//                with the camelCase profile keys the 0035 RPC honours.
//   'config'   — the company-level DEFAULT contribution config (the template a
//                new run starts from). Mode + employer % + employee %. Save →
//                `useUpdateEmployerProfile(...).mutate({ defaultContributionConfig })`.
//   'password' — current + new + confirm → `changePassword(current, next)`
//                (real signed JWT). Mirrors the dashboard Settings password
//                form: client shape check, AuthError-aware error routing,
//                clear-on-success, toast on auth failure.
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
  useUpdateEmployerProfile,
  useApplyGroupInsurance,
} from '../../hooks/useEmployer';
import { changePassword, AuthError } from '../../services/auth';
import { formatUGX } from '../../utils/currency';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './EmployerSettings.module.css';

const round = (n) => Math.round(n);

const TABS = [
  { key: 'profile', label: 'Company profile' },
  { key: 'config', label: 'Default config' },
  { key: 'password', label: 'Password' },
];

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

  const [tab, setTab] = useState('profile');

  // Reset to the first tab a moment after the panel closes so re-opening
  // starts clean (matches the sibling panels' close-reset idiom).
  useEffect(() => {
    if (settingsOpen) return undefined;
    const t = setTimeout(() => setTab('profile'), 400);
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
            id="emp-settings-panel-config"
            aria-labelledby="emp-settings-tab-config"
            hidden={tab !== 'config'}
          >
            {tab === 'config' && (
              <DefaultConfigTab
                employer={employer}
                employerId={employerId}
                addToast={addToast}
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
      )}
    </EmployerSlidePanel>
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
// Tab 2 — Default contribution config (the template a new run starts from)
// =============================================================================

function DefaultConfigTab({ employer, employerId, addToast }) {
  const updateProfile = useUpdateEmployerProfile(employerId);
  const applyGroupInsurance = useApplyGroupInsurance(employerId);

  // Dual-read seed: prefer the NEW keys (matchPct / maxContribution /
  // groupCoverAmount) and fall back to the legacy %-pair so an un-migrated
  // config still populates sensibly. Blank UGX fields stay '' (= no cap / no
  // cover) so the inputs render empty rather than "0".
  const initial = useMemo(() => {
    const cfg = employer?.defaultContributionConfig ?? {};
    return {
      mode: cfg.mode ?? 'employer-only',
      matchPct: cfg.matchPct ?? 50,
      maxContribution: cfg.maxContribution ?? '',
      employerPct: cfg.employerPct ?? 8,
      groupCoverAmount: cfg.groupCoverAmount ?? '',
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

  const isCo = draft.mode === 'co-contribution';

  // Illustrative previews — display-only; runs re-derive per employee.
  //  • Co mode reads off an EXAMPLE employee monthly saving (the match base),
  //    NOT salary, so the "match of contribution" model reads concretely.
  //  • Employer-only stays salary-based since the % applies to salary.
  const EXAMPLE_MONTHLY = 100000;
  const SAMPLE_SALARY = 1000000;
  const coPreview = useMemo(() => {
    const capSet = draft.maxContribution !== '' && draft.maxContribution != null;
    const uncapped = round(EXAMPLE_MONTHLY * (Number(draft.matchPct) || 0) / 100);
    const match = capSet ? Math.min(uncapped, round(Number(draft.maxContribution))) : uncapped;
    return { match, capped: capSet && uncapped > match };
  }, [draft.matchPct, draft.maxContribution]);
  const erPreview = useMemo(
    () => round(SAMPLE_SALARY * (Number(draft.employerPct) || 0) / 100),
    [draft.employerPct],
  );

  function handleSave(e) {
    e.preventDefault();
    if (updateProfile.isPending) return;

    // Compute the optional UGX fields as number|null up front so the Phase 7
    // group-insurance activation can drop straight into this handler.
    const groupCoverAmount =
      draft.groupCoverAmount === '' ? null : Number(draft.groupCoverAmount);

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
      setErr('');

      const defaultContributionConfig = {
        mode: 'co-contribution',
        matchPct,
        maxContribution,
      };
      updateProfile.mutate(
        { defaultContributionConfig },
        {
          onSuccess: () => addToast('success', 'Default contribution config updated.'),
          onError: (e2) => addToast('error', e2?.message || 'Could not update default config.'),
        },
      );
      return;
    }

    // Employer-only.
    const employerPct = Number(draft.employerPct);
    if (!(employerPct >= 0 && employerPct <= 100)) {
      setErr('Employer % must be between 0 and 100.');
      return;
    }
    if (groupCoverAmount != null && !(groupCoverAmount >= 0)) {
      setErr('Group insurance cover must be 0 or more (or blank for none).');
      return;
    }
    setErr('');

    const defaultContributionConfig = {
      mode: 'employer-only',
      employerPct,
      groupCoverAmount,
    };
    // Phase 7: employer-only funding bundles group life cover. Save the profile
    // first; only if it succeeds AND a positive group cover was entered do we
    // activate the flat group cover across the whole roster (a null/blank/0
    // cover leaves per-employee insurance untouched). The roster mutation is
    // chained inside onSuccess so insurance is never applied against an
    // un-saved config.
    const hasGroupCover = groupCoverAmount != null && groupCoverAmount > 0;
    updateProfile.mutate(
      { defaultContributionConfig },
      {
        onSuccess: () => {
          addToast('success', 'Default contribution config updated.');
          if (hasGroupCover) {
            applyGroupInsurance.mutate(
              { cover: groupCoverAmount },
              {
                onSuccess: () => addToast('success', 'Group cover applied to all staff.'),
                onError: (e3) =>
                  addToast('error', e3?.message || 'Could not apply group cover to staff.'),
              },
            );
          }
        },
        onError: (e2) => addToast('error', e2?.message || 'Could not update default config.'),
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSave} noValidate>
      <p className={styles.intro}>
        The default a new contribution run starts from. It seeds the new-run
        wizard; you can still adjust any employee&apos;s own config individually.
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
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-default-er">Employer %</label>
            <input
              id="emp-default-er"
              className={styles.input}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={draft.employerPct}
              onChange={(e) => {
                setDraft((d) => ({ ...d, employerPct: e.target.value }));
                if (err) setErr('');
              }}
            />
            <span className={styles.hint}>Employer pays this % of each employee&apos;s salary.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-default-cover">Group insurance cover (UGX)</label>
            <input
              id="emp-default-cover"
              className={styles.input}
              type="number"
              min="0"
              step="1000"
              value={draft.groupCoverAmount}
              placeholder="No cover"
              onChange={(e) => {
                setDraft((d) => ({ ...d, groupCoverAmount: e.target.value }));
                if (err) setErr('');
              }}
            />
            <span className={styles.coverNote}>
              Employer-only includes group life cover for all staff.
            </span>
          </div>
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
          <span className={styles.previewLabel}>
            From a {formatUGX(SAMPLE_SALARY, { compact: false })} salary
          </span>
          <div className={styles.previewRow}>
            <span>You contribute {Number(draft.employerPct) || 0}%: <strong>{formatUGX(erPreview, { compact: false })}</strong></span>
            <span>
              Group cover: <strong>{draft.groupCoverAmount === '' ? '—' : formatUGX(Number(draft.groupCoverAmount), { compact: false })}</strong> per employee
            </span>
          </div>
        </div>
      )}

      {err && <p className={styles.error} role="alert">{err}</p>}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? 'Saving…' : 'Save default config'}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Tab 3 — Password (real signed JWT via the auth endpoint)
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
