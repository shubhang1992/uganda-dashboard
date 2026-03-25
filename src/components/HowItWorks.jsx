import { motion } from 'framer-motion';
import styles from './HowItWorks.module.css';

const STEPS = [
  {
    number: '01',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M10 18h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Register in 3 minutes',
    desc: "Phone number and National ID — that's it. No branch visit, no paperwork.",
    highlight: 'Any network · Any phone',
  },
  {
    number: '02',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 10h18M7 15h3m4 0h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.75"/>
      </svg>
    ),
    title: 'Contribute via mobile money',
    desc: 'MTN MoMo or Airtel Money. Weekly, monthly, or whenever you can.',
    highlight: 'From UGX 5,000 / month',
  },
  {
    number: '03',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 18l5-6 4 3 5-8 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Your money earns 10% a year',
    desc: "Uganda's pension funds consistently return around 10% annually.",
    highlight: 'Above bank deposit rates',
  },
  {
    number: '04',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75"/>
      </svg>
    ),
    title: 'Retire on your terms',
    desc: 'Monthly pension income or a lump sum. Fully transparent, fully yours.',
    highlight: 'Monthly income or lump sum',
  },
];

export default function HowItWorks() {
  return (
    <section className={styles.section} id="how-it-works">
      <div className="container">
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.sectionTag}>Built for Uganda</div>
          <h2 className={styles.heading}>
            Save for retirement.
            <br />
            <span className={styles.headingAccent}>As easy as mobile money.</span>
          </h2>
          <p className={styles.subtext}>
            Four steps from your phone to a secure future.
          </p>
        </motion.div>

        {/* Outer glass card */}
        <motion.div
          className={styles.outerCard}
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.grid}>
            {STEPS.map((step, i) => (
              <motion.div
                key={step.number}
                className={styles.card}
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.15 + i * 0.1,
                  duration: 0.6,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardIcon}>{step.icon}</div>
                  <span className={styles.cardNumber}>{step.number}</span>
                </div>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardDesc}>{step.desc}</p>
                <div className={styles.highlight}>{step.highlight}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
