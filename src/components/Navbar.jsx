import { useState, useEffect } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import logo from '../assets/logo.svg';
import styles from './Navbar.module.css';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 40);
  });

  return (
    <motion.nav
      className={styles.nav}
      data-scrolled={scrolled}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.inner}>
        <a href="/" className={styles.logo} aria-label="Universal Pensions home">
          <img src={logo} alt="Universal Pensions" className={styles.logoImg} />
        </a>

        <nav className={styles.links} aria-label="Main navigation">
          <a href="#how-it-works" className={styles.link}>How it works</a>
          <a href="#for-you" className={styles.link}>For you</a>
          <a href="#impact" className={styles.link}>Our impact</a>
          <a href="#trust" className={styles.link}>Why trust us</a>
        </nav>

        <div className={styles.actions}>
          <a href="#signin" className={styles.signIn}>Sign in</a>
          <a href="#start" className={styles.cta}>Start saving</a>
        </div>
      </div>
    </motion.nav>
  );
}
