# Universal Pensions Uganda — Platform Specification

> This document provides a complete product specification for the Universal Pensions Uganda platform.
> It is written for backend developers who need to understand the full system without reading frontend code.
> Distinctions are made between **built** features, **planned** features, and **mock approximations** that need real business logic.

---

## 1. Product Overview

Universal Pensions is a digital long-term savings and pension platform designed to make retirement saving accessible for everyday people in Uganda. It targets informal workers, gig workers, farmers, and self-employed individuals who lack access to traditional employer-sponsored pension schemes.

### What the Platform Does
- Enables individuals (**subscribers**) to make regular pension contributions
- Provides a field distribution network (**agents** organized into **branches**) for in-person enrollment and collection
- Offers **employers** a way to manage employee pension contributions
- Gives **distributor admins** and **branch admins** visibility into network performance
- Tracks **commissions** paid to agents for subscriber onboarding
- Provides reporting, analytics, and AI-assisted insights across the network

### Business Model
- Subscribers contribute monthly amounts (5,000–50,000 UGX typical range)
- Contributions are invested, generating returns (AUM = contributions + investment growth)
- Agents earn a flat commission (currently 5,000 UGX) for each subscriber's first contribution
- The distributor network (branches + agents) handles field operations: enrollment, KYC, collection

### Currency
- All monetary values are in **Ugandan Shillings (UGX)**
- UGX is integer-only (no decimals)
- Display format: `UGX 1.2M`, `UGX 450K`, `UGX 5,000`

### Geography
- Single-country deployment: Uganda
- 4 regions: Central, Eastern, Northern, Western
- 135 districts (real GADM boundaries, GeoJSON in `/public/`)
- ~314 branches distributed across districts
- Map coordinates: longitude, latitude pairs

---

## 2. User Roles & Personas

### Subscriber
- **Real-world role:** Individual saver — informal worker, farmer, gig worker, self-employed
- **Why they use the platform:** Track savings, view contributions, monitor pension growth
- **Key needs:** Balance visibility, contribution history, progress tracking, simple UX
- **Status:** Dashboard planned (shows "Coming Soon")

### Employer
- **Real-world role:** Organization managing employee pension contributions
- **Why they use the platform:** Bulk contribution uploads, employee enrollment, compliance reporting
- **Key needs:** Employee management, CSV upload, clean reporting
- **Status:** Dashboard planned (shows "Coming Soon")

### Distributor Admin
- **Real-world role:** Network-level operations manager overseeing all branches and agents
- **Why they use the platform:** Monitor network health, track performance, manage commissions, generate reports
- **Key needs:** Network-wide visibility, branch/agent comparison, strategic reporting
- **Status:** **Fully built** — interactive map dashboard with drill-down, panels, reports

### Branch Admin
- **Real-world role:** Local operations manager supervising agents within a single branch
- **Why they use the platform:** Monitor branch performance, manage agents, settle commissions
- **Key needs:** Agent oversight, subscriber activity, commission management, local KPIs
- **Status:** **Fully built** — branch overview dashboard with health score, copilot, agent management

### Agent
- **Real-world role:** Field worker who enrolls subscribers and collects contributions
- **Why they use the platform:** Register subscribers, record collections, track commissions
- **Key needs:** Guided workflows, fast mobile actions, commission visibility
- **Status:** Dashboard planned (shows "Coming Soon")

### Platform Admin
- **Real-world role:** System administrator at head office
- **Why they use the platform:** Manage users, configure system, oversee everything
- **Key needs:** Full platform control, audit trail, user management
- **Status:** Dashboard planned (shows "Coming Soon")

---

## 3. Entity Hierarchy

```
Country (Uganda)
└── Region (4) — Central, Eastern, Northern, Western
    └── District (135) — real GADM administrative districts
        └── Branch (~314) — physical branch offices
            └── Agent (~500+) — field workers
                └── Subscriber (~30,000) — individual savers
```

### How the Hierarchy Works
- Each entity has a `parentId` linking to its parent
- Metrics aggregate bottom-up: subscriber data rolls up to agent → branch → district → region → country
- The distributor dashboard allows drill-down navigation through all levels
- The branch dashboard is fixed to a single branch (no hierarchy navigation)
- GeoJSON boundaries exist for districts and regions (used for map visualization)

