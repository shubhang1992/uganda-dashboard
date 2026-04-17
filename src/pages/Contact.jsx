import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import styles from './Contact.module.css';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <>
      <Navbar />
      <main id="main" className={styles.page}>
        <div className={styles.container}>
          <motion.div
            className={styles.header}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
          >
            <h1 className={styles.title}>Contact Us</h1>
            <p className={styles.subtitle}>
              Have a question or need assistance? We are here to help. Reach out to our team through any of the channels below.
            </p>
          </motion.div>

          <div className={styles.grid}>
            <motion.div
              className={styles.info}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.infoCard}>
                <div className={styles.infoIcon}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75"/>
                  </svg>
                </div>
                <h3 className={styles.infoLabel}>Office</h3>
                <p className={styles.infoText}>
                  Plot 37, Kampala Road<br />
                  P.O. Box 7185<br />
                  Kampala, Uganda
                </p>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoIcon}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className={styles.infoLabel}>Phone</h3>
                <p className={styles.infoText}>+256 (0) 312 000 000</p>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoIcon}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className={styles.infoLabel}>Email</h3>
                <p className={styles.infoText}>support@universalpensions.ug</p>
              </div>

              <div className={styles.regulatory}>
                Licensed and regulated by the Uganda Retirement Benefits Regulatory Authority (URBRA).
              </div>
            </motion.div>

            <motion.div
              className={styles.formWrap}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: EASE_OUT_EXPO }}
            >
              {submitted ? (
                <div className={styles.success}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="32" height="32">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75"/>
                    <polyline points="8,12 11,15 16,9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h3 className={styles.successTitle}>Message sent</h3>
                  <p className={styles.successText}>Thank you for reaching out. Our team will get back to you shortly.</p>
                  <Link to="/" className={styles.backBtn}>Back to home</Link>
                </div>
              ) : (
                <form className={styles.form} onSubmit={handleSubmit}>
                  <h2 className={styles.formTitle}>Send us a message</h2>
                  <div className={styles.field}>
                    <label htmlFor="contact-name" className={styles.label}>Name</label>
                    <input
                      id="contact-name"
                      className={styles.input}
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      placeholder="Your full name"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="contact-email" className={styles.label}>Email</label>
                    <input
                      id="contact-email"
                      className={styles.input}
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="contact-message" className={styles.label}>Message</label>
                    <textarea
                      id="contact-message"
                      className={styles.textarea}
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      placeholder="How can we help?"
                    />
                  </div>
                  <button type="submit" className={styles.submit}>Send message</button>
                </form>
              )}
            </motion.div>
          </div>

          <motion.div
            className={styles.backLinkWrap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25, ease: EASE_OUT_EXPO }}
          >
            <Link to="/" className={styles.backLink}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to home
            </Link>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}
