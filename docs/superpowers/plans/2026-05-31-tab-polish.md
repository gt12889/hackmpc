# Tab Polish Implementation Plan (worldlabs-inspired)

**Goal:** Add 4 motion/typography refinements to the data tabs without heavy deps:
scroll-reveal stagger, KPI count-up, pill CTAs, and a Fraunces serif display layer.

**Constraints:** No GSAP/framer/scroll libs (use native IntersectionObserver + existing
`animate-fade-up`). Respect `prefers-reduced-motion`. Don't serif dense table cells
(keep `tabular-nums` sans). Override the global `* { font-weight:700 !important }` only
within a scoped `.font-display` utility.

**Tech:** Next.js 15, Tailwind, next/font/google (Fraunces), Recharts (untouched).

---

## Task 1 — Motion primitives
**Files:** create `lib/use-in-view.ts`, `lib/use-count-up.ts`, `components/reveal.tsx`; edit `app/globals.css`.
- `useInView(opts?)`: native IntersectionObserver, `threshold: 0.15`, fire once; returns `{ ref, inView }`. SSR-safe ("use client").
- `useCountUp(target, { durationMs=900, enabled })`: easeOutCubic rAF count from 0→target when `enabled` true; returns current number. If `prefers-reduced-motion` or `!enabled`, returns `target` immediately.
- `<Reveal as? delay? className?>`: client wrapper using `useInView`; starts `opacity-0`, on inView adds `animate-fade-up` + inline `style={{ animationDelay }}`. If reduced-motion, render visible (no transform).
- `globals.css`: bump `fade-up` keyframe translateY 8px→16px; add `@media (prefers-reduced-motion: reduce)` guard that disables the reveal transform.

## Task 2 — Typography (Fraunces display layer)
**Files:** edit `app/layout.tsx`, `tailwind.config.ts`, `app/globals.css`, `components/page-header.tsx`, `components/kpi-card.tsx` (SectionCard lives here too).
- Load Fraunces via `next/font/google` (weights 400/500, `variable: "--font-display"`, optical sizing). Add the variable to `<body>` class.
- `tailwind.config.ts`: `fontFamily.display = ["var(--font-display)", "Georgia", "serif"]`.
- `globals.css`: add `.font-display { font-family: var(--font-display) !important; font-weight: 450 !important; letter-spacing: -0.02em; font-optical-sizing: auto; }` (overrides the global bold rule).
- Apply `font-display` to `PageHeader` h1 and `SectionCard` titles. Keep sizes; do NOT touch body/table text.

## Task 3 — Pill button variant + KpiCard count-up & serif value
**Files:** edit `components/ui/button.tsx`, `components/kpi-card.tsx`.
- Button CVA: add `size: "pill"` → `h-10 rounded-full px-5` (or a `shape` variant). Keep other sizes.
- `KpiCard`: add optional props `countTo?: number` and `format?: "cad" | "pct" | "int"`. When `countTo` is set, render an animated number (via `useCountUp` + `useInView`, formatted with the existing CAD/percent/int formatters), else render the existing `value` string. Apply `.font-display` to the large value text only. Keep icon/label/sub-text as-is.

## Task 4 — Apply across the 6 views
**Files:** `app/dashboard/page.tsx`, `components/compliance/compliance-view.tsx`, `components/insights/insights-view.tsx`, `components/receipts/receipts-view.tsx`, `components/reports/reports-view.tsx`, `components/budgets/budgets-view.tsx`.
- Wrap each KPI row's items and each `SectionCard` in `<Reveal delay={index*70}>` (stagger).
- Pass `countTo` + `format` to KpiCards where the underlying value is numeric (spend = cad, cross-border = pct, counts = int).
- Swap **primary** action buttons to the pill variant: Run scan (Compliance), Regenerate (Insights/Reports), Approve as CFO (Reports), Set/Update budget (Budgets), Upload/Browse (Receipts). Leave secondary/ghost/toggle controls unchanged.
- Keep all dense tables and their `tabular-nums` sans text untouched.

## Task 5 — Verify
- `npm run type-check && npm run build` green; existing `npm test` still 17/17.
- Manually confirm `prefers-reduced-motion` disables reveal + count-up (emulate in devtools).
- Run the app; screenshot Dashboard + Insights + Compliance to confirm reveal/pills/serif read well and tables stay aligned.
