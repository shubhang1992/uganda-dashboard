import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './ContributionSettings.module.css';

/**
 * Payment content — lives inside the summary ("what you'll pay") card and
 * replaces the retirement projection + milestones when the user taps
 * "Pay now". Two options:
 *   1. Mobile Money — collect phone inline, instant confirmation.
 *   2. Other methods — redirect to Pesapal (cards / banks / wallets).
 *
 * Payment is mocked — a 1.2s simulated delay precedes `onComplete`.
 */
const PAYMENT_METHODS = [
  {
    id: 'momo',
    label: 'Mobile Money',
    description: 'MTN or Airtel — instant confirmation',
  },
  {
    id: 'gateway',
    label: 'Pay with another method',
    description: 'Card, bank or wallet — via Pesapal',
  },
];

function digitsOnly(str, max = 10) {
  return String(str).replace(/[^\d]/g, '').slice(0, max);
}

function MethodIcon({ id }) {
  if (id === 'momo') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5"
              stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 18.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 5.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  // gateway — external link / redirect
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M14 5h5v5"
            stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 5l-8 8"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 5H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 19h11a1.5 1.5 0 0 0 1.5-1.5V12"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentStep({
  amount,
  phone: initialPhone,
  onBack,
  onComplete,
  formatUGX,
}) {
  const [method, setMethod] = useState('momo');
  const [momoProvider, setMomoProvider] = useState('mtn');
  const [momoPhone, setMomoPhone] = useState(initialPhone || '');
  const [processing, setProcessing] = useState(false);

  const momoValid = digitsOnly(momoPhone).length >= 9;
  const canPay    = method === 'gateway' ? true : momoValid;

  function handlePay() {
    if (!canPay || processing) return;
    setProcessing(true);
    const details =
      method === 'momo'
        ? { provider: momoProvider, phone: `+256${digitsOnly(momoPhone)}` }
        : { gateway: 'pesapal', redirected: true };

    window.setTimeout(() => {
      onComplete({ paymentMethod: method, paymentDetails: details });
    }, 1200);
  }

  const ctaLabel = processing
    ? method === 'gateway' ? 'Redirecting…' : 'Processing…'
    : method === 'gateway' ? 'Continue with Pesapal' : `Pay ${formatUGX(amount)}`;

  return (
    <>
      <div className={styles.pmtHead}>
        <span className={styles.summaryEyebrow}>Payment method</span>
        <button
          type="button"
          className={styles.pmtBack}
          onClick={onBack}
          disabled={processing}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6"
                  stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Change plan
        </button>
      </div>

      <div className={styles.pmtMethodList} role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((m) => {
          const active = method === m.id;
          return (
            <div key={m.id} className={styles.pmtMethodCard} data-active={active}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className={styles.pmtMethodHeader}
                onClick={() => setMethod(m.id)}
                disabled={processing}
              >
                <span className={styles.pmtMethodRadio} data-active={active} aria-hidden="true" />
                <span className={styles.pmtMethodIcon} aria-hidden="true">
                  <MethodIcon id={m.id} />
                </span>
                <span className={styles.pmtMethodCopy}>
                  <span className={styles.pmtMethodLabel}>{m.label}</span>
                  <span className={styles.pmtMethodDesc}>{m.description}</span>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {active && (
                  <motion.div
                    key="fields"
                    className={styles.pmtFields}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.pmtFieldsInner}>
                      {m.id === 'momo' && (
                        <>
                          <div className={styles.pmtProviderRow} role="radiogroup" aria-label="Mobile money provider">
                            {['mtn', 'airtel'].map((p) => (
                              <button
                                key={p}
                                type="button"
                                role="radio"
                                aria-checked={momoProvider === p}
                                className={styles.pmtProviderBtn}
                                data-active={momoProvider === p}
                                onClick={() => setMomoProvider(p)}
                              >
                                {p === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
                              </button>
                            ))}
                          </div>
                          <label className={styles.pmtFieldRow}>
                            <span className={styles.pmtFieldLabel}>Phone number</span>
                            <span className={styles.pmtPhoneField}>
                              <span className={styles.pmtPhonePrefix}>+256</span>
                              <input
                                type="tel"
                                inputMode="numeric"
                                autoComplete="tel-national"
                                spellCheck={false}
                                placeholder="700 000 000"
                                className={styles.pmtPhoneInput}
                                value={momoPhone}
                                onChange={(e) => setMomoPhone(digitsOnly(e.target.value, 10))}
                              />
                            </span>
                          </label>
                        </>
                      )}

                      {m.id === 'gateway' && (
                        <p className={styles.pmtRedirectNote}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9"
                                    stroke="currentColor" strokeWidth="1.6" />
                            <path d="M12 8v4.5M12 16v.5"
                                  stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                          </svg>
                          You’ll be redirected to Pesapal to complete payment securely.
                          Supports Visa, Mastercard, bank transfer and major mobile wallets.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className={styles.pmtSecure}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
          <path d="M6 11V8a6 6 0 0 1 12 0v3"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="4" y="11" width="16" height="10" rx="2"
                stroke="currentColor" strokeWidth="1.6" />
        </svg>
        Secured — encrypted end-to-end
      </p>

      <button
        type="button"
        className={styles.payNow}
        disabled={!canPay || processing}
        onClick={handlePay}
      >
        {processing ? (
          <>
            <span className={styles.pmtSpinner} aria-hidden="true" />
            <span>{ctaLabel}</span>
          </>
        ) : (
          <>
            <span>{ctaLabel}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>
    </>
  );
}
