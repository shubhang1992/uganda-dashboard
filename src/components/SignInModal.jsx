import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSignIn } from '../contexts/SignInContext';
import { useAuth } from '../contexts/AuthContext';
import { hasDashboard, sendOtp, verifyOtp } from '../services/auth';
import RoleSelect from './signin/RoleSelect';
import DistributorSelect from './signin/DistributorSelect';
import PhoneEntry from './signin/PhoneEntry';
import OtpVerify from './signin/OtpVerify';
import logo from '../assets/logo-white.png';
import { EASE_OUT_EXPO as EASE } from '../utils/finance';
import styles from './SignInModal.module.css';

export default function SignInModal() {
  const { isOpen, close } = useSignIn();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [phone, setPhone] = useState('');
  const prevStep = useRef('role');

  const modalRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, close]);

  // Focus trap: save previous focus, trap Tab inside modal, restore on close
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement;

    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll(selector)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element inside the modal
    requestAnimationFrame(() => {
      const modal = modalRef.current;
      if (modal) {
        const first = modal.querySelector(selector);
        if (first) first.focus();
      }
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Only restore focus if the previously-focused element still exists in the
      // DOM. Route changes can detach it; calling .focus() on a detached node
      // throws on some browsers and is a silent no-op on others.
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('role');
        setRole(null);
        setPhone('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function goTo(nextStep) {
    prevStep.current = step;
    setStep(nextStep);
  }

  function handleRoleSelect(selectedRole) {
    if (selectedRole === 'distributor') {
      goTo('distributor');
    } else {
      setRole(selectedRole);
      goTo('phone');
    }
  }

  function handleDistributorSelect(subRole) {
    setRole(subRole);
    goTo('phone');
  }

  async function handlePhoneSubmit(phoneNum) {
    setPhone(phoneNum);
    // Fire-and-forget the send so the OTP step can render immediately.
    // Any backend rejection surfaces on the verify step instead.
    sendOtp(phoneNum, role).catch(() => { /* ignore — verify will surface real errors */ });
    goTo('otp');
  }

  async function handleResend() {
    await sendOtp(phone, role);
  }

  /**
   * Verify the OTP. Throws an AuthError on failure so OtpVerify can render
   * a per-code message (invalid_otp, rate_limited, locked). The backend owns
   * the user shape — branchId/agentId/distributorId come from `verifyOtp`,
   * not the client.
   */
  async function handleVerify(code) {
    const { token, user } = await verifyOtp(phone, code, role);
    await login({ token, user });
    close();
    // Trust the API response: verify-otp resolves (or falls back to) a real
    // server subscriber row and returns `user.subscriberId`. Routing to /signup
    // based on localStorage made every fresh-browser sign-in detour through
    // signup even for users whose row already existed.
    navigate(hasDashboard(user.role) ? '/dashboard' : '/coming-soon');
  }

  function handlePhoneBack() {
    if (role === 'distributor' || role === 'branch' || role === 'agent') {
      goTo('distributor');
    } else {
      goTo('role');
    }
  }

  // Progress: 0 = role, 1 = distributor/phone, 2 = otp
  function getProgress() {
    if (step === 'role') return 0;
    if (step === 'distributor') return 1;
    if (step === 'phone') return 1;
    return 2;
  }

  const slideVariants = {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0, position: 'absolute', top: 0, left: 0, right: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          <div className={styles.modalWrap}>
          <motion.div
            ref={modalRef}
            className={styles.modal}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.45, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-modal-title"
          >
            {/* Stable, screen-reader-only heading so the dialog has a single
                announced name regardless of which step is active. */}
            <h2 id="signin-modal-title" className={styles.srOnly}>
              Sign in to Universal Pensions
            </h2>
            {/* Branded header */}
            <div className={styles.header}>
              <div className={styles.headerBg} aria-hidden="true">
                <div className={styles.headerOrb1} />
                <div className={styles.headerOrb2} />
              </div>
              <img src={logo} alt="Universal Pensions" className={styles.logo} width={100} height={28} />

              {/* Step indicator */}
              <div className={styles.steps}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={styles.stepDot}
                    data-active={getProgress() >= i}
                  />
                ))}
              </div>

              <button className={styles.close} onClick={() => close()} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Content area */}
            <div className={styles.body}>
              <AnimatePresence mode="popLayout">
                {step === 'role' && (
                  <motion.div
                    key="role"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <RoleSelect onSelect={handleRoleSelect} />
                  </motion.div>
                )}

                {step === 'distributor' && (
                  <motion.div
                    key="distributor"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <DistributorSelect
                      onSelect={handleDistributorSelect}
                      onBack={() => goTo('role')}
                    />
                  </motion.div>
                )}

                {step === 'phone' && (
                  <motion.div
                    key="phone"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    {role === 'subscriber' ? (
                      <>
                        <div className={styles.authTabs} role="tablist" aria-label="Authentication mode">
                          <button
                            type="button"
                            role="tab"
                            aria-selected="true"
                            className={styles.authTab}
                            data-active="true"
                          >
                            Sign in
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected="false"
                            className={styles.authTab}
                            onClick={() => { close(); navigate('/signup'); }}
                          >
                            Create account
                          </button>
                        </div>
                        <PhoneEntry
                          role={role}
                          onSubmit={handlePhoneSubmit}
                          hideBadge
                          hideVisual
                        />
                        <button
                          type="button"
                          className={styles.altRole}
                          onClick={handlePhoneBack}
                        >
                          Not a subscriber? Choose a different role
                        </button>
                      </>
                    ) : (
                      <PhoneEntry
                        role={role}
                        onSubmit={handlePhoneSubmit}
                        onBack={handlePhoneBack}
                      />
                    )}
                  </motion.div>
                )}

                {step === 'otp' && (
                  <motion.div
                    key="otp"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <OtpVerify
                      phone={phone}
                      onVerify={handleVerify}
                      onResend={handleResend}
                      onBack={() => goTo('phone')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
