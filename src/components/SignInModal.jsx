import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSignIn } from '../contexts/SignInContext';
import { useAuth } from '../contexts/AuthContext';
import { hasDashboard } from '../services/auth';
import RoleSelect from './signin/RoleSelect';
import DistributorSelect from './signin/DistributorSelect';
import PhoneEntry from './signin/PhoneEntry';
import OtpVerify from './signin/OtpVerify';
import logo from '../assets/logo-white.png';
import { EASE_OUT_EXPO as EASE } from '../utils/finance';
import styles from './SignInModal.module.css';

const STEPS = ['role', 'distributor', 'phone', 'otp'];

function getStepIndex(step) {
  return STEPS.indexOf(step);
}

export default function SignInModal() {
  const { isOpen, close } = useSignIn();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [phone, setPhone] = useState('');
  const [direction, setDirection] = useState(1);
  const prevStep = useRef('role');

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, close]);

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
        setDirection(1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function goTo(nextStep) {
    setDirection(getStepIndex(nextStep) > getStepIndex(prevStep.current) ? 1 : -1);
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

  function handlePhoneSubmit(phoneNum) {
    setPhone(phoneNum);
    goTo('otp');
  }

  function handleVerify() {
    close();
    login({ role, phone, name: 'Demo User' });
    navigate(hasDashboard(role) ? '/dashboard' : '/coming-soon');
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
            className={styles.modal}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.45, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
          >
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
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
                    <PhoneEntry
                      role={role}
                      onSubmit={handlePhoneSubmit}
                      onBack={handlePhoneBack}
                    />
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
