// Shared helpers for the commission service layer.
//
// Extracted from `src/services/commissions.js` so the row-mapping, error
// wrapping, status predicates, and run-derivation logic can be reused by
// `commission-config.js` (and any future commission-domain modules) without
// duplication. Public API of `commissions.js` is unchanged — it re-exports
// nothing from here; importers go through this module directly.
//
// Names are kept identical to the originals (underscore-prefixed for the
// internal helpers, bare names for constants/predicates/formatters) to keep
// the diff inside `commissions.js` minimal and to signal that the underscore-
// prefixed exports remain "service-internal" — they are not part of the
// public commission API consumed by hooks/components.

/* ─── Constants ──────────────────────────────────────────────────────────── */

export const VALID_CADENCES = new Set(['weekly-friday', 'biweekly-friday', 'monthly-first']);

export const STATUSES_PAID = new Set(['released', 'confirmed']);
export const STATUSES_OUTSTANDING = new Set(['due', 'in_run', 'held']);

/* ─── Predicates ─────────────────────────────────────────────────────────── */

export const isPaid = (c) => STATUSES_PAID.has(c.status);
export const isOutstanding = (c) => STATUSES_OUTSTANDING.has(c.status);

/* ─── Formatters ─────────────────────────────────────────────────────────── */

/** ISO 8601 (YYYY-MM-DD) formatter that respects local time-of-day. */
export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Error wrapping ─────────────────────────────────────────────────────── */

export function _rpcError(err, fnName) {
  const message = err?.message || `RPC ${fnName} failed`;
  const wrapped = new Error(message);
  wrapped.code = err?.code || 'rpc_error';
  wrapped.details = err?.details;
  wrapped.hint = err?.hint;
  return wrapped;
}

/* ─── Row mappers ────────────────────────────────────────────────────────── */

/** Map a snake_case DB commission row to the camelCase shape the UI expects. */
export function _rowToCommission(row) {
  if (!row) return row;
  return {
    id: row.id,
    agentId: row.agent_id,
    branchId: row.branch_id,
    subscriberId: row.subscriber_id,
    subscriberName: row.subscriber_name,
    amount: Number(row.amount),
    status: row.status,
    firstContributionDate: row.first_contribution_date,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    runId: row.run_id,
    txnRef: row.txn_ref,
    agentConfirmed: row.agent_confirmed,
    previousStatus: row.previous_status,
    disputeReason: row.dispute_reason,
    disputedAt: row.disputed_at,
    disputedBy: row.disputed_by,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    outcomeReason: row.outcome_reason,
    holdReason: row.hold_reason,
  };
}

/** Map a snake_case settlement_runs row + reviews to the camelCase run object. */
export function _rowToRun(row, reviewRows = []) {
  if (!row) return null;
  const branchReviews = {};
  for (const r of reviewRows) {
    branchReviews[r.branch_id] = {
      state: r.state,
      reviewedBy: r.reviewed_by ?? null,
      reviewedAt: r.reviewed_at ?? null,
      releasedAt: r.released_at ?? null,
    };
  }
  return {
    id: row.id,
    cadence: row.cadence,
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    state: row.state,
    totalAmount: Number(row.total_amount ?? 0),
    commissionCount: row.commission_count ?? 0,
    branchReviews,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    notes: row.notes ?? '',
  };
}

/**
 * Derive UI summary fields on top of a run object (matches the shape the
 * legacy JS exposed via _runWithDerivedFields). `lines` is the full set of
 * commission rows attached to the run (already mapped to camelCase).
 */
export function _enrichRun(run, lines = []) {
  if (!run) return null;
  const reviews = Object.values(run.branchReviews || {});
  const approvedCount = reviews.filter((r) => r.state === 'approved').length;
  const pendingCount = reviews.filter((r) => r.state === 'pending').length;
  const releasedCount = reviews.filter((r) => r.state === 'released').length;

  const approvedBranchIds = new Set(
    Object.entries(run.branchReviews || {})
      .filter(([, r]) => r.state === 'approved')
      .map(([bid]) => bid)
  );
  const distinctAgents = new Set();
  let approvedAmount = 0;
  for (const c of lines) {
    if (c.agentId) distinctAgents.add(c.agentId);
    if (c.status === 'in_run' && approvedBranchIds.has(c.branchId)) {
      approvedAmount += c.amount;
    }
  }

  return {
    ...run,
    branchCount: reviews.length,
    branchApprovedCount: approvedCount,
    branchPendingCount: pendingCount,
    branchReleasedCount: releasedCount,
    agentCount: distinctAgents.size,
    approvedAmount,
    canReleaseAny: run.state === 'branch_review' && approvedCount > 0,
  };
}
