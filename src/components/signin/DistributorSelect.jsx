import { motion } from 'framer-motion';
import styles from './DistributorSelect.module.css';

const SUB_ROLES = [
  {
    id: 'distributor', label: 'Distributor Admin', desc: 'Network-level oversight',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <circle cx="12" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="21" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="21" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 4.5v4.5M12 15v4.5M4.5 12H9M15 12h4.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'branch', label: 'Branch Admin', desc: 'Local operations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <path d="M3 21h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <rect x="9" y="13" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M9 9h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'agent', label: 'Agent', desc: 'Field enrolment',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M18 8v6M15 11h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const EASE = [0.16, 1, 0.3, 1];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export default function DistributorSelect({ onSelect, onBack }) {
  return (
    <motion.div
      className={styles.wrapper}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <button className={styles.back} onClick={onBack} type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      <h2 className={styles.heading}>Distributor login</h2>
      <p className={styles.subtext}>Select your role within the distribution network.</p>

      <motion.div
        className={styles.list}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {SUB_ROLES.map((role) => (
          <motion.button
            key={role.id}
            className={styles.card}
            variants={item}
            onClick={() => onSelect(role.id)}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.icon}>{role.icon}</span>
            <div className={styles.text}>
              <span className={styles.label}>{role.label}</span>
              <span className={styles.desc}>{role.desc}</span>
            </div>
            <svg className={styles.arrow} width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
