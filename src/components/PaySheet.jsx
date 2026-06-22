import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/motion';
import { formatUGX } from '../utils/currency';
import { PillChip, PillChipGroup } from './PillChip';
import styles from './PaySheet.module.css';

// Mobile-money methods, matching the Save / Policies flows.
const DEFAULT_METHODS = [
  { id: 'mtn', label: 'MTN MoMo', full: 'MTN Mobile Money', helper: '+256 71 100 0001' },
  { id: 'airtel', label: 'Airtel Money', full: 'Airtel Money', helper: '+256 70 100 0001' },
];

/**
 * Shared demo pay sheet — a portaled bottom sheet with a confirm view (eyebrow +
 * big total + detail rows + method picker + actions) and a success view. Used by
 * the Policies renewal flow, the InsurancePage cover upgrade, and the schedule
 * "settle this period" prompt, so every pay surface looks the same.
 *
 * The sheet owns the method selection; `onPay` receives the chosen method's full
 * name (e.g. 'MTN Mobile Money') so callers can pass it straight to their RPC.
 *
 * @param {{
 *   open: boolean,
 *   view?: 'confirm'|'success',
 *   eyebrow?: string,
 *   total: number,
 *   subtitle?: string,
 *   lineItems?: Array<{ label: string, value: string }>,
 *   note?: string,
 *   methods?: Array<{ id, label, full, helper }>,
 *   payLabel?: string,
 *   cancelLabel?: string,
 *   submitting?: boolean,
 *   ariaLabel?: string,
 *   success?: { title: string, subtitle?: string, reference?: string },
 *   successCtaLabel?: string,
 *   onPay: (methodFull: string) => void,
 *   onClose: () => void,
 * }} props
 */
export default function PaySheet({
  open,
  view = 'confirm',
  eyebrow,
  total = 0,
  subtitle,
  lineItems = [],
  note,
  methods = DEFAULT_METHODS,
  payLabel,
  cancelLabel = 'Cancel',
  submitting = false,
  ariaLabel,
  success,
  successCtaLabel = 'Done',
  onPay,
  onClose,
}) {
  const reduceMotion = useReducedMotion();
  const [methodId, setMethodId] = useState(methods[0]?.id);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];

  function handleClose() {
    if (submitting) return;
    onClose?.();
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.sheetScrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onClick={handleClose}
        >
          <motion.div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (view === 'success' ? 'Payment complete' : 'Confirm payment')}
            initial={reduceMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={styles.sheetGrip} aria-hidden="true" />

            {view === 'confirm' && (
              <div className={styles.sheetBody}>
                {eyebrow && <span className={styles.confirmEyebrow}>{eyebrow}</span>}
                <div className={styles.confirmBig}>{formatUGX(total, { compact: false })}</div>
                {subtitle && <p className={styles.confirmSub}>{subtitle}</p>}

                {lineItems.length > 0 && (
                  <ul className={styles.confirmList}>
                    {lineItems.map((item) => (
                      <li className={styles.confirmRow} key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.methodBlock}>
                  <span className={styles.methodLabel}>Pay with</span>
                  <PillChipGroup label="Payment method" layout="row">
                    {methods.map((m) => (
                      <PillChip key={m.id} selected={methodId === m.id} onClick={() => setMethodId(m.id)}>
                        {m.label}
                      </PillChip>
                    ))}
                  </PillChipGroup>
                  {method?.helper && <p className={styles.methodHelper}>{method.helper}</p>}
                </div>

                {note && <p className={styles.confirmNote}>{note}</p>}

                <div className={styles.sheetActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={handleClose} disabled={submitting}>
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => onPay?.(method?.full)}
                    disabled={submitting}
                  >
                    {submitting ? 'Processing…' : (payLabel ?? `Pay ${formatUGX(total, { compact: false })}`)}
                  </button>
                </div>
              </div>
            )}

            {view === 'success' && (
              <div className={styles.sheetBody} data-center="true">
                <div className={styles.successCheck} aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                    <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className={styles.successTitle}>{success?.title ?? 'Payment complete'}</h2>
                {success?.subtitle && <p className={styles.successSubtitle}>{success.subtitle}</p>}
                {success?.reference && (
                  <div className={styles.successRef}>
                    Reference <strong>{success.reference}</strong>
                  </div>
                )}
                <button type="button" className={styles.primaryBtn} onClick={handleClose}>
                  {successCtaLabel}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
