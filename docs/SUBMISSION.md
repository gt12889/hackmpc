# Brim It - Submission

AI-powered expense intelligence for SMBs. Built for **Brim Financial x MPC Hacks** on real
(anonymized) company-card data and the real Brim expense policy.

---

## Inspiration

The Brim challenge: SMBs generate thousands of card transactions a month but have no way to
understand their own spending. Brim wanted to change that, and asked us to "make the data talk."

Two things shaped our take. First, we wanted a finance manager (not an analyst) to get answers,
catch policy breaches, approve spend, and file reports without touching a spreadsheet. Second,
the provided dataset turned out to be a cross-border fleet with **no employees or departments**,
contradicting the brief's "Sarah from Marketing" framing. Rather than fabricate an org chart, we
leaned into honesty: we built around the dimensions the data actually has (card as cost-center,
category, merchant, jurisdiction, time) and made the AI explain that reframing when asked. That
constraint became a design principle: the product is trustworthy because it never invents data.

## What it does

A finance manager can:

1. **Talk to their data** - ask in plain English ("top categories by spend", "USA vs Canada by
   month") and get the right chart plus a one-line answer, with multi-turn follow-ups that reuse
   context. Every number traces back to the rows behind it.
2. **Digitize and enforce policy** - six rules from the real Brim policy auto-scan every
   transaction, catch **split-charge evasion** (two sub-threshold charges that sum over the limit),
   roll up **repeat offenders**, and apply **contextual AI severity** (a legit same-day permit
   batch is LOW; genuine threshold-ducking is HIGH).
3. **Run an AI pre-approval queue** - each request shows the card's history, category budget
   headroom, and policy flags, plus an AI **approve/deny/review** recommendation with reasoning.
   One click decides it.
4. **Generate CFO-ready expense reports** - transactions auto-group by jurisdiction + month with a
   category breakdown, policy-flag count, and an AI-written summary, ready for one-click sign-off.

On top of the four required features it adds: anomaly & fraud detection, vendor-consolidation
savings, burn-rate forecasting, receipt matching (AI Vision OCR), per-category budgets,
recurring-spend detection, cross-border FX exposure, spend profiles, and an AI insights feed -
all on an animated bento dashboard. Two things set it apart: a **multi-agent reasoning layer**
(a Python LangGraph swarm) and **on-chain tamper-proof audit anchoring** (Solana). Critical
compliance alerts can even place an **interactive phone call** (ElevenLabs + Twilio).

## How we built it

**Deterministic core, AI augmentation.** Every number comes from parameterized SQL over the real
data; the AI only interprets, judges, and narrates, and never has DB access or writes SQL. That
makes the output trustworthy and makes AI failures non-fatal.

- **App:** Next.js 15 (App Router, React Server Components), TypeScript, Tailwind + shadcn/Radix,
  Recharts for auto-rendered charts. One SQLite database (`better-sqlite3`, single WAL connection,
  schema applied on first open).
- **Data spine:** a shared ingest pipeline (`lib/ingest.ts`) normalizes the xlsx and any uploaded
  CSV/XLSX into a wide `transactions` table (MCC-derived categories, normalized merchants, signed
  CAD, cross-border/round-number flags), so the read path is pure aggregation. One query layer
  (`lib/queries.ts`) backs both the dashboard and the AI tools, so they can never disagree.
- **AI layer (Google Gemini, `@google/genai`):** a function-calling **agent loop** for chat (5
  whitelisted, zod-validated query tools, auto-viz, lineage trail) plus bounded single-call JSON
  passes for severity triage, approval recs, and report summaries, all behind a per-model 429/404
  fallback chain.
- **Multi-agent sidecar (Python):** FastAPI + **LangGraph** + langchain (Gemini and OpenAI) +
  Pydantic. Four swarms: approval **debate** (Prosecutor and Defender in parallel, then a Judge),
  per-suspect **fraud investigators**, a **compliance reviewer + false-positive challenger**, and
  an **insights multi-lens sweep** (4 lenses, then a ranker). Stateless: the TS routes gather
  context, call it, and persist results + per-agent traces; if it is offline, every route falls
  back to the single-call AI path.
- **On-chain audit (Solana):** `@solana/web3.js` + `@solana/spl-memo` write a SHA-256 of each
  approved record into a devnet Memo transaction (server keypair, server-only), with a Verify
  action that re-hashes the live record to detect tampering.
- **Voice alerts:** ElevenLabs Conversational AI over Twilio for critical alerts.
- **Landing:** a cinematic scroll-reveal hero with a Spline 3D scene (`@splinetool/react-spline`,
  `three`), GSAP, and a particle canvas.

## Challenges we ran into

- **The data did not match the brief.** No employees or departments. We reframed around the real
  dimensions and taught the AI to explain it, rather than fake an org chart.
- **Free-tier quota cannot feed a swarm.** Gemini's ~20 requests/minute free limit made the
  multi-agent layer time out and degrade. We added an **OpenAI provider** (gpt-4o-mini) to the
  sidecar so the swarm actually completes.
- **Keeping AI bounded and trustworthy.** Whitelisted enum tools + zod validation make the chat
  injection-proof; bounded JSON passes keep cost predictable; graceful fallback keeps the app
  working with no key at all.
- **Robustness of the swarm.** One bad record (a null id) once 500'd a whole batch; we added
  per-item isolation, safe parsing, and a 503 handler so a single failure can't take down a run.
- **Real-world friction.** Solana devnet faucet IP rate-limits, and recurring Next `.next` build-
  cache corruption from running several dev servers at once.

## Accomplishments that we're proud of

- All **four required features work end-to-end on the real data**, not stubs.
- A **genuine multi-agent layer** (parallel fan-out, map-reduce, fan-in via LangGraph), not a
  single-prompt wrapper, with live visualization of the swarm.
- **On-chain tamper-evidence** for financial approvals, with a real Explorer link and a working
  tamper demo.
- **Honest data handling** turned into a feature: the AI surfaces what dimensions exist instead of
  pretending.
- **Graceful degradation at every layer** - no sidecar, no Gemini key, no OpenAI key, no Solana
  wallet: each feature falls back to a deterministic baseline and never throws into a user flow.
- A **polished, finance-manager-first UX**: plain-English chat, color-coded severity, one-click
  approvals, ready-to-sign reports, and a friendly "API credits ran out" modal so an exhausted
  key never looks like a crash.

## What we learned

- **The data rarely matches the brief** - reading it honestly beats forcing the narrative.
- **Deterministic core + AI augmentation** is the pattern that makes AI output trustworthy and its
  failures survivable.
- **Multi-agent reasoning needs real quota** - the architecture was right, but the free tier could
  not feed it; provider choice matters.
- **LangGraph earns its place** when you actually need parallel fan-out and joins; below that, a
  single bounded call is simpler and cheaper.
- **Plan for failure first** - per-item isolation and fallback chains were what kept demos alive.

## What's next for Brim It

- A **department/employee dimension** when the data supports it (or a cardholder-alias layer to
  speak the brief's language).
- A **live bank feed** instead of file uploads, and a richer **policy editor** (author new rules
  from the UI, scoped to cards/categories/people).
- **Production keys** (billing-enabled Gemini/OpenAI) and a **deployed sidecar** so the swarm runs
  in production, plus an optional **mainnet** anchoring tier.
- More agent lenses (tax/IFTA, duplicate-vendor negotiation) and receipt auto-capture from email.

---

## Technologies & libraries

**Core app:** Next.js 15 (App Router / React Server Components), React 18, TypeScript, Node.

**Data:** SQLite via `better-sqlite3` (single WAL connection); `xlsx` (SheetJS) for CSV/XLSX
ingest; `zod` for validation.

**AI:** Google **Gemini** (`@google/genai`, function-calling + JSON passes, per-model fallback);
**OpenAI** (`gpt-4o-mini`, via the sidecar).

**Multi-agent sidecar (Python):** FastAPI, Uvicorn, **LangGraph**, `langchain-google-genai`,
`langchain-openai`, Pydantic; `uv` for env/deps; pytest.

**Blockchain:** **Solana** `@solana/web3.js` + `@solana/spl-memo` (devnet Memo anchoring, Node
`crypto` for hashing).

**Voice:** ElevenLabs Conversational AI + Twilio.

**UI:** Tailwind CSS + `tailwindcss-animate`, shadcn / Radix UI (`@radix-ui/*`), `lucide-react`
icons, **Recharts**, `@tanstack/react-table`, `sonner` (toasts), `next-themes`, `swr`,
`react-markdown` + `remark-gfm`, `class-variance-authority` + `clsx` + `tailwind-merge`.

**Landing / 3D:** `@splinetool/react-spline` + `@splinetool/runtime`, `three`,
`@sparkjsdev/spark` (Gaussian-splat sky), **GSAP**.

**Tooling:** Vitest (TS) + pytest (Python), tsx, ESLint, PostCSS / Autoprefixer.

---

## How it maps to the judging rubric

| Criterion | Score (self-assessed) | Evidence |
|---|---|---|
| **Required features /6** | ~5-6 | All four verified live on real data: chat (function-calling loop + auto-viz + follow-ups), compliance (6 digitized rules, split-charge detection, AI severity, repeat offenders), pre-approval (full context + AI rec + one-click), reports (jurisdiction+month grouping, AI CFO summary, sign-off). |
| **Optional / creativity / ambition /6** | ~5-6 | 10+ optionals (anomaly, fraud, vendors, forecast, recurring, FX, profiles, receipts via Vision OCR, budgets, insights feed) **plus** two things few will have: a multi-agent LangGraph swarm and on-chain (Solana) tamper-proof audit anchoring; plus voice-call alerts. |
| **AI depth /4** | ~4 | Beyond single prompts: a 5-step chat tool-loop, and real agentic graphs (debate, per-suspect fraud investigators, domain reviewers + challenger, multi-lens insights + ranker) with parallel fan-out and joins, all with graceful fallback. |
| **UI / UX /4** | ~3.5-4 | Icon nav, color-coded severity, one-click actions, auto-rendered charts, animated bento insights, cinematic landing. Built for a non-technical finance manager; visualizations that clarify. |

**Known risk:** the brief assumes employees/departments; this dataset has neither (0 such columns,
9 cards). The app reframes around card/category/jurisdiction and explains it. The demo narration
should lead with that so judges read it as a deliberate, honest choice rather than a gap. See
[DECISIONS.md](DECISIONS.md).
