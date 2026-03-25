import { motion } from 'framer-motion';
import styles from './RoleSelect.module.css';

const ROLES = [
  { id: 'subscriber', label: 'Subscriber', icon: '👤', desc: 'Individual saver' },
  { id: 'employer', label: 'Employer', icon: '🏢', desc: 'Manage employee contributions' },
  { id: 'distributor', label: 'Distributor', icon: '🌐', desc: 'Network partner' },
  { id: 'branch', label: 'Branch', icon: '📍', desc: 'Local operations' },
  { id: 'agent', label: 'Agent', icon: '🤝', desc: 'Field enrolment' },
  { id: 'admin', label: 'Admin', icon: '🔐', desc: 'Platform admin' },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function RoleSelect({ onSelect }) {
  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>Welcome back</h2>
      <p className={styles.subtext}>Select your role to sign in.</p>

      <motion.div
        className={styles.grid}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {ROLES.map((role) => (
          <motion.button
            key={role.id}
            className={styles.card}
            variants={item}
            onClick={() => onSelect(role.id)}
            whileTap={{ scale: 0.97 }}
          >
            <span className={styles.icon}>{role.icon}</span>
            <span className={styles.label}>{role.label}</span>
            <span className={styles.desc}>{role.desc}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
