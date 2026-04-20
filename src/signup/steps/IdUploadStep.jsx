import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSignup } from '../SignupContext';
import { assessImageQuality } from '../../services/kyc';
import styles from './Step.module.css';
import own from './IdUploadStep.module.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const CHECKS = [
  { id: 'blur',    label: 'Sharp focus'      },
  { id: 'corners', label: 'All four corners' },
  { id: 'glare',   label: 'No glare'         },
];

const SIDES = [
  {
    id: 'front',
    label: 'Front',
    description: 'Your photo, name, NIN, and date of birth',
    fileKey: 'idFrontFile',
    urlKey:  'idFrontPreviewUrl',
    qualityKey: 'idFrontQuality',
  },
  {
    id: 'back',
    label: 'Back',
    description: 'The 2D barcode and signature',
    fileKey: 'idBackFile',
    urlKey:  'idBackPreviewUrl',
    qualityKey: 'idBackQuality',
  },
];

export default function IdUploadStep({ onNext }) {
  const signup = useSignup();

  // Clean up any stale object URLs when the step unmounts.
  useEffect(() => {
    return () => {
      if (signup.idFrontPreviewUrl) URL.revokeObjectURL(signup.idFrontPreviewUrl);
      if (signup.idBackPreviewUrl)  URL.revokeObjectURL(signup.idBackPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bothUploaded = !!signup.idFrontFile && !!signup.idBackFile;
  const bothPass =
    !!signup.idFrontQuality?.pass && !!signup.idBackQuality?.pass;
  const canContinue = bothUploaded && bothPass;

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 1 · National ID</span>
      <h2 className={styles.heading}>Scan both sides of your Ndaga Muntu</h2>
      <p className={styles.subtext}>
        We read your details from the card so you don’t have to type them.
      </p>

      <ul className={own.tips}>
        <TipChip>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="8" cy="8" r="2.5" fill="currentColor"/>
          </svg>
          Good light
        </TipChip>
        <TipChip>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <rect x="2.5" y="4.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Whole card in frame
        </TipChip>
        <TipChip>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          No glare
        </TipChip>
      </ul>

      <div className={own.sides}>
        {SIDES.map((side) => (
          <SideUploader key={side.id} side={side} />
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.submit}
          onClick={onNext}
          disabled={!canContinue}
        >
          {bothUploaded && !bothPass
            ? 'Fix the photos above to continue'
            : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function TipChip({ children }) {
  return <li className={own.tipChip}>{children}</li>;
}

/* ── Per-side uploader ───────────────────────────────────────────────── */

function SideUploader({ side }) {
  const signup = useSignup();
  const file = signup[side.fileKey];
  const url  = signup[side.urlKey];
  const quality = signup[side.qualityKey];

  const inputRef = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  async function handleChange(ev) {
    const selected = ev.target.files?.[0];
    ev.target.value = '';
    if (!selected) return;

    if (!ACCEPTED.includes(selected.type) && !/\.(jpe?g|png|webp|heic)$/i.test(selected.name)) {
      setError('Upload a JPG, PNG, WEBP, or HEIC image.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('Image is larger than 10\u00A0MB. Try a smaller photo.');
      return;
    }

    if (url) URL.revokeObjectURL(url);
    const nextUrl = URL.createObjectURL(selected);

    signup.patch({
      [side.fileKey]: selected,
      [side.urlKey]: nextUrl,
      [side.qualityKey]: null,
    });
    setError('');
    setAnalyzing(true);

    const report = await assessImageQuality(selected);
    signup.patch({ [side.qualityKey]: report });
    setAnalyzing(false);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function clearSide() {
    if (url) URL.revokeObjectURL(url);
    signup.patch({
      [side.fileKey]: null,
      [side.urlKey]: null,
      [side.qualityKey]: null,
    });
    setError('');
  }

  const state = !file ? 'empty' : analyzing ? 'analyzing' : quality?.pass ? 'ok' : 'issue';
  const inputId = `id-upload-${side.id}`;

  return (
    <div className={own.side} data-state={state}>
      <div className={own.sideHeader}>
        <div>
          <span className={own.sideLabel}>{side.label}</span>
          <span className={own.sideDesc}>{side.description}</span>
        </div>
        <SideBadge state={state} />
      </div>

      {/* Label wraps the input AS A DIRECT CHILD. This is the textbook HTML5
          pattern: clicks anywhere in the label forward to the nested input.
          The input is also absolutely positioned so clicks land on it
          directly (double-guarantee). No motion components in the click path
          to avoid any pointer-event interference. */}
      <label className={own.frameWrap} data-state={state}>
        <input
          ref={inputRef}
          id={inputId}
          name={inputId}
          type="file"
          accept="image/*"
          className={own.fileOverlay}
          onChange={handleChange}
          aria-label={`Upload ${side.label.toLowerCase()} of your ID`}
          // Suppress the native "No file chosen" browser tooltip — it hovers
          // awkwardly over the tile and conflicts with the custom visuals.
          title=""
        />
        <span className={own.frame} data-state={state} aria-hidden="true">
          {url ? (
            <img src={url} alt="" width="400" height="254" className={own.preview} />
          ) : (
            <span className={own.empty}>
              <CardIllustration side={side.id} />
              <span className={own.emptyAction}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M8 2v9m-4-4l4 4 4-4M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={own.emptyHint}>Tap to upload</span>
              </span>
            </span>
          )}

          {analyzing && (
            <span className={own.scanTrack} aria-hidden="true">
              <motion.span
                className={own.scanSweep}
                initial={{ y: '-50%' }}
                animate={{ y: ['-50%', '50%', '-50%'] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
          )}
        </span>
      </label>

      {/* Visible fallback — guaranteed to open the picker via ref click */}
      {!file && (
        <button type="button" className={own.browseBtn} onClick={openPicker}>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M8 2v9m-4-4l4 4 4-4M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Choose file from device
        </button>
      )}

      {/* Quality checks */}
      <div className={own.checks} aria-live="polite">
        {CHECKS.map((check) => (
          <QualityCheck
            key={check.id}
            label={check.label}
            state={
              !file ? 'pending'
              : analyzing ? 'running'
              : quality?.[check.id] ? 'pass' : 'fail'
            }
          />
        ))}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {/* Quality failure guidance */}
      {!analyzing && file && quality && !quality.pass && (
        <div className={own.issueBox}>
          <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75"/>
            <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          <span>{qualityMessage(quality, side.label)}</span>
        </div>
      )}

      {file && (
        <button type="button" className={own.retake} onClick={clearSide}>
          {quality?.pass ? 'Replace photo' : 'Retake photo'}
        </button>
      )}
    </div>
  );
}

function qualityMessage(quality, sideLabel) {
  const problems = [];
  if (!quality.blur) problems.push('photo is blurry');
  if (!quality.corners) problems.push('a corner is cut off');
  if (!quality.glare) problems.push('glare is covering the card');
  if (problems.length === 0) return `Retake the ${sideLabel.toLowerCase()} photo.`;
  return `Retake the ${sideLabel.toLowerCase()} — ${problems.join(' and ')}.`;
}

/* ── Tiny presentational bits ────────────────────────────────────────── */

function SideBadge({ state }) {
  if (state === 'ok') {
    return (
      <span className={own.badge} data-kind="ok">
        <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Looks good
      </span>
    );
  }
  if (state === 'issue') {
    return (
      <span className={own.badge} data-kind="issue">
        Needs a retake
      </span>
    );
  }
  if (state === 'analyzing') {
    return (
      <span className={own.badge} data-kind="analyzing">
        <span className={own.badgeSpinner} aria-hidden="true" />
        Checking
      </span>
    );
  }
  return <span className={own.badge} data-kind="empty">Required</span>;
}

function QualityCheck({ label, state }) {
  return (
    <div className={own.check} data-state={state}>
      <span className={own.checkDot} aria-hidden="true">
        {state === 'pass' && (
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
            <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {state === 'fail' && (
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        )}
        {state === 'running' && <span className={own.checkSpin} />}
      </span>
      <span className={own.checkLabel}>{label}</span>
    </div>
  );
}

function CardIllustration({ side }) {
  if (side === 'front') {
    return (
      <svg viewBox="0 0 100 63" className={own.illustration} aria-hidden="true">
        <rect x="2" y="2" width="96" height="59" rx="6" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3"/>
        <rect x="10" y="12" width="24" height="30" rx="2" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.3"/>
        <line x1="40" y1="16" x2="80" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
        <line x1="40" y1="22" x2="74" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
        <line x1="40" y1="30" x2="80" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
        <line x1="40" y1="36" x2="70" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 63" className={own.illustration} aria-hidden="true">
      <rect x="2" y="2" width="96" height="59" rx="6" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3"/>
      <rect x="12" y="14" width="76" height="22" rx="1" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.3"/>
      {/* barcode stripes */}
      {Array.from({ length: 30 }).map((_, i) => (
        <line
          key={i}
          x1={14 + i * 2.4}
          y1="16"
          x2={14 + i * 2.4}
          y2="34"
          stroke="currentColor"
          strokeWidth={i % 3 === 0 ? 0.8 : 0.3}
          opacity="0.3"
        />
      ))}
      <line x1="14" y1="44" x2="60" y2="44" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
      <line x1="14" y1="50" x2="50" y2="50" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
    </svg>
  );
}
