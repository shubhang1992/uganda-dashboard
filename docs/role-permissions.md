# Universal Pensions Uganda — Role-Permission Matrix

> This document defines what each user role can see and do on the platform.
> Roles marked **Built** have working dashboard implementations. Roles marked **Planned** have inferred capabilities based on the data model and existing patterns — the frontend does not yet render their dashboards.

---

## Role Overview

| Role | Sign-In Category | Dashboard | Status |
|------|-----------------|-----------|--------|
| subscriber | Subscriber | Coming Soon | **Planned** |
| employer | Employer | Coming Soon | **Planned** |
| distributor | Distributor → Distributor Admin | DashboardShell | **Built** |
| branch | Distributor → Branch Admin | BranchDashboardShell | **Built** |
| agent | Distributor → Agent | Coming Soon | **Planned** |
| admin | Admin | Coming Soon | **Planned** |

Sign-in flow: Role Select → (Distributor Sub-select if applicable) → Phone Entry → OTP Verify

---

## Role 1: Distributor Admin (`distributor`) — BUILT

### Dashboard Access
- **Has dashboard:** Yes
- **Dashboard shell:** `DashboardShell`
- **Sidebar items:** Overview, Branches (Create/View), Agents (View), Subscribers (View), Commissions, Reports, Settings

### Pages/Views Accessible
| View | Access | Notes |
|------|--------|-------|
| Map Overview | Full | Interactive Leaflet map with drill-down |
| Overlay Panel | Full | KPIs, entity lists, commission summary at every hierarchy level |
| Breadcrumb Navigation | Full | Country → Region → District → Branch → Agent |
| View Branches | Full | All ~314 branches, list + detail slide-in |
| Create Branch | Full | Multi-step form: Branch Details → Admin Details → Review |
| View Agents | Full | All ~500+ agents, list + detail slide-in |
| View Subscribers | Full | All ~30,000 subscribers, list + detail slide-in |
| Commission Panel | Full | Home, agents list, agent detail, subscribers, disputed, settlement requests |
| Reports Panel | Full | All 11 reports |
| Settings Panel | Full | Profile + password |
| AI Data Assistant | Full | Bottom card row chat widget |
| Top Bar | Full | Search, Filters (placeholder), Download (placeholder) |

### Data Scope
- **Visibility:** All entities across the entire network (country-wide)
- **Drill-down:** Country → Region → District → Branch → Agent → Subscriber
- **Commission scope:** All commissions across all branches/agents

### Actions (CRUD)
| Action | Permission | Scope |
|--------|-----------|-------|
| View entities at any level | Read | All |
| Drill down through hierarchy | Read | All |
| Create branch | Create | Any district |
| Create agent | Create | Any branch (via branch dashboard pattern, but accessible from distributor too) |
| View agent commissions | Read | All agents |
| Set commission rate | Update | Global |
| Settle commissions (individual) | Update | Any due commission |
| Settle commissions (bulk/agent/all) | Update | Any scope |
| Approve disputed commission | Update | Any disputed commission |
| Reject disputed commission | Update | Any disputed commission |
| Bulk approve/reject | Update | Multiple commissions |
| Update own profile | Update | Own user |
| Change own password | Update | Own user |
| Search entities | Read | All entities (regions, districts, branches, agents) |

### Reports Available (11 of 11)
1. Distribution Summary
2. All Branches
3. All Agents
4. All Subscribers
5. Contributions & Collections
6. Withdrawals & Payouts
7. Branch Performance
8. Agent Performance
9. Subscriber Growth
10. Subscriber Demographics
11. KYC & Compliance

---

## Role 2: Branch Admin (`branch`) — BUILT

### Dashboard Access
- **Has dashboard:** Yes
- **Dashboard shell:** `BranchDashboardShell`
- **Sidebar items:** Overview, Agents (Create/View), Commissions, Reports, Settings
- **Scope provider:** `BranchScopeProvider` wraps dashboard with `branchId` from user session

### Pages/Views Accessible
| View | Access | Notes |
|------|--------|-------|
| Branch Overview | Full | Health score gauge, metrics, activity feed, alerts, copilot |
| Operations Section | Full | Agent leaderboard, commissions summary, demographics |
| Create Agent | Full | Multi-step form: Agent Details → Review |
| View Agents | Scoped | Only agents belonging to own branch |
| Commission Panel | Scoped | Only commissions for own branch's agents |
| Reports Panel | Partial | 8 of 11 reports (3 excluded) |
| Settings Panel | Full | Profile + password |
| Branch Copilot | Full | AI chat with branch-specific insights |

### Data Scope
- **Visibility:** Own branch entity, own branch's agents, own branch's subscribers
- **No drill-down:** Fixed to single-branch view (no map, no hierarchy navigation)
- **Commission scope:** Only commissions linked to own branch's agents
- **Branch ID source:** `user.branchId` from auth session (set at login)

