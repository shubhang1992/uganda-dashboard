import logo from '../assets/logo.svg';
import styles from './Footer.module.css';

const LINKS = {
  Platform: ['How it works', 'For individuals', 'For employers', 'For agents'],
  Company: ['About us', 'Our mission', 'Careers', 'Press'],
  Legal: ['Terms of service', 'Privacy policy', 'Regulatory notice', 'NSSF compliance'],
  Support: ['Help center', 'Contact us', 'Find an agent', 'Branch locator'],
};

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.top}>
          <div className={styles.brand}>
            <img src={logo} alt="Universal Pensions" className={styles.logo} />
            <p className={styles.tagline}>
              Making long-term savings simple, accessible, and meaningful for every Ugandan.
            </p>
            <div className={styles.regulatory}>
              Licensed and regulated by the Uganda Retirement Benefits Regulatory Authority (URBRA).
            </div>
          </div>

          <nav className={styles.linksGrid} aria-label="Footer navigation">
            {Object.entries(LINKS).map(([group, items]) => (
              <div key={group} className={styles.linkGroup}>
                <div className={styles.groupLabel}>{group}</div>
                <ul className={styles.linkList}>
                  {items.map((item) => (
                    <li key={item}>
                      <a href={`#${item.toLowerCase().replace(/\s+/g, '-')}`} className={styles.link}>
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.bottom}>
          <div className={styles.copyright}>
            © {new Date().getFullYear()} Universal Pensions Limited. All rights reserved.
          </div>
          <div className={styles.bottomLinks}>
            <a href="#privacy" className={styles.bottomLink}>Privacy</a>
            <a href="#terms" className={styles.bottomLink}>Terms</a>
            <a href="#cookies" className={styles.bottomLink}>Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
