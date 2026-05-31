# Sphinx-inspired effects + tab minimalism (Brim It palette)

**Goal:** Add sphinx.ai-style structure/effects (NO sphinx colors - use Brim It's teal/cyan/cream
tokens) and make the data tabs more minimal without losing information, via space-saving
expand/navigate patterns. Stacks on `feat/tab-polish`.

**Constraints:** No new deps (native IntersectionObserver, CSS transitions, the existing
`Reveal`/`useInView`). Respect `prefers-reduced-motion`. Preserve ALL data/handlers. Keep
dense numbers in `tabular-nums`. Skip landing-only marketing SVG/video effects.

---

## Phase 1 - Shared components (reusable)

### T6: small sphinx primitives (one task)
- `components/ui/section-badge.tsx` - frosted pill + status dot. `inline-flex rounded-full border border-white/10 bg-foreground/[0.06] px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur-md` + a `h-2.5 w-2.5 rounded-full bg-primary` dot. (dot uses Brim primary, not red.)
- `components/ui/corner-card.tsx` - `relative rounded-xl border border-border/60 bg-card/50 p-5 backdrop-blur-md` wrapper with four L-bracket SVGs (`stroke: hsl(var(--primary))`, ~11px) absolutely positioned at each corner (rotated per corner), optional `dotted` prop (radial-gradient dot grid) + optional subtle `border-t-2 border-t-primary/50` accent.
- `components/blur-text.tsx` - client; per-character blur+fade+slide reveal triggered by `useInView`; `aria-label={text}` on the wrapper, per-char spans `aria-hidden`; `motion-reduce:` classes render final state. Props: `text`, `className`, `stagger=30`.
- `components/ui/arrow-clip.tsx` - two stacked `ArrowRight` icons in an `overflow-hidden` clip; on parent `group/btn` hover the first slides out and the second slides in. Drop inside a pill button that adds `group/btn`.

### T7: ScrollSpyAccordion
- `components/ui/scroll-spy.tsx` - client. Props: `items: { id, title, tag?, body, panel }[]`. Layout: `grid lg:grid-cols-2`. Left = clickable list, `divide-y divide-border/60`; active item shows a primary dot + expands its `body` via the `grid-rows-[0fr]→[1fr]` height trick (`overflow-hidden`), with an optional uppercase `tag` badge. Right = `lg:sticky lg:top-20` rounded card that crossfades between each item's `panel` (`transition-opacity`, inactive `absolute opacity-0 pointer-events-none`). Defaults active to first item. Reduced-motion: instant.

## Phase 2 - Apply to showcase tabs

### T8: Insights → scroll-spy accordion
Replace the 7-button horizontal tab bar with `ScrollSpyAccordion`: left list = the 7 insight categories (title + short body + tag), right panel = that category's existing content (charts/tables) crossfading in. Keep all existing data/subcomponents; just re-home them as panels. Add a `SectionBadge` header.

### T9: Compliance → expandable accordion + minimal headers
- Violations: convert each violation to an **accordion row** (summary = severity dot + merchant + amount; expand reveals AI reasoning + rule + group detail) using the `grid-rows` height trick. Keep ShowMore for the list.
- Repeat-offenders: make the pair collapsible.
- Replace section titles with `SectionBadge`. Optionally wrap rule/violation cards in `CornerCard`.

### T10: VERIFY + REVIEW GATE
- `npm test` 17/17, type-check 0, build 0, all routes 200 (esp. /insights, /compliance), reduced-motion paths present.
- PAUSE for user to view Insights + Compliance before Phase 3.

## Phase 3 - Roll to remaining tabs (after review)

### T11: Budgets → expandable rows
Collapse the 6-col table into rows showing category + usage bar; expand for projected/status/inline-edit. `SectionBadge` headers.

### T12: Reports + Receipts → pagination
Reports: load-more pagination on cards (extend ShowMore). Receipts: paginate the missing-receipts table. `SectionBadge` headers.

### T13: apply SectionBadge / CornerCard / BlurText across remaining tabs + Dashboard title
BlurText on page titles (h1) where it reads well; SectionBadge on section headers; CornerCard on select KPI/feature cards. Keep tasteful - don't bracket every card.

### T14: final verify
Full suite + routes 200 + reduced-motion + screenshots/visual review.