### Actions (CRUD)
| Action | Permission | Scope |
|--------|-----------|-------|
| View own branch metrics | Read | Own branch |
| View own agents | Read | Own branch's agents |
| View own subscribers (via agents) | Read | Own branch's subscribers |
| Create agent | Create | Own branch |
| View agent commissions | Read | Own branch's agents |
| Settle commissions | Update | Own branch's due commissions |
| Approve disputed commission | Update | Own branch's disputed commissions |
| Reject disputed commission | Update | Own branch's disputed commissions |
| Update own profile | Update | Own user |
| Change own password | Update | Own user |

### Reports Available (8 of 11)
1. ~~Distribution Summary~~ — EXCLUDED (network-level)
2. ~~All Branches~~ — EXCLUDED (multi-branch view)
3. All Agents (scoped to own branch)
4. All Subscribers (scoped to own branch)
5. Contributions & Collections (shows agents, not districts)
6. Withdrawals & Payouts (shows agents, not districts)
7. ~~Branch Performance~~ — EXCLUDED (network comparison)
8. Agent Performance (scoped to own branch)
9. Subscriber Growth (shows agents, not districts)
10. Subscriber Demographics (shows agents, not districts)
11. KYC & Compliance (shows agents, not districts)

### Excluded Reports (defined in `BRANCH_EXCLUDED_REPORTS`)
- `distribution-summary` — requires network-wide region data
- `all-branches` — shows all branches across network
- `branch-performance` — compares branches across network

### Split Mode
All slide-in panels use `splitMode={true}`:
- No backdrop overlay (content remains visible behind panel)
- Overview reflows with right padding to accommodate panel width
- On mobile: panels go full-screen regardless of splitMode

---

## Role 3: Subscriber (`subscriber`) — PLANNED

> These capabilities are inferred from the data model, landing page content (ForYou section), and subscriber entity fields. The frontend shows "Subscriber coming soon" when this role logs in.

### Dashboard Access
- **Has dashboard:** No (planned)
- **Dashboard shell:** TBD
- **Expected focus:** Personal savings dashboard

### Planned Pages/Views
| View | Priority | Description |
|------|----------|-------------|
| Balance Overview | High | Current AUM, total contributions, total withdrawals |
| Contribution History | High | 12-month contribution trend chart, transaction list |
| Progress Tracker | High | Savings goal progress, projected retirement value |
| Products Held | Medium | List of products (SavePlus, PensionBasic, etc.) with details |
| KYC Status | Medium | Current status (complete/pending/incomplete), required documents |
| Profile & Settings | Medium | Update name, email, phone, password |
| Withdrawal Request | Low | Request a withdrawal (subject to approval flow) |
| Statements / Documents | Low | Download contribution statements |

### Planned Data Scope
- **Visibility:** Own subscriber record only
- **Fields visible:** name, phone, email, age, gender, kycStatus, isActive, contributionHistory, totalContributions, totalWithdrawals, productsHeld, registeredDate
- **No access to:** Other subscribers, agents, branches, commissions, or network data

### Planned Actions
| Action | Permission | Scope |
|--------|-----------|-------|
| View own balance & contributions | Read | Own record |
| View own KYC status | Read | Own record |
| View own products | Read | Own record |
| Update own profile | Update | Own user |
| Request withdrawal | Create | Own record (subject to approval) |
| Upload KYC documents | Create | Own record |

---

## Role 4: Employer (`employer`) — PLANNED

> Inferred from ForYou section and product context. Employers manage employee pension contributions.

### Dashboard Access
- **Has dashboard:** No (planned)
- **Dashboard shell:** TBD
- **Expected focus:** Employee management + bulk contribution uploads

### Planned Pages/Views
| View | Priority | Description |
|------|----------|-------------|
| Organization Overview | High | Total employees enrolled, contribution totals, active rate |
| Employee List | High | Searchable, filterable list of enrolled employees |
| Bulk Contribution Upload | High | CSV/Excel upload for monthly contributions |
| Contribution History | Medium | Organization-level contribution trend |
| Reports | Medium | Employee participation, contribution compliance |
| Profile & Settings | Medium | Organization profile, admin accounts |

### Planned Data Scope
- **Visibility:** Own organization's employees (subscribers linked to this employer)
- **No access to:** Other employers, agents, branches, or network data

### Planned Actions
| Action | Permission | Scope |
|--------|-----------|-------|
| View employee list | Read | Own organization's employees |
| Upload bulk contributions | Create | Own organization |
| View contribution reports | Read | Own organization |
| Add/remove employees | Create/Delete | Own organization |
| Update organization profile | Update | Own organization |

---

## Role 5: Agent (`agent`) — PLANNED

> Inferred from agent entity fields, commission system, and the agent's role in subscriber onboarding.

### Dashboard Access
- **Has dashboard:** No (planned)
- **Dashboard shell:** TBD
- **Expected focus:** Subscriber enrollment, collection tracking, commission visibility

