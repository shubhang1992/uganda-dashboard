# Universal Pensions Uganda — Data Model

> This document describes every entity in the system, their fields, relationships, and business rules.
> Fields are classified as **Stored** (persisted in DB), **Derived** (computed from other data), **Aggregated** (rolled up from children), or **Mock-only** (prototype artifact).

---

## Entity Hierarchy

```
Country (Uganda)
└── Distributor (1 — national singleton, d-001)
    └── Region (4)
        └── District (136)
            └── Branch (~316)
                └── Agent (~2,049)
                    └── Subscriber (~5,000)
```

Each entity references its parent via `parentId`. Metrics roll up from subscriber → agent → branch → district → region → distributor → country. The Distributor tier was introduced in migration `0016_distributors_table.sql` to give the network operator its own row + RLS surface; on the geographic side it sits *between* Country and Region but acts as a pass-through for aggregation today (single row, `parentId = "ug"`).

---

## Country

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Always `"ug"` |
| name | string | Stored | Always `"Uganda"` |
| center | [number, number] | Stored | Map coordinates `[32.3, 1.4]` (lng, lat) |
| metrics | Metrics | Aggregated | Rolled up from all regions. See [Metrics Object](#metrics-object) |

### Relationships
- Parent: none (root entity)
- Children: Region (4)

### Business Rules
- Single-country deployment. If multi-country support is needed, this becomes a lookup.
- `metrics.totalBranches` is set to total count of all branches (not summed from children).

---

## Distributor

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `d-{seq}`; today only `d-001` |
| name | string | Stored | Distributor name (`"Universal Pensions Uganda — National"`) |
| parentId | string | Stored | Always `"ug"` (the Country) |
| managerName | string | Stored | National operations lead |
| managerEmail | string | Stored | Contact email |
| managerPhone | string | Stored | Ugandan phone (+256 prefix) |
| status | string | Stored | `"active"` (default) |
| createdAt | timestamptz | Stored | Row creation timestamp |
| updatedAt | timestamptz | Stored | Last update timestamp |
| metrics | Metrics | Aggregated | Rolled up from the full network — see [Aggregation Rules](#aggregation-rules) |

### Relationships
- Parent: Country (`"ug"`)
- Children: Regions (4) — geographic; today the singleton owns the entire network so this is equivalent to "the whole tree below Country"

### Business Rules
- **National singleton.** The seed ships exactly one row (`d-001`). The schema permits multiple distributors so the table can grow into a multi-distributor model without migration churn.
- **Metrics.** `useDistributorMetrics()` returns `{ totalSubscribers, totalAgents, totalBranches, aum }` derived from `getAllAtLevel('subscriber' | 'agent' | 'branch')` + a `subscriber_balances` aggregate. Mock fallback returns `aum: 0` plus an `aumNote` string.
- **RLS.** Read-across-levels via `distributors_select USING (true)` (every authenticated role can read the singleton — used for "Operated by …" attribution surfaces). Self-update via `distributors_update_self USING (auth.jwt() ->> 'distributorId' = id)` — only the distributor role may update, and only against its own row. See `docs/role-permissions.md` and `BACKEND.md §8`.

---

## Region

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `r-{name}` (e.g., `r-central`) |
| name | string | Stored | Region name (Central, Eastern, Northern, Western) |
| parentId | string | Stored | Always `"ug"` |
| center | [number, number] | Stored | Map centroid coordinates |
| metrics | Metrics | Aggregated | Rolled up from child districts |

### Relationships
- Parent: Country (`"ug"`)
- Children: District (26-44 per region)

### Enums
- name: `Central` | `Eastern` | `Northern` | `Western`

### Business Rules
- Regions are static — aligned to Uganda's 4 statistical regions.
- `metrics.totalBranches` = sum of child districts' `totalBranches`.

---

## District

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `d-{name}` (e.g., `d-kampala`) |
| name | string | Stored | Official GADM district name (136 real Ugandan districts) |
| parentId | string | Stored | Region ID |
| center | [number, number] | Stored | Map centroid coordinates |
| active | boolean | Stored | Always `true` in mock |
| metrics | Metrics | Aggregated | Rolled up from child branches |

### Relationships
- Parent: Region
- Children: Branch (2-8 per district)

### Business Rules
- `metrics.totalBranches` = count of direct child branches.
- District names match Uganda GADM dataset for GeoJSON mapping.

---

## Branch

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `b-{district-prefix}-{seq}` (e.g., `b-kam-015`) |
| name | string | Stored | Branch name (e.g., "Kampala Central") |
| districtId | string | Stored | District ID (same as `parentId`) |
| parentId | string | Stored | District ID |
| center | [number, number] | Stored | Map coordinates (near district center) |
| managerName | string | Stored | Branch admin's full name |
| managerPhone | string | Stored | Ugandan phone (+256 prefix) |
| managerEmail | string | Stored | Email derived from manager name |
| status | string | Stored | `"active"` (90%) or `"inactive"` (10%) |
| score | number | Derived | Branch health score 0-100. See [Branch Health Score](#branch-health-score) |
| rank | number | Derived | Global rank by score (1 = best) |
| districtRank | number | Derived | Rank within district by score (1 = best) |
| districtBranchCount | number | Derived | Total branches in same district |
| metrics | Metrics | Aggregated | Rolled up from child agents |

### Relationships
- Parent: District
- Children: Agent (5-8 per branch)

### Enums
- status: `active` | `inactive`

### Business Rules
- **Branch Health Score** — MOCK APPROXIMATION. See dedicated section below.
- Global ranking sorts all branches by score descending, assigns rank 1..N.
- District ranking sorts branches within same district by score.
- `createBranch` endpoint should create a branch with `status: 'active'` and `metrics: null`.
- UNCLEAR — confirm with product team: Is branch.status manually set by admin, or derived from activity?

---

## Agent

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `a-{seq}` (e.g., `a-001`) |
| name | string | Stored | Full name (Ugandan names) |
| gender | string | Stored | `"male"` or `"female"` |
| parentId | string | Stored | Branch ID |
| center | [number, number] | Mock-only | Jittered from branch center ±0.02. In production, agent location may come from GPS or be omitted |
| phone | string | Stored | Ugandan phone (+256 prefix) |
| rating | number | Derived | 3.0-5.0 scale. Formula: `min(5, round((performance / 22 + rand * 0.4) * 10) / 10)` — MOCK APPROXIMATION |
| performance | number | Derived | 0-100 score. Formula: `min(100, activeRate * 0.4 + min(totalSubs/20, 1) * 30 + randInt(15,30))` — MOCK APPROXIMATION |
| status | string | Stored | `"active"` (80%) or `"inactive"` (20%) |
| metrics | Metrics | Aggregated | Computed from child subscribers |

### Relationships
- Parent: Branch
- Children: Subscriber (~60 per agent)
- References: Commission (many commissions reference this agent)

### Enums
- status: `active` | `inactive`
- gender: `male` | `female`

### Business Rules
- **Performance score** — MOCK APPROXIMATION. Uses `activeRate * 0.4 + subscriber_volume_factor * 30 + random_component`. In production, define clear performance criteria.
- **Rating** — MOCK APPROXIMATION. Derived from performance with random variance. In production, this could be manager-assigned or calculated from KPIs.
- `center` coordinates are mock-only (jittered from branch). Production agents may not need map coordinates.
- UNCLEAR — confirm with product team: Can an agent belong to multiple branches? Current model assumes 1:1.

---

## Subscriber

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `s-{seq}` (e.g., `s-0001`) |
| name | string | Stored | Full name (Ugandan names) |
| email | string | Stored | Email address |
| phone | string | Stored | Ugandan phone (+256 prefix) |
| gender | string | Stored | `"male"`, `"female"`, or `"other"` |
| age | number | Stored | Age in years (18-70) |
| parentId | string | Stored | Agent ID |
| kycStatus | string | Stored | KYC verification status |
| isActive | boolean | Stored | Whether subscriber is currently contributing |
| contributionHistory | number[] | Stored | Array of 12 monthly contribution amounts (UGX). Index 0 = oldest month, 11 = most recent |
| totalContributions | number | Derived | Sum of `contributionHistory` |
| totalWithdrawals | number | Stored | Total withdrawn (0-15% of totalContributions in mock) |
| registeredDate | string | Stored | ISO date `YYYY-MM-DD`. Distribution: 25% in 2024, 45% in 2025, 30% in 2026 Jan-Mar |
| productsHeld | string[] | Stored | 1-3 pension products held |

### Relationships
- Parent: Agent
- References: Commission (subscriber's first contribution triggers a commission)

### Enums
- gender: `male` | `female` | `other`
- kycStatus: `complete` | `pending` | `incomplete`
- productsHeld items: `SavePlus` | `PensionBasic` | `PensionPremium` | `EducationSaver` | `HealthCover`

### Business Rules
- **Contribution history** = 12-month array. Base amount 5,000-50,000 UGX, grows by ~2% monthly for active subscribers, declines by ~5% for inactive.
- **Total contributions** = sum of contribution history. UNCLEAR — confirm: is this lifetime total or just last 12 months?
- **Withdrawals** = 0-15% of total contributions. MOCK APPROXIMATION — real withdrawal flow TBD.
- **KYC distribution** in mock: ~70% complete, ~20% pending, ~10% incomplete.
- **Age distribution** (weighted): 18-25 (2x), 26-35 (4x), 36-45 (3x), 46-55 (2x), 56-70 (1x).
- **Active status** in mock: 60-95% probability per subscriber. UNCLEAR — confirm: what defines "active" in production? (contributing in last N months?)
- **Products** are multi-hold — subscriber can hold 1-3 products simultaneously.

---

## Employer

> A B2B account (migration `0034`). The Employer owns a **standalone** staff roster (`employees`) that sits **outside** the agent→subscriber hierarchy — employees are NOT subscribers, are not in `transactions`/`subscriber_balances`, and generate **no agent commissions**. Scoped by the `employerId` JWT claim.

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `emp-{seq}`; today only `emp-001` |
| name | string | Stored | Company name (`"Nile Breweries Demo Ltd"`) |
| sector | string | Stored | Industry sector (e.g. `"Manufacturing"`) |
| registrationNo | string | Stored | Company registration number |
| contactName / contactPhone / contactEmail | string | Stored | Primary HR/admin contact |
| district | string | Stored | Operating district |
| payrollCadence | string | Stored | `"monthly"` \| `"weekly"` \| … |
| defaultContributionConfig | object (JSONB) | Stored | The template a new run starts from. Shape `{ mode, matchPct, maxContribution }` (co-contribution) or `{ mode, employerPct }` (employer-only), plus company-wide group-insurance fields `insuranceEnabled` (boolean) + `groupCoverAmount` that apply to **both** modes — see [Contribution Config shape](#contribution-config-shape) |
| createdAt / updatedAt | timestamptz | Stored | Row timestamps (`updated_at` maintained inline by the `0035` RPCs — no shared trigger) |

### Relationships
- Children: Employee (the staff roster), Contribution Run (the funding history)

### Business Rules
- **National singleton today.** The demo seeds exactly one employer (`emp-001`). Demo login phone `EMPLOYER_DEMO_PHONE` (`+256700000031`) resolves to it via `demo_personas`; any other phone on the `employer` role falls back to `emp-001`.
- **No employer health score.** Unlike a Branch, the Employer has **no derived health/scheme-health score**. The funder-redesign removed the scheme-health gauge / participation composite from the Overview hero (an employer is a funder, not a sales line); there is no `score` field and no formula. The hero now leads with total contributions + funder tiles + a monthly **standing** gauge — the employer's peer **rank** shown in the Branch score-gauge language (still a rank, NOT a re-introduced health composite); the old recent-runs bar-trend was removed — see `FRONTEND.md §9.5`.
- **Group life insurance.** Group insurance is now a company-wide TRUE/FALSE config (`insuranceEnabled` in `defaultContributionConfig`), set via **Settings → Default config** and **independent of the funding mode** (previously it was only available in `employer-only` mode). Saving syncs the roster through the `apply_group_insurance` RPC (`0039`) on **every save**: when cover `> 0` it activates **flat group life cover for the whole roster** — every owned employee's `insuranceCover` is set to the flat amount, `insuranceStatus` derives from it (`>0 → active`, `0 → inactive`), and `insurancePremiumMonthly` is zeroed (employer-included); a `0` cover clears it (switches group cover off). The per-employee insurance editor still applies individual overrides afterwards. `0039` is **applied to the live Singapore DB** (cutover 2026-06-05).
- **Pending KYC surfacing.** The Overview hero surfaces each member's `kycStatus` (already a `subscribers` column) as a **"Pending KYC"** count + a nudge panel (`PendingKyc`); pending = `kycStatus` in (`pending`, `incomplete`). A few demo staff (Mary Auma, Diana Nabirye, Juliet Akello) are seeded `pending`.
- **RLS.** `employer_self_select USING (app_role='employer' AND id = auth.jwt() ->> 'employerId')`. Profile updates via `update_employer_profile` (own row only). See `BACKEND.md §8`/§10.1.

---

## Employee

> The employer's standalone staff roster (`employees`, migration `0034`). **NOT a subscriber** — pension balances live on THIS row (not `subscriber_balances`), and the per-employee contribution ledger is `contribution_run_lines` (not `transactions`). There is intentionally no contribution trigger on this table; `submit_contribution_run` writes balances inline.

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `empe-{seq}` (e.g. `empe-001`) |
| employerId | string | Stored | FK → `employers(id) ON DELETE CASCADE` |
| name / phone / email | string | Stored | Identity |
| gender | string | Stored | `"male"` \| `"female"` \| `"other"` |
| age | number | Stored | Age in years |
| nin | string | Stored | National ID number |
| jobTitle | string | Stored | Role/title |
| salary | number | Stored | Monthly gross (UGX) — the basis for legacy/employer-only percentage run math |
| monthlyContribution | number | Stored | The employee's OWN monthly saving (UGX) — the base the **co-contribution employer match** is computed against. Added by migration `0037` (snake_case `monthly_contribution`; **applied to the live Singapore DB** at the 2026-06-05 cutover) |
| status | string | Stored | `"active"` \| `"suspended"`. Suspended employees are **skipped** by `submit_contribution_run` |
| joinedDate | date | Stored | Date the employee joined |
| contributionConfig | object (JSONB) | Stored | Per-employee funding mode. Shape `{ mode, matchPct, maxContribution }` (co-contribution) or `{ mode, employerPct, groupCoverAmount }` (employer-only) — see below |
| contributionSchedule | object (JSONB) | Stored | Retirement/emergency split `{ retirementPct, emergencyPct }` (r+e = 100; default 80/20). Mirrors `contribution_schedules` for subscribers |
| retirementBalance | number | Stored | Pension (long-term) balance — bumped inline by each run |
| emergencyBalance | number | Stored | Emergency (short-term) balance — bumped inline by each run |
| netBalance | number | Stored | `retirementBalance + emergencyBalance` |
| unitsHeld | number | Stored | `netBalance / 1000` (UGX 1,000/unit — same as the subscriber contribution trigger) |
| totalContributions | number | Stored | Lifetime gross funded |
| insuranceCover | number | Stored | Sum assured (UGX); `0` = no cover |
| insurancePremiumMonthly | number | Stored | Monthly premium (UGX) |
| insuranceStatus | string | Stored | `"active"` \| `"inactive"` (derives from cover via `update_employee_insurance`) |
| insuranceRenewalDate | date \| null | Stored | Renewal date |
| nominees | array (JSONB) | Stored | Beneficiaries |
| createdAt / updatedAt | timestamptz | Stored | Row timestamps |

### Relationships
- Parent: Employer
- Referenced by: Contribution Run Line (the per-employee ledger)

### Enums
- status: `active` | `suspended`
- contributionConfig.mode: `co-contribution` | `employer-only`
- insuranceStatus: `active` | `inactive`

### Business Rules
- **Employer-roster balance model.** Unlike subscribers, an employee's balances live on the `employees` row and are updated **inline** by `submit_contribution_run` (no trigger, no `subscriber_balances`, no `transactions` row). `net = retirement + emergency`, `units = net / 1000`.
- **No commissions.** A run never creates a `commissions` row — employees are outside the agent hierarchy.
- **RLS.** `employees_by_employer_select USING (app_role='employer' AND employer_id = auth.jwt() ->> 'employerId')`. Config + insurance edits go through `update_employee_contribution_config` / `update_employee_insurance` (ownership-checked).

#### Contribution Config shape

`contribution_config` (per-employee) and `default_contribution_config` (employer-level template) share one JSONB shape, with two `mode` variants (funder-redesign — `0038`):

```jsonc
// co-contribution: the employer MATCHES a % of the employee's own monthly saving
{
  "mode": "co-contribution",
  "matchPct": 50,             // employer matches this % of the employee's monthlyContribution
  "maxContribution": 80000    // optional UGX cap on the employer top-up; null/'' = uncapped
}

// employer-only: employer funds a % of salary
{
  "mode": "employer-only",
  "employerPct": 8            // % of salary funded by the employer
}

// group insurance is a company-wide TRUE/FALSE config carried on
// default_contribution_config alongside the mode fields above (BOTH modes —
// it is independent of the funding mode; see Business Rules)
{
  "insuranceEnabled": true,   // company-wide group life on/off
  "groupCoverAmount": 5000000 // flat group life cover (UGX) applied roster-wide via apply_group_insurance
}
```

**Match formula (co-contribution, `0038`)** — re-derived server-side per run (client amounts are advisory):
`employee_half = round(monthlyContribution)` (the employee's own saving);
`employer_half = round(employee_half * matchPct / 100)`, then `min(employer_half, round(maxContribution))` when the cap is set;
`gross = employer_half + employee_half`; split by `contributionSchedule` (`retirement = round(gross * retirementPct/100)`, `emergency = gross − retirement`).

**Employer-only** is unchanged: `employer_half = employerAmount ?? round(salary * employerPct / 100)`, `employee_half = 0`.

**Dual-read legacy fallback.** A `co-contribution` row carrying the OLD keys (`employerPct`/`employeePct`, no `matchPct`) falls back to the pre-redesign salary-based math (`employer_half = employerAmount ?? round(salary*employerPct/100)`, `employee_half = employeeAmount ?? round(salary*employeePct/100)`) so an un-migrated live row never zeroes out during cutover. Both `0037` (`monthlyContribution` column) and `0038` (the match-model RPC body) are now **applied to the live Singapore DB** (cutover 2026-06-05). The dual-read fallback remains for any legacy rows that predate the column.

#### Contribution Schedule shape

```jsonc
{ "retirementPct": 80, "emergencyPct": 20 }   // r + e = 100; default 80/20
```

---

## Contribution Run

> One funding batch (`contribution_runs`, migration `0034`). Created by `submit_contribution_run` (or seeded as history). Nonce-idempotent via the RPC-internal `contribution_run_uploads` ledger.

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `run-{seq}` / `run-{uuid}` |
| employerId | string | Stored | FK → `employers(id) ON DELETE CASCADE` |
| periodLabel | string | Stored | e.g. `"April 2026"`, `"Q2 2026"` |
| status | string | Stored | `"draft"` \| `"completed"` (seeded + RPC runs are `completed`) |
| employerTotal | number | Stored | Sum of all line `employerAmount`s |
| employeeTotal | number | Stored | Sum of all line `employeeAmount`s |
| grandTotal | number | Stored | `employerTotal + employeeTotal` |
| runAt | timestamptz | Stored | When the run executed |
| createdAt | timestamptz | Stored | Row timestamp |

### Relationships
- Parent: Employer
- Children: Contribution Run Line (one per funded employee)

### Enums
- status: `draft` | `completed`

---

## Contribution Run Line

> The per-employee line inside a run (`contribution_run_lines`, migration `0034`). **Doubles as the employee's contribution ledger** — employees are not in `transactions`. RLS-scoped via an EXISTS join to the parent run.

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `crl-{…}` |
| runId | string | Stored | FK → `contribution_runs(id) ON DELETE CASCADE` |
| employeeId | string | Stored | FK → `employees(id) ON DELETE CASCADE` |
| employerAmount | number | Stored | Employer half (UGX) |
| employeeAmount | number | Stored | Employee half (UGX; `0` in employer-only mode) |
| retirementAmount | number | Stored | Retirement split of the gross |
| emergencyAmount | number | Stored | Emergency split (`gross − retirement`) |
| method | string | Stored | `"Bank transfer"` \| `"MTN Mobile Money"` \| … |

### Relationships
- References: Contribution Run (runId), Employee (employeeId)

---

## Commission

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `c-{seq}` (e.g., `c-00001`) |
| agentId | string | Stored | Agent who onboarded the subscriber |
| branchId | string | Stored | Branch of the agent (denormalized for fast lookups) |
| subscriberId | string | Stored | Subscriber whose first contribution triggered this |
| subscriberName | string | Stored | Denormalized subscriber name |
| amount | number | Stored | Commission amount in UGX. Fixed at the configured flat rate-per-subscriber |
| status | string | Stored | Commission status — `due` or `paid` |
| firstContributionDate | string | Stored | ISO date — when subscriber made first contribution |
| dueDate | string | Stored | ISO date — `firstContributionDate + 30 days` |
| paidDate | string \| null | Stored | ISO date — when commission was settled. Null if still `due` |
| paidAmount | number \| null | Stored | Whole-UGX amount paid for **this line** — its own `amount`, set by `apply_settlement` when FIFO allocation covers it (migration `0032`). Null if still `due`. `SUM(paidAmount)` across an agent's settled lines reconciles with the matching `settlement_batches.paidAmount`. |
| txnRef | string \| null | Stored | Payment reference captured from the settlement upload. Null if still `due` |

> The old maker-checker / dispute columns (`agentConfirmed`, `settlementRequested`, `disputeReason`, and the run/hold/resolve fields) were removed in migration `0029_commission_simplify.sql`. `paidAmount` + `txnRef` replace them.
>
> **0032 (settlement-apply fix):** `paidAmount` is now the **per-line** amount (the line's own `amount`), not the whole-batch total stamped on every line. A partial payment settles only the oldest lines it fully covers (FIFO); the rest stay `due` — INFORM-NOT-BLOCK, see `BACKEND.md §11`.

### Relationships
- References: Agent (agentId), Branch (branchId), Subscriber (subscriberId)

### Enums
- status: `due` | `paid` (collapsed from 7 states in `0029`)

### Commission State Machine

```
Subscriber registers
        |
        v
First contribution made
        |
        v
Commission created ---------> status: "due"
        |                        |
        |                        |---> Distributor pays offline, then uploads the
        |                        |     filled settlement template (apply_settlement RPC)
        |                        |     v
        |                        |     status: "paid"
        |                        |     paidDate / paidAmount / txnRef set
        |                        |     + settlement_batches row recorded
        |                        |     + agent & branch notified (commission_settled)
```

### Business Rules
- **Trigger**: Commission is created when a subscriber makes their first contribution.
- **Amount**: Flat fee per subscriber. Configurable via the commission rate (see Commission Configuration below).
- **Due date**: `firstContributionDate + 30 days`.
- **Settlement**: The distributor pays agents offline, then downloads a per-agent Excel template prefilled with pending dues, fills in Amount Paid + payment reference/date, and re-uploads it. `apply_settlement` (0032) allocates the whole-UGX-rounded Amount Paid **FIFO** across the agent's `due` lines oldest-first — a line flips to `paid` only while the budget covers it in full. There is no branch review, no holds, no agent confirmation, and no scheduled cadence.
- **Partial payment (INFORM-NOT-BLOCK)**: when Amount Paid is less than the agent's due total, only the lines it covers settle; the rest stay genuinely `due`. The distributor sees the mismatch before confirming (not blocked); the agent sees an "Ask for reason" banner on a short-paid settlement.
- **Money**: all settlement amounts are whole UGX (zero-decimal). The upload parser (`parseAmount`) and the RPC both round.
- **Idempotency**: each upload carries a per-upload nonce; a re-submit / reload replay returns the original result without duplicating batches or notifications (`settlement_uploads` ledger, 0032).
- **No dispute flow**: disputes were removed in the 0029 simplification — `paid` is terminal and `due → paid` is the only transition.
- **Notifications**: each settlement emits an in-app `commission_settled` notification (formatted body — thousands separators, correct pluralization) to the affected agent + branch.

### Pre-indexed Lookups
The service layer maintains two index maps for O(1) access:
- `commissionsByAgent`: `{ agentId -> Commission[] }`
- `commissionsByBranch`: `{ branchId -> Commission[] }`

---

## Commission Configuration

| Field | Type | Description |
|-------|------|-------------|
| ratePerSubscriber | number | Commission amount per subscriber's first contribution. Maps to `commission_config.rate` |

This is mutable at runtime via `setCommissionRate()`; commissions auto-generate as `due` at this rate on a subscriber's first contribution. The legacy `cadence` / `next_run_date` columns remain on the singleton row but are no longer read (settlement is upload-driven, not scheduled — see `0029_commission_simplify.sql`).

---

## Settlement Batch

One row recorded by `apply_settlement` each time the distributor's settlement upload settles an agent (table `settlement_batches`, migration `0030`; `clientNonce` added in `0032`). SELECT-only — distributor reads all; branch/agent read own.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Batch id |
| agentId | string | Agent settled |
| branchId | string | Agent's branch |
| pendingTotal | number | Total that was outstanding (`due`) for the agent when the batch ran |
| paidAmount | number | The **actually-allocated** total — sum of the FIFO-settled lines' own amounts (≤ the entered Amount Paid when a partial payment can't fully cover a line). Reconciles with `SUM(commissions.paidAmount)` for this batch. |
| txnRef | string | Payment reference from the upload |
| paidDate | string | ISO date of the offline payment |
| lineCount | number | Number of commission lines actually settled in this batch |
| createdAt | string | ISO timestamp |
| clientNonce | string \| null | Per-upload idempotency key (0032). Null for legacy 0031 batches. |

---

## Settlement Upload (idempotency ledger)

RPC-internal table (`settlement_uploads`, migration `0032`) backing the `apply_settlement` idempotency guard. **Not** read directly by any service — RLS-forced with no policies/grants; only the DEFINER RPC touches it.

| Field | Type | Description |
|-------|------|-------------|
| nonce | string | Per-upload idempotency key (PK). A replayed nonce short-circuits the RPC. |
| result | object | The JSONB result the RPC returned the first time (`{ agentsSettled, linesSettled, totalPaid, skipped }`) |
| createdAt | string | ISO timestamp |

---

## Notification

In-app feed row (table `notifications`, migration `0031`). SELECT-only — agent/branch read own; distributor reads all. Written by `apply_settlement`; cleared via `mark_notifications_read`.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Notification id |
| recipientRole | string | `agent` or `branch` |
| recipientId | string | Agent or branch id |
| type | string | `commission_settled` (only type today) |
| title | string | Display title |
| body | string | Display body |
| amount | number \| null | Settled amount, if relevant |
| refId | string \| null | Related ref (e.g. settlement batch id) |
| isRead | boolean | Whether the recipient has read it |
| createdAt | string | ISO timestamp |

---

## User / Auth Session

### Fields (stored in localStorage as `upensions_auth`)
| Field | Type | Description |
|-------|------|-------------|
| role | string | User role |
| phone | string | Phone number used for login |
| name | string | Display name (currently hardcoded "Demo User") |
| branchId | string \| undefined | Only present for `branch` role. Set to specific branch ID on login |
| agentId / distributorId / subscriberId | string \| undefined | Role-scoped entity ID, present for the matching role (from the JWT claim) |
| employerId | string \| undefined | Only present for `employer` role. The `employerId` JWT claim; scopes the employer dashboard |

### Auth Flow
1. User selects role, enters phone, receives OTP (any 6-digit code accepted in mock)
2. `verifyOtp` returns `{ token, user: { phone, role, name } }`
3. For Branch Admin: `branchId: 'b-kam-015'` is injected client-side at login
4. Token stored in `localStorage` as `upensions_token`
5. Session object stored in `localStorage` as `upensions_auth`

### Enums
- role: `subscriber` | `employer` | `distributor` | `branch` | `agent` | `admin`

### Business Rules
- Five of six roles have dashboard access (`hasDashboard()` / `DASHBOARD_ROLES = ['distributor','branch','subscriber','agent','employer']`); only `admin` is deferred.
- The backend returns the role-scoped ID (`branchId` / `agentId` / `distributorId` / `subscriberId` / `employerId`) as a JWT claim + in the auth response; the client no longer injects it.
- UNCLEAR — confirm: Should a distributor admin be scoped to a specific distributor entity, or always see the full network?

---

## Metrics Object

The Metrics object is shared across Country, Region, District, Branch, and Agent entities. It contains subscriber counts, financial totals, activity metrics, and demographic breakdowns.

### Core Metrics
| Field | Type | Levels | Storage | Description |
|-------|------|--------|---------|-------------|
| totalSubscribers | number | All | Aggregated | Count of all subscribers under this entity |
| totalAgents | number | All | Aggregated | Count of all agents (always 1 at agent level) |
| totalBranches | number | District, Region, Country | Aggregated | Count of branches. Only set at district level and above |
| totalContributions | number | All | Aggregated | Sum of all subscriber `totalContributions` (UGX) |
| totalWithdrawals | number | All | Aggregated | Sum of all subscriber `totalWithdrawals` (UGX) |
| aum | number | All | Derived | Assets Under Management. At agent level: `totalContributions * (1.35 + rand * 0.2)`. Aggregated upward. MOCK APPROXIMATION — in production, AUM should come from the fund/investment system |
| activeSubscribers | number | All | Aggregated | Count of subscribers where `isActive = true` |
| activeRate | number | All | Derived | `round((activeSubscribers / totalSubscribers) * 100)`. Percentage 0-100 |
| coverageRate | number | All | Derived | At agent level: `min(95, activeRate * 0.75 + randInt(5, 20))`. Aggregated as weighted average. MOCK APPROXIMATION — unclear what "coverage" means in production |

### Monthly Contribution Trend
| Field | Type | Levels | Storage | Description |
|-------|------|--------|---------|-------------|
| monthlyContributions | number[12] | All | Aggregated | 12-month contribution amounts. Index 0 = oldest, 11 = most recent. Sum of all child entities' contribution histories |

### Period Activity Metrics
| Field | Type | Levels | Storage | Description |
|-------|------|--------|---------|-------------|
| newSubscribersToday | number | All | Derived/Aggregated | New subscribers registered today |
| prevNewSubscribersToday | number | All | Derived/Aggregated | Previous day's new subscribers (for trend comparison) |
| dailyContributions | number | All | Derived/Aggregated | Today's contribution total (UGX) |
| prevDailyContributions | number | All | Derived/Aggregated | Previous day's contributions |
| dailyWithdrawals | number | All | Derived/Aggregated | Today's withdrawal total |
| prevDailyWithdrawals | number | All | Derived/Aggregated | Previous day's withdrawals |
| newSubscribersThisWeek | number | All | Derived/Aggregated | New subscribers this week |
| prevNewSubscribersThisWeek | number | All | Derived/Aggregated | Previous week's new subscribers |
| weeklyContributions | number | All | Derived/Aggregated | This week's contributions |
| prevWeeklyContributions | number | All | Derived/Aggregated | Previous week's contributions |
| weeklyWithdrawals | number | All | Derived/Aggregated | This week's withdrawals |
| prevWeeklyWithdrawals | number | All | Derived/Aggregated | Previous week's withdrawals |
| newSubscribersThisMonth | number | All | Derived/Aggregated | New subscribers this month |
| prevNewSubscribersThisMonth | number | All | Derived/Aggregated | Previous month's new subscribers |
| monthlyWithdrawals | number | All | Derived/Aggregated | This month's withdrawals |
| prevMonthlyWithdrawals | number | All | Derived/Aggregated | Previous month's withdrawals |

### Demographics
| Field | Type | Levels | Storage | Description |
|-------|------|--------|---------|-------------|
| genderRatio | `{ male: number, female: number, other: number }` | All | Aggregated | At agent level: raw counts. At rollup: normalized to percentages summing to 100 |
| ageDistribution | `{ "18-25": number, "26-35": number, "36-45": number, "46-55": number, "56+": number }` | All | Aggregated | Raw subscriber counts per age bucket |

### KYC Tracking
| Field | Type | Levels | Storage | Description |
|-------|------|--------|---------|-------------|
| kycPending | number | All | Aggregated | Count of subscribers with `kycStatus: "pending"` |
| kycIncomplete | number | All | Aggregated | Count of subscribers with `kycStatus: "incomplete"` |

### Aggregation Rules
- **Agent level**: Metrics computed directly from subscriber data.
- **Branch level**: `addMetrics(branch, agent)` for each child agent, then `finalizeRates()`.
- **District level**: `addMetrics(district, branch)` for each child branch, then `finalizeRates()`.
- **Region level**: Same pattern from districts.
- **Distributor level**: National singleton (`d-001`). Today the rollup is computed by `getDistributorMetrics()` as a flat `Promise.all` of `getAllAtLevel('subscriber' | 'agent' | 'branch')` + a `subscriber_balances` AUM aggregate, rather than the recursive `addMetrics()` walk used by Region/Country — there is only one row and it owns the entire network, so the flat counts equal what a recursive walk would produce. The recursive `addMetrics()` pattern from Region applies when a multi-distributor seed lands.
- **Country level**: Same pattern from regions (equivalent to "the distributor singleton's view" today; remains separate so the country row stays a meaningful aggregation anchor).

`addMetrics()` sums all numeric fields. For rates:
- `activeRate` = tracked via `_activeCount` during aggregation, then `round((_activeCount / totalSubscribers) * 100)`.
- `coverageRate` = tracked via `_coverageWeighted` (weighted sum), then `round(_coverageWeighted / totalSubscribers)`.
- `genderRatio` = raw counts during aggregation, then normalized to percentages by `finalizeRates()` (male + female + other = 100%).

### Period Metric Derivation (Agent Level)
All period metrics at the agent level are MOCK APPROXIMATIONS derived with random variance:
- Monthly: `newSubscribersThisMonth = randInt(3-8% of totalSubscribers)`
- Weekly: `~1/4 of monthly with variance`
- Daily: `~1/7 of weekly with variance`
- "Previous" values: current value * random factor (0.7-1.2)

In production, these should come from actual time-series queries.

---

## Branch Health Score

**Classification: MOCK APPROXIMATION** — The formula exists in both `mockData.js` and `BranchHealthScore.jsx`. Confirm with product team whether this scoring model is the intended production algorithm.

### Formula
```
retentionRate = (activeSubscribers / totalSubscribers) * 100
avgPerSub = totalContributions / totalSubscribers
avgContribScore = min(100, (avgPerSub / 500,000) * 100)
agentActivity = (activeAgents / totalAgents) * 100
avgMonthlyGrowth = average of month-over-month % changes in monthlyContributions
growthScore = min(100, max(0, (avgMonthlyGrowth / 5) * 50 + 50))

score = round(
  retentionRate * 0.30 +
  avgContribScore * 0.25 +
  agentActivity * 0.25 +
  growthScore * 0.20
)
```

### Score Breakdown (displayed in UI)
| Dimension | Weight | Color |
|-----------|--------|-------|
| Retention | 30% | `#4ADE80` (green) |
| Avg Contribution | 25% | `#818CF8` (purple) |
| Agent Activity | 25% | `#2DD4BF` (teal) |
| Growth | 20% | `#FBBF24` (amber) |

### Score Labels
| Range | Label |
|-------|-------|
| 85-100 | Excellent |
| 70-84 | Good |
| 50-69 | Fair |
| 0-49 | Needs Attention |

### Ranking
- **Global rank**: All branches sorted by score descending. `rank = 1` is highest.
- **District rank**: Within-district sort. `districtRank = 1` is highest within district. `districtBranchCount` = total branches in that district.

---

## Utility Functions

### formatUGX(n)
Formats UGX amounts with short notation:
- >= 1B: `"UGX X.XB"`
- >= 1M: `"UGX X.XM"`
- >= 1K: `"UGX X.XK"`
- else: `"UGX X"`
- <= 0: `"---"`

### fmtShort(n)
Same as `formatUGX` but without the `"UGX "` prefix.

### getInitials(name)
First letter of each word, max 2 characters, uppercase.

### getTrend(today, weekAvg)
Returns `"up"` if today > avg * 1.15, `"down"` if today < avg * 0.85, else `"flat"`.

### perfLevel(pct)
Returns `"high"` if pct >= 75, `"mid"` if pct >= 55, else `"low"`.
