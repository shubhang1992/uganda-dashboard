# Universal Pensions Uganda — Data Model

> This document describes every entity in the system, their fields, relationships, and business rules.
> Fields are classified as **Stored** (persisted in DB), **Derived** (computed from other data), **Aggregated** (rolled up from children), or **Mock-only** (prototype artifact).

---

## Entity Hierarchy

```
Country (Uganda)
└── Region (4)
    └── District (135)
        └── Branch (~314)
            └── Agent (~500+)
                └── Subscriber (~30,000)
```

Each entity references its parent via `parentId`. Metrics roll up from subscriber → agent → branch → district → region → country.

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
| name | string | Stored | Official GADM district name (135 real Ugandan districts) |
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

## Commission

### Fields
| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| id | string | Stored | Format: `c-{seq}` (e.g., `c-00001`) |
| agentId | string | Stored | Agent who onboarded the subscriber |
| branchId | string | Stored | Branch of the agent (denormalized for fast lookups) |
| subscriberId | string | Stored | Subscriber whose first contribution triggered this |
| subscriberName | string | Stored | Denormalized subscriber name |
| amount | number | Stored | Commission amount in UGX. Currently fixed at `COMMISSION_CONFIG.ratePerSubscriber` (5,000 UGX) |
| status | string | Stored | Commission lifecycle status |
| firstContributionDate | string | Stored | ISO date — when subscriber made first contribution |
| dueDate | string | Stored | ISO date — `firstContributionDate + 30 days` |
| paidDate | string \| null | Stored | ISO date — when commission was paid. Null if not yet paid |
| agentConfirmed | boolean | Stored | Whether agent has confirmed receipt (maker-checker pattern) |
| settlementRequested | boolean | Stored | Whether agent has requested settlement (for "due" commissions) |
| disputeReason | string \| null | Stored | Reason for dispute. Null if not disputed |

### Relationships
- References: Agent (agentId), Branch (branchId), Subscriber (subscriberId)

### Enums
- status: `due` | `paid` | `disputed` | `rejected`
- disputeReason: `"Subscriber denies onboarding"` | `"Duplicate commission entry"` | `"Incorrect commission amount"` | `"Subscriber KYC incomplete"` | `"Agent ID mismatch"`

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
        |                        |---> Agent requests settlement
        |                        |     (settlementRequested = true)
        |                        |
        |                        |---> Distributor/Branch Admin settles
        |                        |     v
        |                        |     status: "paid"
        |                        |     paidDate set
        |                        |     agentConfirmed = false (pending)
        |                        |     v
        |                        |     Agent confirms receipt
        |                        |     agentConfirmed = true
        |                        |
        |                        \---> Disputed
        |                              v
        |                              status: "disputed"
        |                              disputeReason set
        |                              |
        |                              |---> Approved (dispute resolved)
        |                              |     v
        |                              |     status: "due" (re-enters settlement queue)
        |                              |     disputeReason = null
        |                              |
        |                              \---> Rejected (voided)
        |                                    v
        |                                    status: "rejected"
        |                                    settlementRequested = false
```

### Business Rules
- **Trigger**: Commission is created when a subscriber makes their first contribution.
- **Amount**: Flat fee per subscriber. Currently 5,000 UGX. Configurable via `COMMISSION_CONFIG.ratePerSubscriber`.
- **Due date**: `firstContributionDate + 30 days`.
- **Settlement**: Distributor or Branch Admin can settle individual commissions, all due commissions for an agent, or bulk settle.
- **Dispute flow**: Disputed commissions can be approved (back to "due") or rejected ("rejected", voided).
- **Agent confirmation**: `agentConfirmed` tracks whether agent acknowledged payment receipt. 85% confirmed in mock.
- **Settlement requests**: ~25% of "due" commissions have agent-initiated settlement requests.
- **Bulk operations**: Approve/reject multiple disputed commissions at once.
- UNCLEAR — confirm: Who can dispute a commission? Only the platform admin? Or can agents/subscribers raise disputes too?
- UNCLEAR — confirm: Is `rejected` a terminal state, or can rejected commissions be reopened?

### Pre-indexed Lookups
The service layer maintains two index maps for O(1) access:
- `commissionsByAgent`: `{ agentId -> Commission[] }`
- `commissionsByBranch`: `{ branchId -> Commission[] }`

---

## Commission Configuration

| Field | Type | Description |
|-------|------|-------------|
| ratePerSubscriber | number | Commission amount per subscriber's first contribution. Default: 5,000 UGX |

This is mutable at runtime via `setCommissionRate()`. In production, consider whether rate changes should apply retroactively or only to new commissions.

---

## User / Auth Session

### Fields (stored in localStorage as `upensions_auth`)
| Field | Type | Description |
|-------|------|-------------|
| role | string | User role |
| phone | string | Phone number used for login |
| name | string | Display name (currently hardcoded "Demo User") |
| branchId | string \| undefined | Only present for `branch` role. Set to specific branch ID on login |

### Auth Flow
1. User selects role, enters phone, receives OTP (any 6-digit code accepted in mock)
2. `verifyOtp` returns `{ token, user: { phone, role, name } }`
3. For Branch Admin: `branchId: 'b-kam-015'` is injected client-side at login
4. Token stored in `localStorage` as `upensions_token`
5. Session object stored in `localStorage` as `upensions_auth`

### Enums
- role: `subscriber` | `employer` | `distributor` | `branch` | `agent` | `admin`

### Business Rules
- Only `distributor` and `branch` roles currently have dashboard access (`hasDashboard()` check).
- In production, the backend should return `branchId` (and other scoping IDs) as part of the JWT claims or user profile.
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
- **Country level**: Same pattern from regions.

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
