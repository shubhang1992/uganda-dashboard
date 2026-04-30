import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber, useUpdateNominees } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import styles from './NomineesPage.module.css';

const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other'];
const MAX_NOMINEES = 5;
const UG_PREFIX = '+256';

function genId(tab) {
  return `nom-new-${tab}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function NomineeRow({ nominee, onChange, onRemove, canRemove, expanded, onToggle }) {
  function updateField(field, value) {
    onChange({ ...nominee, [field]: value });
  }
  function updatePhone(raw) {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 9);
    onChange({ ...nominee, phone: digits ? `${UG_PREFIX}${digits}` : '' });
  }
  const phoneDigits = (nominee.phone || '').replace(/^\+256/, '').replace(/\D/g, '');

  return (
    <li className={styles.row} data-expanded={expanded || undefined}>
      <button type="button" className={styles.rowHead} onClick={onToggle} aria-expanded={expanded}>
        <span className={styles.avatar} aria-hidden="true">
          {(nominee.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'}
        </span>
        <div className={styles.headText}>
          <span className={styles.headName}>{nominee.name || 'New nominee'}</span>
          <span className={styles.headMeta}>
            {nominee.relationship ? nominee.relationship[0].toUpperCase() + nominee.relationship.slice(1) : 'Relationship —'}
            {nominee.phone && <span className={styles.headDot} aria-hidden="true">·</span>}
            {nominee.phone && <span>{nominee.phone}</span>}
          </span>
        </div>
        <span className={styles.headShare}>{nominee.share ?? 0}%</span>
        <svg aria-hidden="true" className={styles.chevron} data-open={expanded} viewBox="0 0 12 12" width="12" height="12" fill="none">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className={styles.rowBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
          >
            <div className={styles.rowBodyInner}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Full name</span>
                <input
                  type="text"
                  className={styles.input}
                  value={nominee.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Full legal name"
                  autoComplete="name"
                />
              </label>

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Relationship</span>
                  <select
                    className={styles.select}
                    value={nominee.relationship || ''}
                    onChange={(e) => updateField('relationship', e.target.value)}
                  >
                    <option value="" disabled>Select…</option>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Share</span>
                  <div className={styles.shareInput}>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      className={styles.input}
                      value={nominee.share ?? ''}
                      onChange={(e) => updateField('share', Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))))}
                    />
                    <span className={styles.sharePct}>%</span>
                  </div>
                </label>
              </div>

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <div className={styles.phoneInput}>
                    <span className={styles.phonePrefix}>{UG_PREFIX}</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      className={`${styles.input} ${styles.phoneFlex}`}
                      value={phoneDigits}
                      onChange={(e) => updatePhone(e.target.value)}
                      placeholder="7X XXX XXXX"
                      maxLength={9}
                      autoComplete="tel-national"
                    />
                  </div>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>NIN</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={nominee.nin || ''}
                    onChange={(e) => updateField('nin', e.target.value.toUpperCase())}
                    placeholder="CM12345678"
                    spellCheck={false}
                    maxLength={14}
                  />
                </label>
              </div>

              <button
                type="button"
                className={styles.removeBtn}
                onClick={onRemove}
                disabled={!canRemove}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Remove nominee
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function NomineesPage() {
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateNominees = useUpdateNominees(sub?.id);

  const [tab, setTab] = useState('pension');
  const [pensionList, setPensionList] = useState([]);
  const [insuranceList, setInsuranceList] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sub) return;
    setPensionList(sub.nominees?.pension?.map((n) => ({ ...n })) ?? []);
    setInsuranceList(sub.nominees?.insurance?.map((n) => ({ ...n })) ?? []);
  }, [sub]);

  const currentList = tab === 'pension' ? pensionList : insuranceList;
  const setCurrentList = tab === 'pension' ? setPensionList : setInsuranceList;

  const totalShare = useMemo(() => currentList.reduce((s, n) => s + (Number(n.share) || 0), 0), [currentList]);
  const shareValid = totalShare === 100;
  const fieldsValid = useMemo(
    () => currentList.every((n) => n.name?.trim() && n.relationship && (n.phone?.replace(/\D/g, '').length >= 11)),
    [currentList],
  );

  const originalList = tab === 'pension' ? sub?.nominees?.pension : sub?.nominees?.insurance;
  const dirty = useMemo(() => {
    if (!originalList) return currentList.length > 0;
    if (originalList.length !== currentList.length) return true;
    return originalList.some((o, i) => {
      const c = currentList[i];
      if (!c) return true;
      return o.name !== c.name || o.relationship !== c.relationship || o.phone !== c.phone || o.share !== c.share || o.nin !== c.nin;
    });
  }, [originalList, currentList]);

  function updateOne(next) {
    setCurrentList((prev) => prev.map((n) => (n.id === next.id ? next : n)));
  }

  function addNominee() {
    if (currentList.length >= MAX_NOMINEES) return;
    const id = genId(tab);
    const defaultShare = currentList.length === 0 ? 100 : Math.max(1, Math.floor(100 - totalShare));
    const next = {
      id,
      name: '',
      relationship: '',
      phone: '',
      nin: '',
      share: defaultShare,
    };
    setCurrentList((prev) => [...prev, next]);
    setExpandedId(id);
  }

  function removeOne(id) {
    setCurrentList((prev) => prev.filter((n) => n.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function autoBalance() {
    if (currentList.length === 0) return;
    const per = Math.floor(100 / currentList.length);
    const remainder = 100 - per * currentList.length;
    setCurrentList((prev) =>
      prev.map((n, i) => ({ ...n, share: i === 0 ? per + remainder : per })),
    );
  }

  async function handleSave() {
    if (!shareValid || !fieldsValid || !dirty || !sub) return;
    setSubmitting(true);
    try {
      await updateNominees.mutateAsync({
        pension: tab === 'pension' ? pensionList : undefined,
        insurance: tab === 'insurance' ? insuranceList : undefined,
      });
      addToast('success', 'Nominees updated.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Nominees"
        subtitle="Who inherits your savings if anything happens"
      />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pension'}
              className={styles.tab}
              data-active={tab === 'pension'}
              onClick={() => setTab('pension')}
            >
              Pension
              <span className={styles.tabCount}>{pensionList.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'insurance'}
              className={styles.tab}
              data-active={tab === 'insurance'}
              onClick={() => setTab('insurance')}
            >
              Insurance
              <span className={styles.tabCount}>{insuranceList.length}</span>
            </button>
          </div>

          <div className={styles.shareBanner} data-valid={shareValid || undefined}>
            <div className={styles.shareBannerText}>
              <span className={styles.shareBannerLabel}>Total share</span>
              <span className={styles.shareBannerValue}>{totalShare}%</span>
            </div>
            <div className={styles.shareBar}>
              <span className={styles.shareFill} style={{ width: `${Math.min(100, totalShare)}%` }} />
            </div>
            {!shareValid && currentList.length > 0 && (
              <button type="button" className={styles.balanceBtn} onClick={autoBalance}>
                Balance
              </button>
            )}
            {shareValid && (
              <span className={styles.shareBannerOk}>
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                Balanced
              </span>
            )}
          </div>

          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {currentList.map((n) => (
                <NomineeRow
                  key={n.id}
                  nominee={n}
                  onChange={updateOne}
                  onRemove={() => removeOne(n.id)}
                  canRemove={currentList.length > 1}
                  expanded={expandedId === n.id}
                  onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)}
                />
              ))}
            </AnimatePresence>
            {currentList.length === 0 && (
              <li className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M3 20v-1a5 5 0 0110 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
                <span className={styles.emptyTitle}>No {tab} nominees yet</span>
                <span className={styles.emptyText}>Add at least one person to receive your {tab} balance.</span>
              </li>
            )}
          </ul>

          <button
            type="button"
            className={styles.addBtn}
            onClick={addNominee}
            disabled={currentList.length >= MAX_NOMINEES}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
            Add nominee
            {currentList.length >= MAX_NOMINEES && <span className={styles.addBtnNote}>(max {MAX_NOMINEES})</span>}
          </button>
        </motion.div>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!shareValid || !fieldsValid || !dirty || submitting}
          onClick={handleSave}
        >
          {submitting ? 'Saving…' : dirty ? 'Save changes' : 'No changes to save'}
        </button>
      </footer>
    </div>
  );
}
