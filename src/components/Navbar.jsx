import { useState } from 'react';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import logo from '../assets/logo.svg';
import styles from './Navbar.module.css';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#for-you',      label: 'For you' },
  { href: '#your-journey', label: 'Our impact' },
  { href: '#trust',        label: 'Why trust us' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 40);
  });

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
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

          {/* Desktop links */}
          <nav className={styles.links} aria-label="Main navigation">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className={styles.link}>{l.label}</a>
            ))}
          </nav>

          <div className={styles.actions}>
            <a href="#signin" className={styles.signIn}>Sign in</a>
            <a href="#start" className={styles.cta}>Start saving</a>
          </div>

          {/* Hamburger button — mobile only */}
          <button
            className={styles.burger}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span className={styles.burgerLine} data-open={menuOpen} />
            <span className={styles.burgerLine} data-open={menuOpen} />
            <span className={styles.burgerLine} data-open={menuOpen} />
          </button>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closeMenu}
            />
            <motion.div
              className={styles.drawer}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <nav className={styles.drawerNav} aria-label="Mobile navigation">
                {NAV_LINKS.map(l => (
                  <a key={l.href} href={l.href} className={styles.drawerLink} onClick={closeMenu}>
                    {l.label}
                  </a>
                ))}
              </nav>
              <div className={styles.drawerActions}>
                <a href="#signin" className={styles.drawerSignIn} onClick={closeMenu}>Sign in</a>
                <a href="#start" className={styles.drawerCta} onClick={closeMenu}>Start saving</a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
