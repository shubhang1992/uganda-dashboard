import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_TEMPLATE_COLUMNS,
  REQUIRED_UPLOAD_COLUMNS,
  SETTLEMENT_SKIP_REASONS,
  buildTemplateRows,
  normalizeUploadedRows,
  detectMissingColumns,
  describeSkippedReason,
  formatSettlementNotificationBody,
} from '../settlement';

describe('settlement utils', () => {
  describe('formatSettlementNotificationBody()', () => {
    it('formats the amount with thousands separators (BL-18)', () => {
      expect(formatSettlementNotificationBody(25000, 5)).toBe('UGX 25,000 paid for 5 commissions.');
      expect(formatSettlementNotificationBody(1200000, 9)).toBe('UGX 1,200,000 paid for 9 commissions.');
    });

    it('pluralizes correctly: "1 commission" vs "N commissions"', () => {
      expect(formatSettlementNotificationBody(5000, 1)).toBe('UGX 5,000 paid for 1 commission.');
      expect(formatSettlementNotificationBody(10000, 2)).toBe('UGX 10,000 paid for 2 commissions.');
    });

    it('rounds a stray fractional amount in the body', () => {
      expect(formatSettlementNotificationBody(5000.4, 1)).toBe('UGX 5,000 paid for 1 commission.');
    });
  });

  describe('describeSkippedReason() (BL-19)', () => {
    it('returns a label + concrete fix for every known reason', () => {
      // Both the client-side normalize reasons and the server-side RPC reasons
      // must carry an actionable fix sentence.
      for (const reason of ['missing_agent_id', 'no_amount', 'no_due', 'amount_too_low']) {
        const { label, fix } = describeSkippedReason(reason);
        expect(label).toBeTruthy();
        expect(fix).toBeTruthy();
        expect(SETTLEMENT_SKIP_REASONS[reason]).toEqual({ label, fix });
      }
    });

    it('includes the server-only no_due / amount_too_low reasons', () => {
      // These never come from normalizeUploadedRows — only from apply_settlement.
      expect(describeSkippedReason('no_due').label).toBe('no outstanding dues');
      expect(describeSkippedReason('amount_too_low').label).toBe('amount below the oldest due line');
    });

    it('falls back to the raw reason as the label (empty fix) for an unknown code', () => {
      expect(describeSkippedReason('brand_new_reason')).toEqual({ label: 'brand_new_reason', fix: '' });
      expect(describeSkippedReason(undefined)).toEqual({ label: '', fix: '' });
    });
  });

  describe('buildTemplateRows()', () => {
    const pending = [
      { agentId: 'a-001', agentName: 'Diana Musinguzi', branchName: 'Kampala Central', pendingAmount: 45000, pendingCount: 9 },
      { agentId: 'a-002', agentName: 'Brian Okello', branchName: 'Gulu', pendingAmount: 10000, pendingCount: 2 },
    ];

    it('keys every row by the canonical template headers', () => {
      const [row] = buildTemplateRows(pending);
      expect(Object.keys(row).sort()).toEqual([...SETTLEMENT_TEMPLATE_COLUMNS].sort());
    });

    it('prefills identity + pending columns from the pending-dues data', () => {
      const rows = buildTemplateRows(pending);
      expect(rows[0]['Agent ID']).toBe('a-001');
      expect(rows[0]['Agent Name']).toBe('Diana Musinguzi');
      expect(rows[0]['Branch']).toBe('Kampala Central');
      expect(rows[0]['Pending Amount (UGX)']).toBe(45000);
      expect(rows[1]['Agent ID']).toBe('a-002');
      expect(rows[1]['Pending Amount (UGX)']).toBe(10000);
    });

    it('leaves the three fill-me columns blank', () => {
      const [row] = buildTemplateRows(pending);
      expect(row['Amount Paid (UGX)']).toBe('');
      expect(row['Payment Reference']).toBe('');
      expect(row['Payment Date']).toBe('');
    });

    it('returns an empty array for nullish / non-array input', () => {
      expect(buildTemplateRows(undefined)).toEqual([]);
      expect(buildTemplateRows(null)).toEqual([]);
    });
  });

  describe('detectMissingColumns()', () => {
    it('reports ok when every required header is present (order-independent)', () => {
      // Headers reordered + extra columns present — still ok.
      const result = detectMissingColumns([
        { 'Amount Paid (UGX)': 5000, 'Branch': 'Gulu', 'Agent ID': 'a-001' },
      ]);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.found).toEqual(expect.arrayContaining(['Agent ID', 'Amount Paid (UGX)', 'Branch']));
    });

    it('flags a renamed Agent ID header and lists expected vs found (C2)', () => {
      // Distributor renamed "Agent ID" → "AgentID"; without this check every
      // row would skip with an opaque 'missing_agent_id'.
      const result = detectMissingColumns([
        { 'AgentID': 'a-001', 'Amount Paid (UGX)': 5000 },
      ]);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(['Agent ID']);
      expect(result.found).toContain('AgentID');
      expect(result.found).not.toContain('Agent ID');
    });

    it('flags multiple missing required columns at once', () => {
      const result = detectMissingColumns([{ 'Branch': 'Kampala', 'Notes': 'x' }]);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(REQUIRED_UPLOAD_COLUMNS);
      expect(result.found).toEqual(expect.arrayContaining(['Branch', 'Notes']));
    });

    it('unions header keys across rows (a header present on any row counts)', () => {
      const result = detectMissingColumns([
        { 'Agent ID': 'a-001' },
        { 'Amount Paid (UGX)': 5000 },
      ]);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('treats empty / nullish / non-array input as all required columns missing', () => {
      expect(detectMissingColumns([])).toEqual({ ok: false, missing: REQUIRED_UPLOAD_COLUMNS, found: [] });
      expect(detectMissingColumns(null)).toEqual({ ok: false, missing: REQUIRED_UPLOAD_COLUMNS, found: [] });
      expect(detectMissingColumns(undefined)).toEqual({ ok: false, missing: REQUIRED_UPLOAD_COLUMNS, found: [] });
    });
  });

  describe('normalizeUploadedRows()', () => {
    it('keeps valid rows and coerces the fields', () => {
      const { rows, skipped } = normalizeUploadedRows([
        {
          'Agent ID': 'a-001',
          'Amount Paid (UGX)': 45000,
          'Payment Reference': '  MM-9931  ',
          'Payment Date': '2026-05-30',
        },
      ]);
      expect(skipped).toEqual([]);
      expect(rows).toEqual([
        { agentId: 'a-001', amountPaid: 45000, paymentRef: 'MM-9931', paymentDate: '2026-05-30' },
      ]);
    });

    it('skips a row with a missing / blank Agent ID', () => {
      const { rows, skipped } = normalizeUploadedRows([
        { 'Agent ID': '', 'Amount Paid (UGX)': 1000 },
        { 'Agent ID': '   ', 'Amount Paid (UGX)': 1000 },
      ]);
      expect(rows).toEqual([]);
      expect(skipped).toEqual([
        { agentId: null, reason: 'missing_agent_id' },
        { agentId: null, reason: 'missing_agent_id' },
      ]);
    });

    it('skips rows with a blank, zero, or non-numeric Amount Paid', () => {
      const { rows, skipped } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': '' },
        { 'Agent ID': 'a-002', 'Amount Paid (UGX)': 0 },
        { 'Agent ID': 'a-003', 'Amount Paid (UGX)': 'abc' },
      ]);
      expect(rows).toEqual([]);
      expect(skipped).toEqual([
        { agentId: 'a-001', reason: 'no_amount' },
        { agentId: 'a-002', reason: 'no_amount' },
        { agentId: 'a-003', reason: 'no_amount' },
      ]);
    });

    it('parses formatted-string amounts ("1,200,000", "UGX 50,000")', () => {
      const { rows } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': '1,200,000' },
        { 'Agent ID': 'a-002', 'Amount Paid (UGX)': 'UGX 50,000' },
      ]);
      expect(rows[0].amountPaid).toBe(1200000);
      expect(rows[1].amountPaid).toBe(50000);
    });

    it('rounds fractional amounts to whole UGX (BL-8 — no fractional shillings)', () => {
      const { rows } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': '45,000.50' },
        { 'Agent ID': 'a-002', 'Amount Paid (UGX)': 45000.49 },
      ]);
      expect(rows[0].amountPaid).toBe(45001);
      expect(rows[1].amountPaid).toBe(45000);
      // Integers only — never a fractional shilling reaches the RPC.
      rows.forEach((r) => expect(Number.isInteger(r.amountPaid)).toBe(true));
    });

    it('coerces an Excel serial number date to YYYY-MM-DD', () => {
      // Serial 46172 = 2026-05-30 (25569 + days since Unix epoch).
      const { rows } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': 1000, 'Payment Date': 46172 },
      ]);
      expect(rows[0].paymentDate).toBe('2026-05-30');
    });

    it('keeps a YYYY-MM-DD string date as-is and blanks unparseable / empty dates', () => {
      const { rows } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': 1000, 'Payment Date': '2026-01-15' },
        { 'Agent ID': 'a-002', 'Amount Paid (UGX)': 1000, 'Payment Date': '' },
        { 'Agent ID': 'a-003', 'Amount Paid (UGX)': 1000, 'Payment Date': 'not-a-date' },
      ]);
      expect(rows[0].paymentDate).toBe('2026-01-15');
      expect(rows[1].paymentDate).toBe('');
      expect(rows[2].paymentDate).toBe('');
    });

    it('defaults a missing Payment Reference to an empty string', () => {
      const { rows } = normalizeUploadedRows([
        { 'Agent ID': 'a-001', 'Amount Paid (UGX)': 1000 },
      ]);
      expect(rows[0].paymentRef).toBe('');
    });

    it('returns empty results for nullish / non-array input', () => {
      expect(normalizeUploadedRows(undefined)).toEqual({ rows: [], skipped: [] });
      expect(normalizeUploadedRows(null)).toEqual({ rows: [], skipped: [] });
    });
  });
});
