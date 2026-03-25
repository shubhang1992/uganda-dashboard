import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSignIn } from '../contexts/SignInContext';
import RoleSelect from './signin/RoleSelect';
import PhoneEntry from './signin/PhoneEntry';
import OtpVerify from './signin/OtpVerify';
import styles from './SignInModal.module.css';

const EASE = [0.16, 1, 0.3, 1];

export default function SignInModal() {
  const { isOpen, close } = useSignIn();
  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [phone, setPhone] = useState('');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset state when modal closes
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

  function handleRoleSelect(selectedRole) {
    setRole(selectedRole);
    setStep('phone');
  }

  function handlePhoneSubmit(phoneNum) {
    setPhone(phoneNum);
    setStep('otp');
  }

  function handleVerify() {
    // Prototype: any code works — just close the modal
    close();
  }

  function handleClose() {
    close();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className={styles.modalWrap}>
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.4, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
          >
            {/* Close button */}
            <button className={styles.close} onClick={handleClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Step content */}
            <AnimatePresence mode="wait">
              {step === 'role' && (
                <motion.div
                  key="role"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <RoleSelect onSelect={handleRoleSelect} />
                </motion.div>
              )}

              {step === 'phone' && (
                <PhoneEntry
                  key="phone"
                  role={role}
                  onSubmit={handlePhoneSubmit}
                  onBack={() => setStep('role')}
                />
              )}

              {step === 'otp' && (
                <OtpVerify
                  key="otp"
                  phone={phone}
                  onVerify={handleVerify}
                  onBack={() => setStep('phone')}
                />
              )}
            </AnimatePresence>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
