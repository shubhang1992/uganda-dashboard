# Universal Pensions — Uganda Platform Context

## Technical context

**Stack:** React 19 + Vite 8 + Framer Motion + CSS Modules
**Deployment:** Vercel (auto-deploy on push to `main`)
**Live URL:** uganda-dashboard.vercel.app

### Key conventions
- All styling uses **CSS Modules** (`.module.css` per component) — no Tailwind
- Design tokens are **CSS custom properties** in `src/index.css` (colors, spacing, typography, shadows, radii)
- Animations use **Framer Motion** — `motion.div`, `useScroll`, `AnimatePresence`, staggered variants
- Financial calculations (future value, formatting) are centralized in `src/utils/finance.js`
- Mobile breakpoints: 600px (phone), 768px (tablet), 900px (large tablet), 1024px (desktop)
- The shared easing curve is `[0.16, 1, 0.3, 1]` (ease-out-expo), used across all animations
- Brand primary color: `--color-indigo` (#292867) — avoid red except for error states
- Logo: two PNGs with transparent backgrounds — `logo.png` (color, for light backgrounds) and `logo-white.png` (grey, brightened via CSS for dark backgrounds)

### Architecture

**View switching:** `AppContext` manages `view` ('landing' | 'dashboard') and `role`. Sign-in modal calls `enterDashboard(role)` after OTP verification. No router library — state-based switching.

**Landing page:**
- `App.jsx` renders either landing page or `DashboardShell` based on `AppContext.view`
- Landing sections: Navbar → Hero → HowItWorks → TimeJourney → ForYou → Trust → CTA → Footer + StickyMobileCTA + SignInModal
- `SignInContext` provides `{ isOpen, open, close }` for the sign-in modal
- `TimeJourney.jsx` is the most complex landing component — desktop wheel scroll + mobile horizontal swipe with rAF batching

**Sign-in flow:**
- Modal with 4 steps: Role Select → (Distributor Sub-select) → Phone Entry → OTP Verify
- Main roles: Subscriber, Employer, Distributor, Admin
- Distributor sub-roles: Distributor Admin, Branch Admin, Agent
- Any OTP accepted (prototype) — calls `enterDashboard(role)` on verify

**Dashboard (Distributor Admin):**
- `DashboardShell.jsx` is the root — fixed viewport, CSS grid: sidebar (64px) + main area
- `DashboardContext` manages drill-down state machine with `useReducer`
- Drill levels: country → region → district → branch → agent → subscriber
- Actions: `drillDown(level, id)`, `drillUp(level)`, `goToLevel(level)`, `reset()`

### Dashboard file structure
```
src/dashboard/
  DashboardShell.jsx          — Root layout (sidebar + map + overlays)
  map/
    UgandaMap.jsx             — Full-bleed SVG map with ZoomableGroup (pan/zoom)
  sidebar/
    Sidebar.jsx               — Dark indigo icon rail with tooltips
  overlay/
    OverlayPanel.jsx          — Top-left glassmorphism card (KPIs, collapsible sections)
    Breadcrumb.jsx            — Drill-down path navigation
    TopBar.jsx                — Filter + Download buttons (top-right)
  cards/
    MetricsRow.jsx            — Bottom card row (AI chat + Demographics)
src/data/
    mockData.js               — All mock data (4 regions, 12 districts, 30 branches, 120 agents, 2000 subscribers)
```

### Dashboard data architecture
- Mock data in `src/data/mockData.js` — flat lookup maps keyed by ID for O(1) access
- Hierarchy: Country → Regions (4) → Districts (12, real Ugandan names) → Branches (~30) → Agents (~120) → Subscribers (~2000, lazy-generated via Proxy)
- Metrics aggregated bottom-up at module load time (agent ← subscribers, branch ← agents, etc.)
- Key exports: `COUNTRY`, `REGIONS`, `DISTRICTS`, `BRANCHES`, `AGENTS`, `SUBSCRIBERS`, `getChildEntities()`, `getEntityById()`, `getBreadcrumbPath()`, `formatUGX()`
- Map GeoJSON: `public/uganda-topo.json` — 56 real GADM districts with region assignments

### Dashboard UI patterns

**Map:**
- Full-bleed background using `react-simple-maps` with `ZoomableGroup` for pan/drag/zoom
- GeoJSON from GADM (56 districts) with region color-coding (indigo palette)
- Animated glowing dot indicators at entity positions (green/yellow/red by active rate)
- Hover tooltips showing district name + region
- Map zooms on drill-down via `ZoomableGroup` center/zoom props

**Glassmorphism cards (dashboard-specific):**
- Background: `linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(246,247,251,0.72) 100%)`
- Border: bright top/left (0.8/0.7 opacity white) for 3D light direction
- Backdrop blur: 24px
- Inset shadows: `0 1px 0 rgba(255,255,255,0.5) inset` (top highlight)
- Hover: `translateY(-3px)` + deeper shadow
- Use `--glass-bg`, `--glass-blur`, `--glass-border` tokens

**Collapsible sections:**
- `CollapsibleSection` component in OverlayPanel with animated height + chevron rotation
- `AnimatePresence` with `height: 0/auto` for smooth open/close

**Bottom cards:**
- 3-column grid (`repeat(3, 1fr)`) with `align-items: end`
- Card 1: AI Data Assistant (inline chat with suggestions)
- Card 2: Demographics (expandable — gender donut + age bars, expands to show counts)
- Card 3: Empty (reserved for future use)
- Both cards have `min-height: 210px` to match when collapsed
- Only the expanded card grows upward; others stay at their height

**AI Chat (Data Assistant):**
- Embedded in bottom card row (not a floating widget)
- Mock responses matching network data
- Suggested prompt pills on first load
- Will be connected to LLM + DB in production

### Dashboard design tokens (in index.css)
```css
--glass-bg:       rgba(255, 255, 255, 0.82);
--glass-bg-dark:  rgba(27, 26, 74, 0.85);
--glass-border:   rgba(217, 220, 242, 0.5);
--glass-blur:     16px;
--sidebar-width:  64px;
--map-bg:         #E8EAF0;
--color-status-good:    #2E8B57;
--color-status-warning: #E6A817;
--color-status-poor:    #DC3545;
```

### Design consistency rules — MUST FOLLOW

The landing page establishes the design language for the entire platform. All new UI (dashboards, modals, flows) must maintain visual consistency with the existing landing page. Specifically:

**Icons:**
- Always use **inline SVG line icons** with `stroke="currentColor"` and `strokeWidth="1.75"`
- Standard icon size: `24x24` viewBox, displayed at 24px
- Never use emojis, icon fonts, or icon libraries — all icons are hand-drawn SVGs matching the existing style
- Icon containers (when used): `background: rgba(41,40,103,0.06)`, `border: 1px solid var(--color-lavender)`, `border-radius: var(--radius-md)`, `color: var(--color-indigo)`
- Reference: Trust.jsx stat icons, HowItWorks.jsx card icons, TimeJourney.jsx shelf icons

**Cards and surfaces:**
- Card background: `var(--color-cloud)` or `var(--color-white)`
- Card border: `1px solid var(--color-lavender)`
- Card radius: `var(--radius-md)` for small cards, `var(--radius-xl)` for large panels
- Hover state: `box-shadow: var(--shadow-md)` + subtle `translateY(-2px)`

**Buttons:**
- Primary: `background: var(--color-indigo)`, `color: white`, `border-radius: var(--radius-full)`, `font-family: var(--font-display)`, `font-weight: 700`
- Secondary: `border: 1px solid var(--color-lavender)`, `color: var(--color-indigo-soft)`, `border-radius: var(--radius-full)`
- Touch targets: minimum 44px height on mobile

**Typography:**
- Headings: `var(--font-display)` (Plus Jakarta Sans), `font-weight: 800`, `color: var(--color-indigo)`, `letter-spacing: -0.03em`
- Body text: `var(--font-body)` (Inter), `color: var(--color-slate)`
- Secondary text: `color: var(--color-gray)`
- Labels/tags: `var(--text-xs)`, `uppercase`, `letter-spacing: 0.06-0.1em`, `color: var(--color-indigo-soft)`

**Animations:**
- All entrance animations use ease `[0.16, 1, 0.3, 1]` (ease-out-expo)
- Staggered children: `staggerChildren: 0.05–0.1`
- Item reveal: `{ opacity: 0, y: 12-24 } → { opacity: 1, y: 0 }`
- Use `AnimatePresence mode="wait"` for step transitions

**Spacing:**
- Use `var(--space-*)` tokens, not raw values
- Section padding: `var(--space-16) 0 var(--space-20)` desktop, `var(--space-8) 0 var(--space-12)` mobile
- Container: `max-width: 1200px`, `padding: 0 var(--space-8)` (desktop), `0 var(--space-6)` (mobile)

**Dark sections:**
- Background: `var(--color-indigo)` or `var(--color-indigo-deep)`
- Text: `var(--color-white)` for headings, `rgba(217,220,242,0.65)` for body
- Borders: `rgba(255,255,255,0.08-0.12)`

**Form inputs:**
- Border: `1.5px solid var(--color-lavender)`, `border-radius: var(--radius-md)`
- Focus: `border-color: var(--color-indigo)`, `box-shadow: 0 0 0 3px rgba(41,40,103,0.08)`
- Error: `border-color: #dc3545`
- Height: 52px for standard inputs

## Project summary
Universal Pensions is a digital long-term savings and pension platform being designed to make retirement saving more accessible, understandable, and usable for everyday people.

For Uganda, the platform should feel inclusive, trustworthy, modern, and scalable. The goal is not to build a cold pension back office or a generic fintech dashboard. The goal is to build a digital savings experience that helps people understand long-term security, contribute consistently, and feel progress over time.

At its core, Universal Pensions is about:
- making long-term savings simple
- making formal retirement products feel approachable
- creating trust through clarity and strong product design
- supporting multiple distribution and contribution models
- building a platform that can scale across employers, field distribution, and direct individual usage

## Core users & sign-in structure
The Uganda platform is a multi-user ecosystem with 6 roles across 4 sign-in categories.

**Sign-in modal shows 4 top-level options:**
1. **Subscriber** — Individual saver (informal workers, gig workers, farmers, self-employed)
2. **Employer** — Organisation managing employee contributions
3. **Distributor** — Clicking this shows 3 sub-options:
   - **Distributor Admin** — Network-level oversight of branches and agents
   - **Branch Admin** — Local operations, agent supervision
   - **Agent** — Field-level enrolment and subscriber servicing
4. **Admin** — Platform admin (head office)

**Distributor network hierarchy:** Country (Uganda) → Regions → Districts → Branches → Agents → Subscribers

### What matters per role:
- **Subscribers:** balance visibility, contribution journeys, progress tracking, trust
- **Employers:** employee management, contribution uploads, clean reporting
- **Agents:** guided workflows, fast mobile actions, task completion
- **Branches:** agent oversight, local performance, subscriber activity
- **Distributors:** network-wide visibility, branch/agent performance, strategic reporting
- **Admin:** full platform control, all data access

### Current build status:
- ✅ Landing page (complete)
- ✅ Sign-in flow (complete — all roles)
- ✅ Distributor Admin dashboard (in progress — map, overlays, analytics, AI chat)
- ⬜ Subscriber dashboard (not started)
- ⬜ Employer dashboard (not started)
- ⬜ Branch Admin dashboard (not started)
- ⬜ Agent dashboard (not started)
- ⬜ Admin dashboard (not started)

## Product thinking
Claude should understand that this is not just a portal.
It is a product-led platform that must balance:
- financial trust
- user education
- operational scalability
- structured multi-role workflows
- strong visual clarity

This product should help users feel that retirement saving is not abstract. It should feel visible, progressive, and achievable.

## Overall UI / UX direction
The UI should feel:
- modern
- calm
- premium but accessible
- trustworthy
- guided, not overwhelming
- clean and structured
- serious enough for financial services, but never stiff or bureaucratic

Avoid:
- generic fintech dashboard patterns
- cluttered enterprise admin styling
- flashy neobank aesthetics
- overly decorative or random animations
- artsy typography that harms clarity

Prefer:
- strong hierarchy
- high readability
- spacious layouts
- consistent CTA placement
- clean grid alignment
- polished, studio-level motion
- a sense of progress and continuity throughout the experience

## Landing page storytelling direction
The landing page should not feel like a static brochure.
It should be a scrollytelling experience.

The key idea is:
**scroll = time**

As the user scrolls, time should feel like it is passing.
The page should communicate the journey from today toward long-term financial security.

This means the landing page should visually depict:
- the passing of time
- gradual savings accumulation
- improving financial confidence
- a movement from uncertainty to stability
- a future-oriented sense of dignity and security

The storytelling should feel intentional and cinematic, not gimmicky.

## Animation philosophy
Animation should be used as a meaning layer, not as decoration.

The motion system should help communicate:
- time passing
- money growing steadily
- milestones being reached
- confidence building over the years
- different life stages and future outcomes

Animation should feel:
- smooth
- refined
- premium
- editorial / studio-grade
- subtle but memorable

Avoid motion that feels:
- random
- overly playful
- flashy for the sake of flash
- disconnected from the product story

## How scroll should work on the landing page
Scrolling should act like a narrative device.
Each section should feel like a chapter in a long-term journey.

Examples of how that logic should translate into UI:
- a user starts in the present with uncertainty or limited retirement preparedness
- with each scroll section, time progresses and the story advances
- visual states evolve gradually rather than snapping harshly
- numbers, labels, and visual cues can shift to show contribution, growth, and future outcomes
- illustrations or environments can mature over time to reflect life progress and financial stability
- CTAs should appear at the right narrative moments, not in a chaotic way

The page should feel like the user is moving through years, not just moving down a long website.

## Motion ideas Claude should preserve
When suggesting concepts, keep these principles in mind:
- use layered transitions instead of simple fade-ins everywhere
- use scroll-linked transformations that have meaning
- allow scenes to evolve as the narrative progresses
- let charts, balances, or states build gradually over scroll
- keep movement elegant and controlled
- use micro-interactions to reinforce trust and clarity
- maintain strong alignment and rhythm across sections

## Information design principles
No role should be overwhelmed by raw data first.
The platform should layer information.

Default pattern:
- summary first
- detail second
- operational depth only when needed

This means:
- show contribution status before transaction complexity
- show progress before technical detail
- show clear next steps before dense reporting
- make dashboards understandable within seconds

## Dashboard direction by role
### Subscriber dashboard
Should prioritize:
- current balance
- recent contributions
- progress toward long-term goals
- future impact and projected security
- simple reminders and next steps

### Employer dashboard
Should prioritize:
- employee participation
- contribution management
- upload and tracking workflows
- simple reporting
- operational confidence

### Agent dashboard
Should prioritize:
- assisted actions
- pending onboarding or support tasks
- subscriber status
- quick task completion
- mobile-friendly execution

### Branch dashboard
Should prioritize:
- local performance
- agent oversight
- subscriber activity
- exception visibility
- progress snapshots

### Distributor dashboard
Should prioritize:
- network-wide growth
- branch and agent performance
- onboarding and contribution trends
- operational visibility
- strategic reporting

## Copy tone
All copy should be:
- clear
- respectful
- confidence-building
- simple to understand
- action-oriented without sounding aggressive

Avoid:
- heavy pension jargon
- long institutional paragraphs inside UI
- intimidating financial language

Prefer:
- plain English
- short support text
- benefit-led messaging
- direct labels and confirmations

## Brand kit based on the logo
The uploaded logo establishes a strong deep-indigo brand base. The visual identity should be built around that tone rather than red.

### Brand personality
The brand should feel:
- dependable
- intelligent
- modern
- stable
- human
- future-facing

### Primary logo color
Use a deep indigo as the core brand anchor.

Suggested primary brand color:
- **Universal Indigo** — `#292867`

This should be the main brand color across key headings, primary buttons, hero emphasis, important icons, and anchor UI moments.

### Supporting palette
Use supporting tones that make the indigo feel premium and calm.

Suggested palette:
- **Universal Indigo** — `#292867`
- **Deep Night** — `#1B1A4A`
- **Soft Indigo** — `#5E63A8`
- **Mist Lavender** — `#D9DCF2`
- **Cloud** — `#F6F7FB`
- **Slate Text** — `#2F3550`
- **Cool Gray** — `#8A90A6`
- **Success Green** — `#2E8B57`
- **Accent Teal** — `#2F8F9D`

### Color rules
- do not use red as a major brand color
- reserve red only for error, destructive, or critical alert states
- let indigo carry the primary brand identity
- use neutrals and soft tints for spaciousness and readability
- use teal or green sparingly for positive states, progress, or growth cues

### Background direction
Preferred backgrounds:
- soft off-white
- cloud gray
- pale indigo tint
- occasional deep-indigo sections for contrast

Avoid making the overall product feel too dark or too black-heavy.
The experience should stay light, open, and readable.

### Typography direction
Typography should be:
- modern
- clean
- confident
- highly legible
- not decorative

Avoid fonts that feel too artsy, stylised, or experimental.
The product needs clarity and authority first.

### Visual style
Use:
- bold but clean headings
- large readable numbers
- smooth card surfaces
- restrained gradients if needed
- subtle depth and shadows
- consistent iconography
- motion tied to meaning

Avoid:
- noisy visuals
- overly playful illustration styles
- random 3D gimmicks
- decorative complexity that weakens trust

## Final instruction for Claude
When generating product strategy, UX ideas, wireframes, copy, or landing page concepts for Universal Pensions Uganda, always optimize for:
1. trust
2. clarity
3. inclusivity
4. multi-role usability
5. long-term savings behavior
6. elegant scrollytelling
7. meaningful motion design
8. strong alignment and readability
9. indigo-led brand consistency

This platform should feel like a serious, modern, inclusive financial product with studio-quality storytelling and a clear sense of future progress.
