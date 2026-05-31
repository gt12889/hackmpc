# Brim It - AI Expense Intelligence

**Brim Financial × MPC Hacks.** An AI-powered expense-intelligence platform for SMB credit-card spending - built on real (anonymized) company-card transaction data and the real Brim expense policy. *Make the data talk.*

A non-technical finance manager can chat with their company's spend in plain English, manage a digitized expense policy and triage violations, run an AI pre-approval queue, and generate review-ready expense reports - all grounded in real numbers.


## Documentation

## Working with the real data

The dataset is **4,235 anonymized company-card transactions** (Aug 2025–Mar 2026, CAD). A few things shaped the build:

- **No department/employee columns** - the data is organized by **card** (cost-center), **merchant**, **category**, **location**, and **time**. The app uses those real dimensions instead of inventing an org chart, and the AI reframes "which department?" questions accordingly.
- **Categories are derived from MCC codes** (`lib/mcc-seed.ts`, 95 codes), since the file's own category column is unusable (99% one value).
- **The single largest line ($264,517) is a card-balance payment, not spend** - we detect and **quarantine $1.2M of such settlements** so they don't distort the analytics.

## The four required capabilities

1. **Talk to Your Data** (**Ask AI**, floating on every page) - Agentic conversational analytics. Google Gemini runs a **function-calling loop** over 5 read-only query tools (aggregate, time-series, top-merchants, list, compare), auto-renders the right viz (bar/line/pie/table/stat), and handles **multi-turn follow-ups** ("now just Texas, monthly" reuses prior filters) - never inventing numbers.

2. **Policy Compliance Engine** (**Governance → Violations**) - Six rules **digitized from the real Brim policy** ($50 pre-auth, no traffic/parking tickets, alcohol restriction, tips, etc.). Auto-scans transactions, detects **split-charge evasion** (same card+merchant+day crossing a threshold), surfaces **repeat offenders**, and applies an **AI contextual severity pass** - distinguishing legitimate same-day batching from genuine threshold-ducking.

3. **AI Pre-Approval Workflow** (**Workflow → Approvals**) - Each request shows the card's spend history, prior-vendor count, and **category budget status**, plus a Gemini **approve / deny / review** recommendation citing the real numbers. The approver decides once; decisions persist.

4. **Automated Expense Reports** (**Workflow → Reports**) - Transactions auto-grouped by **location + month** with category breakdowns, line items, policy-flag counts, and **AI-written CFO summaries**, ready for one-click approval.

## Optional capabilities (`/insights`)

- **Anomaly & fraud** - duplicate/recurring charges, round-number patterns, outliers (plus the settlement-vs-spend context flag).
- **Vendor consolidation** - fragmented spend (e.g. fuel across 218 vendors, top one only 22%) → estimated **~$85K** annual savings.
- **Forecasting** - linear burn-rate projection per category with **budget-overrun alerts**.
- **Receipts, Budgets, Recurring spend, Cross-border FX, Spend profiles, and an AI insights feed** round out the `/insights`, `/receipts`, and `/budgets` surfaces.

## Multi-agent layer — Brim Agents (`/workflow` → Agents)

A **Python LangGraph sidecar** adds multi-agent reasoning on top of the single-call AI. Four swarms: an approval **debate** (Prosecutor ‖ Defender → Judge), a **fraud investigator** (one agent per suspect), a **compliance reviewer + false-positive challenger** (cuts unnecessary critical phone alerts), and an **insights multi-lens sweep** (4 lenses → ranker). The sidecar is **stateless** (the TS routes gather context and persist results + per-agent traces) and **degrades gracefully** — if it isn't running, every route falls back to the original single-call path. The **Agents** tab # Brim It - AI Expense Intelligence

**Brim Financial × MPC Hacks.** An AI-powered expense-intelligence platform for SMB credit-card spending - built on real (anonymized) company-card transaction data and the real Brim expense policy. *Make the data talk.*

A non-technical finance manager can chat with their company's spend in plain English, manage a digitized expense policy and triage violations, run an AI pre-approval queue, and generate review-ready expense reports - all grounded in real numbers.

> **Pages:** `/` is a cinematic scroll-reveal brand overview. The app is four surfaces - **Overview** (Spending · Budgets), **Insights**, **Governance** (Violations · Receipts · Audit), and **Workflow** (Approvals · Reports · Agents) - plus a floating **Ask AI** chat on every page. The older `/dashboard`, `/compliance`, `/approvals`, `/reports`, `/chat` routes redirect into these.


## On-chain audit trail (`/audit`)

Every report approval, pre-approval decision, and HIGH/CRITICAL compliance alert is **notarized on Solana**: a SHA-256 of the record's canonical snapshot is written into a Solana **Memo transaction** (devnet), giving a publicly verifiable Explorer link. A **Verify** action re-hashes the live record and compares it to the immutable on-chain hash, so any post-approval **tampering is provably detectable**. Server-side keypair (no wallet needed), env-gated, best-effort (never blocks an approval). See [Solana Audit Anchor](docs/SOLANA.md). Run `npm run solana:setup` to provision a funded devnet keypair.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/Radix · Recharts · **better-sqlite3** · **Google Gemini** (`@google/genai`) **+ OpenAI** (`gpt-4o-mini`, via the sidecar) · **Brim Agents** sidecar (Python · FastAPI · **LangGraph** · langchain) · **Solana** (`@solana/web3.js` + `@solana/spl-memo`) · ElevenLabs + Twilio (voice) · Spline/three/GSAP (landing) · swr · sonner · zod. **Full library list in [Submission](docs/SUBMISSION.md).** Branded in Brim's teal/cyan (`#007d93` / `#00c1d5`).


**Critical** compliance alerts call your phone via an ElevenLabs Conversational AI agent over Twilio (high/medium/low stay in the in-app bell only). The same agent has no persona - it announces itself as the automated Brim compliance line - and can also answer inbound questions about compliance.




## Deploy

`better-sqlite3` needs a persistent filesystem. Deploy to a host with a volume (Render / Railway / Fly) and run `npm run db:reset` on first boot - see `Dockerfile` and `render.yaml`. For a serverless target (Vercel), swap the client in `lib/db.ts` to Turso/libSQL (SQLite-compatible). Full instructions in [Setup & Deploy](docs/SETUP-AND-DEPLOY.md).