### Real-World Mapping
| Level | Real World | Count | Notes |
|-------|-----------|-------|-------|
| Country | Uganda | 1 | Root entity |
| Region | Statistical region | 4 | Aligned to Uganda Bureau of Statistics regions |
| District | Administrative district | 135 | Real GADM names, used for GeoJSON map |
| Branch | Physical branch office | ~314 | 2-8 per district, more in urban areas |
| Agent | Field enrollment worker | ~500+ | 5-8 per branch |
| Subscriber | Individual pension saver | ~30,000 | ~60 per agent |

---

## 4. Core Workflows

### 4.1 Subscriber Enrollment

**Current state:** Mock data generates subscribers; no enrollment UI for agents yet.

**Intended flow:**
1. Agent meets potential subscriber in the field
2. Agent opens enrollment form on mobile device
3. Agent enters: name, phone (+256), email, gender, age, products to enroll in
4. System sends OTP to subscriber's phone for verification
5. Subscriber provides KYC documents (National ID, etc.)
6. KYC status starts as `pending`, moves to `complete` after verification or `incomplete` if docs are insufficient
7. Subscriber record is created under the agent's ID
8. Subscriber makes first contribution → triggers commission for the agent

**KYC Statuses:**
- `complete` — all documents verified (~70% in mock)
- `pending` — documents submitted, awaiting review (~20% in mock)
- `incomplete` — documents missing or rejected (~10% in mock)

### 4.2 Contribution Collection

**Current state:** Mock data generates contribution histories; no collection UI yet.

**Intended flow:**
1. Subscriber makes a monthly contribution (5,000–50,000 UGX typical)
2. Collection can happen via:
   - Agent in-person collection (agent records it in the app)
   - Mobile money transfer
   - Employer bulk upload (for employed subscribers)
3. Contribution is recorded in the subscriber's `contributionHistory` array (12-month rolling)
4. `totalContributions` = lifetime sum of all contributions
5. Metrics cascade upward through the hierarchy

**Contribution History Shape:**
- Array of 12 numbers representing monthly contribution amounts
- Index 0 = oldest month, index 11 = most recent month
- Active subscribers show ~2% monthly growth; inactive show ~5% decline (mock approximation)

**AUM Calculation:**
- MOCK APPROXIMATION: `AUM = totalContributions * (1.35 + random * 0.2)` — simulates 35-55% investment returns
- In production: AUM should come from the fund management / investment system
- AUM represents the total value of the subscriber's pension pot including investment returns

### 4.3 Commission Lifecycle

**Current state:** Fully built — commission creation, settlement, disputes, and bulk operations are all functional.

**Complete flow:**

```
1. Subscriber registers with an agent
2. Subscriber makes first contribution
   └── Commission created: status = "due"
       amount = COMMISSION_CONFIG.ratePerSubscriber (5,000 UGX)
       dueDate = firstContributionDate + 30 days
3. Commission enters settlement queue
   ├── Agent can request settlement (settlementRequested = true)
   ├── Distributor/Branch Admin can settle:
   │   └── status → "paid", paidDate set, agentConfirmed = false
   │       └── Agent confirms receipt: agentConfirmed = true
   └── Commission can be disputed:
       └── status → "disputed", disputeReason set
           ├── Admin approves dispute resolution:
           │   └── status → "due" (re-enters queue)
           └── Admin rejects:
               └── status → "rejected" (voided, permanent)
```

**Commission Rate:**
- Flat fee per subscriber: currently 5,000 UGX
- Configurable via `setCommissionRate()` — distributor admin can change it
- UNCLEAR — confirm: Should rate changes apply retroactively to existing "due" commissions?

**Settlement Operations:**
- Settle individual commission by ID
- Settle all due commissions for an agent
- Settle all due commissions (optionally scoped to branch)
- Bulk approve/reject multiple disputed commissions

**Dispute Reasons (5 predefined):**
1. Subscriber denies onboarding
2. Duplicate commission entry
3. Incorrect commission amount
4. Subscriber KYC incomplete
5. Agent ID mismatch

### 4.4 Withdrawal / Payout

**Current state:** Mock data generates withdrawal amounts; no withdrawal request UI exists.

**What the mock data shows:**
- `totalWithdrawals` = 0–15% of `totalContributions` (random)
- `monthlyWithdrawals`, `weeklyWithdrawals`, `dailyWithdrawals` metrics exist at all hierarchy levels
- Reports include: Withdrawals & Payouts report with withdrawal-to-contribution ratio

