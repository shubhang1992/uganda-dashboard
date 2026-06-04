import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import styles from './AwarenessCheck.module.css';

/**
 * The 5 awareness points every new subscriber must understand before KYC.
 * Each card exposes the canonical answer the agent should convey, the
 * question to ask, and a Yes/No control to record whether the subscriber
 * answered correctly. Yes/No is the agent's judgment, not a literal
 * yes/no question.
 */
const POINTS = [
  {
    id: 'q1',
    short: 'Account help & complaints',
    question:
      'What should you do if you wish to know your account balance or have any questions, need help, or want to file a complaint?',
    answer:
      'Call the Universal Pensions helpline, visit the nearest service point, or speak with your assigned agent. All three channels can give your balance, answer questions, and log complaints.',
  },
  {
    id: 'q2',
    short: 'Returns & guarantees',
    question:
      'Are the pension benefits guaranteed? And will your savings grow at the same rate every year?',
    answer:
      'No. Returns depend on how the pension fund performs each year, so the growth rate will vary — some years higher, some years lower. Your savings are professionally managed and protected, but the year-on-year growth is not fixed.',
  },
  {
    id: 'q3',
    short: 'Pension start age & payout',
    question:
      'At what age will you start receiving your pension? How will you receive your pension benefit?',
    answer:
      'You can start drawing your pension from age 55, or upon retirement. Benefits can be received as a lump sum, a regular monthly pension, or a phased combination — you choose the option that suits you at the time of claim.',
  },
  {
    id: 'q4',
    short: 'Updating mobile number',
    question:
      'Why is it important to immediately notify the helpline or service point when you change your mobile number?',
    answer:
      'Your registered mobile number is used to authenticate transactions (OTPs), receive balance updates and important alerts. If your number changes and we are not informed, you risk losing access to your account and to time-sensitive notifications.',
  },
  {
    id: 'q5',
    short: 'Government co-contribution',
    question:
      'How much will the government contribute to your pension account? What do you need to do to be eligible? Until what year is this benefit available?',
    answer:
      'The government tops up qualifying contributions with a matching co-contribution, subject to making consistent contributions yourself. The benefit is offered for the early years of the scheme — confirm the latest annual cap and end year on the helpline before promising a specific figure.',
  },
];

/**
 * AwarenessCheck — single screen where the agent walks through 5 must-know
 * points with the subscriber and records whether each answer was correct.
 * The talking point sits inside each card (expandable for reference) so
 * the agent can quiz on the spot without switching screens.
 */
export default function AwarenessCheck({ state, onChange, onContinue }) {
  const { answers } = state;
  const [expandedId, setExpandedId] = useState(POINTS[0].id);

  const answeredCount = useMemo(
    () => POINTS.filter((p) => answers[p.id] !== null).length,
    [answers],
  );
  const correctCount = useMemo(
    () => POINTS.filter((p) => answers[p.id] === true).length,
    [answers],
  );
  const allAnswered = answeredCount === POINTS.length;
  const lowScore = allAnswered && correctCount < 3;

  function setAnswer(id, value) {
    const nextAnswers = { ...answers, [id]: value };
    onChange({ ...state, answers: nextAnswers });

    const idx = POINTS.findIndex((p) => p.id === id);
    const upcoming = POINTS.slice(idx + 1).find((p) => nextAnswers[p.id] === null);
    setExpandedId(upcoming ? upcoming.id : null);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.phaseHeader}>
        <span className={styles.phaseEyebrow}>Awareness check</span>
        <h3 className={styles.phaseHeading}>Cover these 5 points and record the subscriber&apos;s answers</h3>
        <p className={styles.phaseLead}>
          Tap a card to reveal the talking point, ask the question, then mark whether the subscriber answered correctly.
        </p>

        <div className={styles.scoreRow}>
          <span className={styles.scoreCount}>
            <strong>{correctCount}</strong>/{POINTS.length} correct
          </span>
          <span className={styles.scoreMeta}>
            {answeredCount}/{POINTS.length} answered
          </span>
        </div>
      </div>

      <ul className={styles.list}>
        {POINTS.map((p, i) => {
          const isOpen = expandedId === p.id;
          const value = answers[p.id];
          return (
            <li
              key={p.id}
              className={styles.card}
              data-open={isOpen || undefined}
              data-answered={value !== null || undefined}
            >
              <button
                type="button"
                className={styles.cardHeader}
                onClick={() => setExpandedId(isOpen ? null : p.id)}
                aria-expanded={isOpen}
                aria-controls={`point-${p.id}`}
              >
                <span className={styles.cardIndex}>{i + 1}</span>
                <span className={styles.cardHeaderText}>
                  <span className={styles.cardShort}>{p.short}</span>
                  <span className={styles.cardQuestion}>{p.question}</span>
                </span>
                <span className={styles.cardChevron} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    id={`point-${p.id}`}
                    className={styles.cardBody}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.cardBodyInner}>
                      <span className={styles.answerLabel}>What to convey</span>
                      <p className={styles.answerText}>{p.answer}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className={styles.quizActions}
                role="radiogroup"
                aria-label={`${p.short} — did the subscriber answer correctly?`}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={value === true}
                  className={styles.quizYes}
                  data-active={value === true || undefined}
                  onClick={() => setAnswer(p.id, true)}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Yes
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={value === false}
                  className={styles.quizNo}
                  data-active={value === false || undefined}
                  onClick={() => setAnswer(p.id, false)}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                  No
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {lowScore && (
        <div className={styles.warningBanner} role="status">
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M8 1l7 13H1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6v3.5M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>
            The subscriber missed more than half. Consider revisiting the talking points before continuing — confident understanding now prevents support calls later.
          </span>
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onContinue}
          disabled={!allAnswered}
        >
          Continue to KYC
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
