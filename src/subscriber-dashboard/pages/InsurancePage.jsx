import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact } from '../../utils/finance';
import { useCurrentSubscriber, useUpdateInsuranceCover } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import styles from './InsurancePage.module.css';

const COVER_TIERS = [
  { cover: 1_000_000, premium: 2000 },
  { cover: 2_000_000, premium: 3500 },
  { cover: 3_000_000, premium: 5000 },
  { cover: 5_000_000, premium: 7500 },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InsurancePage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateCover = useUpdateInsuranceCover(sub?.id);

  const insurance = sub?.insurance;
  const insNominees = sub?.nominees?.insurance || [];
  const noPolicy = !insurance || insurance.status !== 'active';

  const [coverIdx, setCoverIdx] = useState(() => {
    const found = COVER_TIERS.findIndex((t) => t.cover === insurance?.cover);
    return found >= 0 ? found : 0;
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!insurance?.cover) return;
    const found = COVER_TIERS.findIndex((t) => t.cover === insurance.cover);
    setCoverIdx(found >= 0 ? found : 0);
  }, [insurance?.cover]);

  const selectedTier = COVER_TIERS[coverIdx];
  const tierIsUpgrade = selectedTier.cover > (insurance?.cover || 0);

  async function handleUpgradeCover() {
    if (!sub || !tierIsUpgrade) return;
    setSubmitting(true);
    try {
      await updateCover.mutateAsync({
        cover: selectedTier.cover,
        premiumMonthly: selectedTier.premium,
      });
      addToast('success', `Cover upgraded to ${formatUGX(selectedTier.cover)}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Insurance cover" subtitle="Premium and policy level" />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {noPolicy ? (
            <section className={styles.emptyCoverCard}>
              <div className={styles.shieldIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                  <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                  <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className={styles.emptyTitle}>No active policy</h2>
              <p className={styles.emptyText}>
                Add life cover from <strong>UGX 2,000 / mo</strong>. You&apos;ll be covered up to UGX 1M.
              </p>
            </section>
          ) : (
            <section className={styles.coverCard}>
              <span className={styles.coverEyebrow}>Current cover</span>
              <div className={styles.coverValue}>{formatUGX(insurance.cover)}</div>
              <div className={styles.coverMeta}>
                <div className={styles.coverMetaItem}>
                  <span className={styles.coverMetaLabel}>Premium</span>
                  <span className={styles.coverMetaValue}>{formatUGXExact(insurance.premiumMonthly)} / mo</span>
                </div>
                <div className={styles.coverMetaItem}>
                  <span className={styles.coverMetaLabel}>Started</span>
                  <span className={styles.coverMetaValue}>{formatDate(insurance.policyStart)}</span>
                </div>
                <div className={styles.coverMetaItem}>
                  <span className={styles.coverMetaLabel}>Renewal</span>
                  <span className={styles.coverMetaValue}>{formatDate(insurance.renewalDate)}</span>
                </div>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{noPolicy ? 'Pick your cover' : 'Upgrade your cover'}</h2>
            </div>

            <div className={styles.tierHead}>
              <div>
                <span className={styles.tierEyebrow}>Cover</span>
                <span className={styles.tierValue}>{formatUGX(selectedTier.cover)}</span>
              </div>
              <div className={styles.tierPremium}>
                <span className={styles.tierEyebrow}>Premium</span>
                <span className={styles.tierValue}>{formatUGXExact(selectedTier.premium)} / mo</span>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={COVER_TIERS.length - 1}
              step={1}
              value={coverIdx}
              onChange={(e) => setCoverIdx(Number.parseInt(e.target.value, 10))}
              className={styles.slider}
              style={{ '--pct': `${(coverIdx / (COVER_TIERS.length - 1)) * 100}%` }}
              aria-label="Cover tier"
            />

            <div className={styles.tierMarks}>
              {COVER_TIERS.map((tier, i) => (
                <button
                  key={tier.cover}
                  type="button"
                  className={styles.tierMark}
                  data-active={i === coverIdx}
                  onClick={() => setCoverIdx(i)}
                >
                  {formatUGX(tier.cover)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!tierIsUpgrade || submitting}
              onClick={handleUpgradeCover}
            >
              {submitting ? 'Updating…'
                : tierIsUpgrade ? `Upgrade to ${formatUGX(selectedTier.cover)}`
                : noPolicy ? 'Pick a cover above'
                : 'Current cover'}
            </button>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Insurance beneficiaries</h2>
              <span className={styles.sectionAside}>{insNominees.length} on file</span>
            </div>
            <p className={styles.sectionHelp}>
              These people receive your life insurance benefit. Shares must total 100%.
            </p>
            {insNominees.length > 0 && (
              <ul className={styles.beneList}>
                {insNominees.slice(0, 3).map((n) => (
                  <li key={n.id} className={styles.beneRow}>
                    <span className={styles.beneAvatar}>
                      {(n.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <div className={styles.beneText}>
                      <span className={styles.beneName}>{n.name}</span>
                      <span className={styles.beneMeta}>
                        {n.relationship ? n.relationship[0].toUpperCase() + n.relationship.slice(1) : ''}
                        {n.phone && <> · {n.phone}</>}
                      </span>
                    </div>
                    <span className={styles.beneShare}>{n.share}%</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={styles.linkBtn} onClick={() => navigate('/dashboard/settings/nominees')}>
              Manage beneficiaries
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </section>

          <button type="button" className={styles.fileClaimBtn} onClick={() => navigate('/dashboard/withdraw/claim')}>
            File a claim
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