**Intended flow (inferred):**
1. Subscriber requests withdrawal via their dashboard (planned)
2. Request may require approval (by branch admin or platform admin — TBD)
3. Withdrawal is processed and `totalWithdrawals` is updated
4. Withdrawal reduces AUM

**UNCLEAR — confirm with product team:**
- What are the withdrawal eligibility rules? (age-based, term-based, emergency?)
- Is there a penalty for early withdrawal?
- Who approves withdrawals?
- What is the disbursement method?

### 4.5 Branch & Agent Onboarding

**Current state:** Both CreateBranch (distributor) and CreateAgent (branch admin) forms are built.

**Create Branch flow (Distributor Admin):**
1. Branch Details step: name, district (searchable), city/town (searchable with custom option), address, landmark (optional), P.O. Box (optional)
2. Admin Details step: admin name, phone (+256, 9 digits), email (optional)
3. Review step: summary of all fields
4. On confirm: branch created, SMS credentials sent to admin
5. Branch starts with `status: 'active'`, `metrics: null`

**Create Agent flow (Branch Admin):**
1. Agent Details step: full name, phone (+256, 9 digits), email (optional), gender (male/female), national ID number (optional)
2. Review step: summary of all fields
3. On confirm: agent created, SMS credentials sent to agent
4. Agent starts with `status: 'active'`, `metrics: null`

**Required fields for branch:** name, district, city/town, address, admin name, admin phone
**Required fields for agent:** full name, phone, gender

### 4.6 KYC Verification

**Current state:** KYC status exists as a field on subscribers; no verification UI is built.

**Statuses:**
| Status | Description | Distribution (mock) |
|--------|-------------|-------------------|
| complete | All documents verified and approved | ~70% |
| pending | Documents submitted, awaiting review | ~20% |
| incomplete | Documents missing or rejected | ~10% |

**Valid transitions:**
```
(new subscriber) → pending → complete
                 → pending → incomplete → pending (resubmit)
                 → incomplete (never submitted)
```

**What exists in the UI:**
- KYC status displayed in subscriber detail views
- KYC & Compliance report aggregates kycPending and kycIncomplete counts
- Alert badges show KYC issues in branch overview

**UNCLEAR — confirm:**
- What documents are required for KYC?
- Who performs verification? (Branch admin? Platform admin? Third-party service?)
- Is there a deadline for KYC completion?
- Can a subscriber contribute before KYC is complete?

### 4.7 Reporting

**Current state:** 11 reports are fully built with client-side sorting, pagination, and filtering.

**Report Catalog:**

| # | Report | Description | Scope |
|---|--------|-------------|-------|
| 1 | Distribution Summary | Network overview by region | Distributor only |
| 2 | All Branches | Directory of all branches with metrics | Distributor only |
| 3 | All Agents | Directory of all agents with performance | Both (branch-scoped) |
| 4 | All Subscribers | Directory of all subscribers | Both (branch-scoped) |
| 5 | Contributions & Collections | Contribution data by district/agent | Both |
| 6 | Withdrawals & Payouts | Withdrawal data with W/C ratios | Both |
| 7 | Branch Performance | Branch ranking and comparison | Distributor only |
| 8 | Agent Performance | Agent ranking with ratings | Both (branch-scoped) |
| 9 | Subscriber Growth | New subscriber trends | Both |
| 10 | Subscriber Demographics | Gender and age distribution | Both |
| 11 | KYC & Compliance | KYC completion rates | Both |

**Filtering capabilities:**
- Search (text): branches, agents, subscribers by name
- Region dropdown: filter by region
- Status: active/inactive
- KYC status: complete/pending/incomplete
- Gender: male/female/other

**Sorting:** All reports support column-based sorting (client-side). ReportTable component handles ascending/descending toggle.

**Pagination:** Client-side with page sizes 25, 50, 100. For subscribers (~30K), server-side pagination is required in production.

**Export:** Download button exists in TopBar but is a **placeholder** — no CSV export logic is implemented. Backend should provide CSV generation endpoints.

---

## 5. Business Rules

### Commission Rate
- **Type:** Flat fee per subscriber's first contribution
- **Default:** 5,000 UGX
- **Configurable:** Yes, by distributor admin via inline UI control
- **Scope:** Global — same rate for all agents
- UNCLEAR: Should different branches/agents have different rates?

