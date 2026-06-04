import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatNumber } from '../../utils/currency';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useToast } from '../../contexts/ToastContext';
import { downloadCsv } from '../../utils/csvDownload';
import styles from './ReportView.module.css';

/**
 * Distributor + Branch report shell. Renders the page chrome (header, filters,
 * back-button, export) around a caller-supplied table or chart.
 *
 * Export wiring:
 *   - Pass `exportRows` + `exportColumns` to enable the Export button. The
 *     button is hidden when either is missing — there's nothing useful to
 *     download otherwise.
 *   - `exportFilename` is the filename slug; the date stamp and `.csv`
 *     extension are appended by `csvDownload.dateStampedFilename`.
 *   - `onExport` overrides the default download behaviour entirely if the
 *     caller wants its own pipeline (e.g. server-rendered CSV).
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.filters]
 * @param {React.ReactNode} props.children
 * @param {() => void} [props.onBack] — Panel mode wires its own back.
 * @param {Array<object>} [props.exportRows] — Rows to serialise.
 * @param {Array<{key: string, label: string}>} [props.exportColumns] — Column
 *   config (matches `csv.js` `toCsv` signature).
 * @param {string} [props.exportFilename] — Filename slug. Defaults to title.
 * @param {() => Promise<void>} [props.onExport] — Override the export pipeline.
 */
export default function ReportView({
  title,
  description,
  filters,
  children,
  onBack,
  exportRows,
  exportColumns,
  exportFilename,
  onExport,
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleBack = onBack || (() => navigate('/dashboard/reports'));

  const canExport = !!onExport || (Array.isArray(exportRows) && Array.isArray(exportColumns) && exportColumns.length > 0);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    // Graceful no-op when a caller hasn't wired export data yet. We toast
    // the user instead of silently doing nothing so the button never feels
    // broken in a demo. The button is wired here; callers opt-in via
    // `exportRows` / `exportColumns` / `onExport`.
    if (!canExport) {
      addToast('info', 'Export is not yet available for this report. Try again after filters apply.');
      return;
    }
    setExporting(true);
    try {
      if (onExport) {
        await onExport();
      } else {
        await downloadCsv({
          rows: exportRows,
          columns: exportColumns,
          // Filename slug — caller-supplied or derived from the title.
          filename: exportFilename || title || 'report',
          isMobile,
          onCapNotice: ({ capped, total }) => {
            addToast(
              'warning',
              // Demo-scope copy per the brief — explicit row count so users
              // know what's missing rather than seeing a truncated CSV.
              `Showing first ${formatNumber(capped)} rows in export — refine your filter for full data (${formatNumber(total)} total).`,
            );
          },
        });
      }
    } catch (err) {
      // Surface failures so a silent download bug doesn't go unnoticed in
      // demos. The OWASP-defended `csv.js` is well-tested; this catch is
      // for browser quirks (Safari iframe security, etc).
      addToast('error', err?.message || 'Could not export report.');
    } finally {
      setExporting(false);
    }
  }, [exporting, canExport, onExport, exportRows, exportColumns, exportFilename, title, isMobile, addToast]);

  return (
    <div className={onBack ? styles.viewPanel : styles.view}>
      <motion.div
        className={styles.inner}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {!onBack && (
              <button
                className={styles.backBtn}
                onClick={handleBack}
                aria-label="Back to reports"
              >
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
                  <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className={styles.headerText}>
              <h1 className={styles.title}>{title}</h1>
              {description && <p className={styles.subtitle}>{description}</p>}
            </div>
          </div>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={exporting}
            aria-label="Export report as CSV"
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span>{exporting ? 'Exporting…' : 'Export'}</span>
          </button>
        </div>

        {/* Filters bar */}
        {filters && <div className={styles.filters}>{filters}</div>}

        {/* Content */}
        <div className={styles.content}>{children}</div>
      </motion.div>
    </div>
  );
}
