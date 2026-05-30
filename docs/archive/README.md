# docs/archive — historical reference

This directory holds historical records of completed work. Nothing here documents currently-active code paths or guidelines; we keep these files around only so that incidents, fixes, and decisions can be traced back from git blame or commit messages.

## What's here

| File | Date | What it is |
|---|---|---|
| [`DASHBOARD_AUDIT.md`](./DASHBOARD_AUDIT.md) | 2026-04-30 | Pre-fix audit of the dashboard surface — 86 numbered findings grouped by severity. Every P0/P1 was either fixed (see `DASHBOARD_AUDIT_FIXES.md`) or deferred with explicit justification. |
| [`DASHBOARD_AUDIT_FIXES.md`](./DASHBOARD_AUDIT_FIXES.md) | 2026-04-30 | Companion to the audit above. Records which findings were fixed and which were deferred. |
| [`api-contracts-2024-original.md`](./api-contracts-2024-original.md) | 2024 | First-pass API contract before the route consolidation. The current canonical contract lives at [`../api-contracts.md`](../api-contracts.md). |

## When to consult these

- You're tracing an old commit message that references a finding (e.g., "P0-12" or "Audit item 23").
- You're researching whether something was intentionally left undone — `DASHBOARD_AUDIT_FIXES.md`'s "Deferred" section is the historical record.
- Otherwise: prefer the active docs. Current awareness items live in [`../../claude.md` §10b](../../claude.md). Active operational concerns live in [`../render-operational.md`](../render-operational.md).

## What does NOT belong here

- Active reference material — that goes in `docs/` at the parent level.
- Outdated content from active docs — fix the active doc instead; the prior version is recoverable from git history.
- TODO lists — those belong in the issue tracker.