### Branch Health Score
- **Classification:** MOCK APPROXIMATION — confirm if this formula should be the production algorithm
- **Formula:**
  ```
  score = retentionRate * 0.30
        + avgContribScore * 0.25
        + agentActivity * 0.25
        + growthScore * 0.20
  ```
- **Components:**
  - `retentionRate` = (activeSubscribers / totalSubscribers) * 100
  - `avgContribScore` = min(100, (avgContributionPerSubscriber / 500,000) * 100)
  - `agentActivity` = (activeAgents / totalAgents) * 100
  - `growthScore` = normalized average month-over-month contribution growth
- **Range:** 0–100
- **Labels:** Excellent (85+), Good (70-84), Fair (50-69), Needs Attention (0-49)

### Agent Performance Score
- **Classification:** MOCK APPROXIMATION
- **Formula:** `min(100, activeRate * 0.4 + min(totalSubs/20, 1) * 30 + randInt(15,30))`
- The random component means this is NOT a deterministic business rule — production should define clear criteria

### Agent Rating
- **Classification:** MOCK APPROXIMATION
- **Formula:** Derived from performance with random variance (3.0–5.0 scale)
- In production: could be manager-assigned or calculated from KPIs

### AUM (Assets Under Management)
- **Classification:** MOCK APPROXIMATION
- **Current:** `totalContributions * (1.35 + random * 0.2)` — simulates 35-55% returns
- In production: should come from the fund/investment management system

### Active Rate
- **Formula:** `round((activeSubscribers / totalSubscribers) * 100)`
- **"Active" definition (mock):** Random 60-95% probability per subscriber
- UNCLEAR: In production, what defines "active"? Contributing in last N months?

### Coverage Rate
- **Classification:** MOCK APPROXIMATION
- **Formula (agent level):** `min(95, activeRate * 0.75 + randInt(5, 20))`
- Aggregated as weighted average across hierarchy
- UNCLEAR: What does "coverage" mean in the real business? Geographic coverage? Product penetration?

### Growth Calculations
- **Month-over-month:** `((monthlyContributions[11] - monthlyContributions[10]) / monthlyContributions[10]) * 100`
- Used in: Branch health score, report trend indicators, period cards

---

## 6. Data Scoping Rules

### By Role
| Role | Can See | Can Modify |
|------|---------|------------|
| Distributor Admin | All entities at all levels | Create branches, settle/approve/reject commissions, set rates, own profile |
| Branch Admin | Own branch, own agents, own subscribers | Create agents, settle/approve/reject own branch's commissions, own profile |
| Agent (planned) | Own record, own subscribers, own commissions | Register subscribers, record collections, request settlement, confirm receipt |
| Subscriber (planned) | Own record only | Own profile, withdrawal requests |
| Employer (planned) | Own organization's employees | Employee management, bulk contributions |
| Admin (planned) | Everything | Everything (system configuration, user management) |

### Backend Enforcement
The frontend applies scoping via:
1. Role-based component rendering (different dashboard shells)
2. `branchId` prop passed to data hooks
3. `BranchScopeContext` providing scope to nested components
4. Report views checking `useBranchScope()` to filter data

**Critical:** The backend MUST enforce identical scoping. Frontend scoping is for UX, not security. Every API request should verify the authenticated user's role and scope against the requested resource.

---

## 7. Frontend Features Requiring Backend Support

