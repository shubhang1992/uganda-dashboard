# Universal Pensions Uganda

A digital pension platform making long-term retirement savings simple, accessible, and meaningful for every Ugandan. Licensed and regulated by the Uganda Retirement Benefits Regulatory Authority (URBRA).

**Live:** [uganda-dashboard.vercel.app](https://uganda-dashboard.vercel.app)

## Overview

This is the public-facing landing page for Universal Pensions Uganda. It communicates the value of long-term savings through an interactive scrollytelling experience where scroll equals time — users experience 40 years of financial growth as they navigate the page.

### Key sections

- **Hero** — Headline, trust badge, savings calculator with projected returns
- **How it works** — 4-step registration flow (horizontal carousel on mobile)
- **40-year journey** — Interactive card: scroll (desktop) or swipe (mobile) through decades of savings growth with unlockable life milestones
- **Built for you** — Tabbed content for Individuals, Employers, and Agents
- **Trust & testimonials** — Stats strip + real user stories (carousel on mobile)
- **CTA** — Final conversion prompt with projected balance visual

## Tech stack

- **React 19** with JSX
- **Vite 8** for dev server and production builds
- **Framer Motion** for scroll-linked animations and transitions
- **CSS Modules** for scoped, component-level styling
- **CSS custom properties** for design tokens (colors, spacing, typography, shadows)

## Getting started

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

## Project structure

```
src/
  App.jsx                    # Layout — assembles all landing page sections
  main.jsx                   # React entry point
  index.css                  # Design tokens and global styles
  assets/
    logo.png                 # Brand logo (indigo + red, transparent bg)
  components/
    Navbar.jsx               # Fixed nav with mobile hamburger drawer
    Hero.jsx                 # Hero section with floating blobs + calculator
    SavingsCalculator.jsx    # Interactive contribution/return calculator
    HowItWorks.jsx           # 4-step process cards (carousel on mobile)
    TimeJourney.jsx          # Interactive 40-year savings timeline
    ForYou.jsx               # Role tabs (Individuals/Employers/Agents)
    Trust.jsx                # Stats strip + testimonial cards
    CTA.jsx                  # Final call-to-action section
    Footer.jsx               # Site footer with link groups
    StickyMobileCTA.jsx      # Fixed bottom CTA bar (mobile only)
  utils/
    finance.js               # Shared financial calculations (FV, formatting)
```

## Design system

All design tokens live in `src/index.css` as CSS custom properties:

| Token | Example | Usage |
|-------|---------|-------|
| `--color-indigo` | `#292867` | Primary brand, headings, buttons |
| `--color-indigo-deep` | `#1B1A4A` | Footer, dark sections |
| `--color-cloud` | `#F6F7FB` | Light section backgrounds |
| `--font-display` | Plus Jakarta Sans | Headings, CTAs, emphasis |
| `--font-body` | Inter | Body text, labels, descriptions |
| `--radius-full` | `9999px` | Pill buttons and badges |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | All entrance animations |

## Deployment

Deployed automatically to Vercel on push to `main`. No environment variables required for the current static landing page.
