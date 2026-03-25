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
- Logo is a PNG with transparent background (white version done via CSS `filter: brightness(0) invert(1)` in footer)

### Architecture
- `App.jsx` assembles sections: Navbar → Hero → HowItWorks → TimeJourney → ForYou → Trust → CTA → Footer + StickyMobileCTA
- `TimeJourney.jsx` is the most complex component — handles desktop wheel scroll and mobile horizontal swipe with rAF batching
- `SavingsCalculator.jsx` is embedded in the Hero section

## Project summary
Universal Pensions is a digital long-term savings and pension platform being designed to make retirement saving more accessible, understandable, and usable for everyday people.

For Uganda, the platform should feel inclusive, trustworthy, modern, and scalable. The goal is not to build a cold pension back office or a generic fintech dashboard. The goal is to build a digital savings experience that helps people understand long-term security, contribute consistently, and feel progress over time.

At its core, Universal Pensions is about:
- making long-term savings simple
- making formal retirement products feel approachable
- creating trust through clarity and strong product design
- supporting multiple distribution and contribution models
- building a platform that can scale across employers, field distribution, and direct individual usage

## Core users
The Uganda platform is a multi-user ecosystem. Claude should always think in terms of different user roles, not a single end user.

### 1. Subscribers
Subscribers are the end users saving into the platform.
They may include informal workers, gig workers, small business workers, self-employed users, women, youth, farmers, and other underserved segments.

What matters for them:
- easy understanding of the product
- simple registration and activation flows
- clear contribution journeys
- visibility into current savings and long-term progress
- a strong sense of trust, ownership, and control

### 2. Employers
Employers are organisations that help enroll and contribute for employees.
They are an important structured distribution and contribution channel.

What matters for them:
- simple onboarding
- employee management
- contribution uploads and contribution tracking
- clean reporting and low operational friction

### 3. Agents
Agents are frontline users who help bring subscribers into the platform.
They may support education, onboarding, contribution assistance, and basic servicing.

What matters for them:
- very clear guided workflows
- fast actions on mobile or lightweight interfaces
- simple explanations they can use with users
- visibility into tasks, status, and next actions

### 4. Branches
Branches sit within a larger distribution structure and act as an operational layer between head office and field execution.
They may supervise agents, support local operations, and track performance.

What matters for them:
- oversight of local activity
- monitoring of agents and subscribers
- branch-level visibility into progress and performance
- simple operational dashboards

### 5. Distributors
Distributors are larger partner institutions or networks that own branch and agent structures.
This may include organised distribution networks, institutional partners, or ecosystem partners responsible for scale and outreach.

What matters for them:
- network-level visibility
- branch and agent performance tracking
- contribution and onboarding monitoring
- reporting, control, and growth measurement

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