| Feature | Current State | Backend Requirement |
|---------|--------------|-------------------|
| OTP Authentication | Mock (any code accepted) | Real SMS OTP service + JWT token issuance |
| Entity CRUD | Mock (in-memory) | REST API for all entity operations |
| Commission Settlement | Mock (in-memory mutations) | Transactional settlement with payment integration |
| Commission Disputes | Mock (status changes) | Dispute workflow with audit trail |
| AI Chat Assistant | Mock (keyword matching) | LLM integration (e.g., Claude API) with DB access |
| Search | Mock (client-side filter) | Server-side full-text search (Elasticsearch or PostgreSQL tsvector) |
| Report Export (CSV) | Placeholder button (no logic) | Server-side CSV generation with streaming for large datasets |
| Filter Dropdowns | Client-side filtering | Server-side filtering for reports with >500 rows |
| Subscriber Pagination | All 30K loaded in memory | Server-side pagination (page, pageSize, sort, filter params) |
| Map GeoJSON | Static files in /public/ | Could remain static or be served from API |
| Profile Update | No service function | PUT /api/profile endpoint |
| Password Change | No service function | PUT /api/profile/password endpoint |
| Real-time Activity Feed | Mock (generated from metrics) | WebSocket or polling for live events |
| Agent GPS Location | Mock (jittered from branch) | Real GPS from agent mobile app, or omit |
| Withdrawal Flow | No UI | Full workflow: request → approve → disburse |
| KYC Verification | Status field only | Document upload, verification queue, status transitions |
| Notification/SMS | Mentioned in UI ("credentials sent via SMS") | SMS gateway integration (e.g., Africa's Talking, Twilio) |

---

## 8. Technical Constraints

### Currency
- **UGX** — Ugandan Shillings, integer-only (no decimals)
- Store as integers in the database
- Frontend formatting: `formatUGX()` and `fmtShort()` in `src/utils/finance.js`

### Phone Numbers
- Format: `+256` followed by 9 digits
- Valid carrier prefixes: 70, 71, 74, 75, 76, 77, 78
- Frontend stores 9-digit number without prefix; displays with +256
- Input: `inputMode="numeric"`, validated for 9-digit length

### Date Format
- ISO 8601: `YYYY-MM-DD` (e.g., `2026-04-08`)
- Mock reference date: April 8, 2026 (used for commission status determination)
- Display: `toLocaleDateString('en-UG', { weekday, day, month, year })`

### GeoJSON
- District boundaries: `/public/uganda-districts.geojson` (135 districts, GADM source)
- Region boundaries: `/public/uganda-regions.geojson` (4 regions)
- Coordinates: longitude, latitude pairs
- Used for: Leaflet map rendering, choropleth coloring

### Authentication
- OTP-based login (6-digit codes)
- JWT token stored in `localStorage` as `upensions_token`
- User session stored in `localStorage` as `upensions_auth`
- Token sent as `Authorization: Bearer <token>` header
- 401 response triggers automatic logout + redirect to landing page
- API base URL configured via `API_BASE_URL` environment variable

### Frontend Stack
- React 19 + Vite 6
- React Router (URL-based navigation)
- TanStack React Query (caching, deduplication, stale-while-revalidate)
- Framer Motion (animations)
- CSS Modules (component-scoped styles)
- Leaflet (map)
- No Tailwind, no component library

### Data Access Pattern
```
Component → React Query Hook → Service Function → (currently mockData, future: API)
```
Only service files import from mockData. When the backend is ready, only service files change — hooks and components remain untouched.

---

## 9. Open Questions

These are things that could not be determined from the frontend code alone. The backend developer should confirm with the product team.

### Business Logic
1. **What defines an "active" subscriber?** Mock uses random probability. Production likely needs "contributed in last N months" or similar rule.
2. **What is "coverage rate"?** Mock derives it from active rate with random variance. Is it geographic coverage? Product penetration? Something else?
3. **Should commission rate changes apply retroactively?** The `setCommissionRate` function changes the global rate. Should existing "due" commissions use the old or new rate?
4. **Is the Branch Health Score formula the real one?** It's implemented in both mockData.js and BranchHealthScore.jsx with specific weights. Was this designed by product, or is it a prototype approximation?
5. **What are the withdrawal eligibility rules?** No withdrawal UI exists. Need: eligibility criteria, approval flow, disbursement method, penalties.
6. **Can subscribers contribute before KYC is complete?** Mock data doesn't enforce this. What's the policy?
7. **Is `rejected` a terminal state for commissions?** Can a rejected commission ever be reopened?

### Scoping & Multi-tenancy
8. **Should distributor admin be scoped to a specific distributor?** Currently sees the entire network. If multiple distributors exist, each should only see their own.
9. **Can an agent work across multiple branches?** Current model assumes 1 agent → 1 branch. Is cross-branch assignment possible?
10. **Are regions and districts editable?** Currently static data. Can admins create new districts or reassign branches between districts?

### Technical
11. **What SMS gateway should be used?** The UI mentions "credentials sent via SMS" for branch/agent creation. Options: Africa's Talking, Twilio, etc.
12. **What fund/investment system provides AUM data?** Currently mocked. Need integration point for real AUM calculations.
13. **Should the AI chat use Claude API?** Mock uses keyword matching. Production needs LLM + DB integration for real-time data analysis.
14. **What's the export format?** Download button is a placeholder. Need: CSV format specification, column definitions per report, streaming for large datasets.
15. **Real-time requirements?** The activity feed and "Live" indicator suggest real-time updates. Need: WebSocket vs polling decision, event types, latency requirements.