### Planned Pages/Views
| View | Priority | Description |
|------|----------|-------------|
| Today's Pulse | High | Daily registrations, collections, pending tasks |
| My Subscribers | High | List of subscribers registered by this agent |
| Register Subscriber | High | Guided enrollment workflow (name, phone, KYC, first contribution) |
| My Commissions | High | Commission list with status (paid/due/disputed), totals |
| Request Settlement | Medium | Flag due commissions for settlement |
| Confirm Receipt | Medium | Confirm agent received commission payment (`agentConfirmed` field) |
| Collection Log | Medium | Record contribution collections from subscribers |
| Profile & Settings | Medium | Update own profile |

### Planned Data Scope
- **Visibility:** Own agent record, own subscribers, own commissions
- **No access to:** Other agents, branch-level data, or network data

### Planned Actions
| Action | Permission | Scope |
|--------|-----------|-------|
| View own subscribers | Read | Own subscribers |
| Register new subscriber | Create | Under own agent ID |
| Record contribution collection | Create | Own subscribers |
| View own commissions | Read | Own commissions |
| Request commission settlement | Update | Own due commissions (`settlementRequested = true`) |
| Confirm commission receipt | Update | Own paid commissions (`agentConfirmed = true`) |
| Dispute a commission | Create | Own commissions (raise dispute) |
| Update own profile | Update | Own user |

### Commission Interaction
The `agentConfirmed` field on commissions exists specifically for this role:
- After distributor/branch admin settles a commission (status → 'paid'), the agent sees it as pending confirmation
- Agent confirms receipt → `agentConfirmed = true`
- This is a maker-checker pattern: admin pays, agent confirms

---

## Role 6: Platform Admin (`admin`) — PLANNED

> System administrator with full platform control. Inferred from the role's existence in the sign-in flow and typical platform admin patterns.

### Dashboard Access
- **Has dashboard:** No (planned)
- **Dashboard shell:** TBD
- **Expected focus:** Platform-wide management, system configuration, user administration

### Planned Pages/Views
| View | Priority | Description |
|------|----------|-------------|
| Platform Overview | High | System-wide KPIs, user counts, revenue metrics |
| User Management | High | CRUD for all user accounts across all roles |
| Entity Management | High | Create/edit/deactivate regions, districts, branches |
| Commission Configuration | High | Set/modify commission rates, approve rate changes |
| Audit Log | Medium | Track all mutations (settlements, disputes, user changes) |
| System Settings | Medium | Platform configuration, feature flags |
| All Reports | Medium | Access to all 11 reports with no scope restrictions |
| KYC Verification Queue | Medium | Review and approve KYC submissions |
| Withdrawal Approval | Low | Approve/deny subscriber withdrawal requests |

### Planned Data Scope
- **Visibility:** All data across the entire platform
- **No restrictions:** Can view and modify any entity at any level

### Planned Actions
| Action | Permission | Scope |
|--------|-----------|-------|
| All distributor actions | Full CRUD | All |
| Create/edit/deactivate any entity | Full CRUD | All levels |
| Manage user accounts | Full CRUD | All roles |
| Configure commission rates | Update | Global |
| Approve KYC submissions | Update | All subscribers |
| Approve withdrawal requests | Update | All subscribers |
| View audit log | Read | All |
| System configuration | Update | Platform settings |

---

## Data Scoping Rules Summary

| Role | Entity Visibility | Commission Visibility | Report Scope |
|------|------------------|----------------------|--------------|
| distributor | All entities, all levels | All commissions | All 11 reports, network-wide |
| branch | Own branch + own agents + own subscribers | Own branch's commissions | 8 reports, branch-scoped |
| agent (planned) | Own record + own subscribers | Own commissions | None (planned: own performance) |
| subscriber (planned) | Own record only | None | None (planned: own statements) |
| employer (planned) | Own org's employees | None | Own org reports |
| admin (planned) | All entities, all levels | All commissions | All reports, all scopes |

### Scoping Implementation
- **Distributor:** No scoping applied — all data visible
- **Branch:** `BranchScopeProvider` injects `branchId` into context. Report views check `useBranchScope()` and filter data accordingly. Commission endpoints receive `branchId` parameter.
- **Agent (planned):** Should scope by `agentId` from auth session
- **Subscriber (planned):** Should scope by `subscriberId` from auth session
- **Employer (planned):** Should scope by `employerId` from auth session
- **Admin (planned):** No scoping — full access like distributor but with additional admin capabilities

### Backend Enforcement
The frontend applies scoping via:
1. Conditional component rendering (role-based shell selection)
2. Prop passing (branchId to panels and reports)
3. Query filtering in hooks (enabled flags)

**The backend MUST enforce the same scoping rules server-side.** The frontend scoping is a UX convenience, not a security boundary. Every API endpoint should verify that the authenticated user has permission to access the requested data based on their role and scope.
