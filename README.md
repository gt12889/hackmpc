# Brim It - AI Expense Intelligence

**Brim Financial × MPC Hacks.** An AI-powered expense-intelligence platform for SMB credit-card spending - built on real (anonymized) company-card transaction data and the real Brim expense policy. *Make the data talk.*

A non-technical finance manager can chat with their company's spend in plain English, manage a digitized expense policy and triage violations, run an AI pre-approval queue, and generate review-ready expense reports - all grounded in real numbers.

> **Pages:** `/` is a cinematic scroll-reveal brand overview. The app is four surfaces - **Overview** (Spending · Budgets), **Insights**, **Governance** (Violations · Receipts · Audit), and **Workflow** (Approvals · Reports · Agents) - plus a floating **Ask AI** chat on every page. The older `/dashboard`, `/compliance`, `/approvals`, `/reports`, `/chat` routes redirect into these.

## Documentation
```




Full docs live in [`docs/`](docs/):

- [Submission](docs/SUBMISSION.md) - the writeup (Inspiration / build / challenges), full tech list, and judging scorecard
- [Architecture](docs/ARCHITECTURE.md) - stack, data flow, module map, patterns
- [Features](docs/FEATURES.md) - the 4 required + 3 optional + import, with file references
- [Brim Agents](docs/AGENTS.md) - the Python/LangGraph multi-agent sidecar (debate, fraud, compliance, insights swarms)
- [Data & Ingest](docs/DATA-AND-INGEST.md) - dataset, schema, the shared ingest pipeline, dedup
- [AI Layer](docs/AI.md) - agentic chat, batched passes, model fallback, configuration
- [Setup & Deploy](docs/SETUP-AND-DEPLOY.md) - scripts, env, hosting, troubleshooting
- [Solana Audit Anchor](docs/SOLANA.md) - on-chain tamper-evidence for approvals & alerts
- [Design Decisions](docs/DECISIONS.md) - the non-obvious calls and why

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

A **Python LangGraph sidecar** adds multi-agent reasoning on top of the single-call AI. Four swarms: an approval **debate** (Prosecutor ‖ Defender → Judge), a **fraud investigator** (one agent per suspect), a **compliance reviewer + false-positive challenger** (cuts unnecessary critical phone alerts), and an **insights multi-lens sweep** (4 lenses → ranker). The sidecar is **stateless** (the TS routes gather context and persist results + per-agent traces) and **degrades gracefully** — if it isn't running, every route falls back to the original single-call path. The **Agents** tab visualizes the swarm running live. Run with `npm run agents` (optional). Full detail in [Brim Agents](docs/AGENTS.md).

## On-chain audit trail (`/audit`)

Every report approval, pre-approval decision, and HIGH/CRITICAL compliance alert is **notarized on Solana**: a SHA-256 of the record's canonical snapshot is written into a Solana **Memo transaction** (devnet), giving a publicly verifiable Explorer link. A **Verify** action re-hashes the live record and compares it to the immutable on-chain hash, so any post-approval **tampering is provably detectable**. Server-side keypair (no wallet needed), env-gated, best-effort (never blocks an approval). See [Solana Audit Anchor](docs/SOLANA.md). Run `npm run solana:setup` to provision a funded devnet keypair.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/Radix · Recharts · **better-sqlite3** · **Google Gemini** (`@google/genai`) **+ OpenAI** (`gpt-4o-mini`, via the sidecar) · **Brim Agents** sidecar (Python · FastAPI · **LangGraph** · langchain) · **Solana** (`@solana/web3.js` + `@solana/spl-memo`) · ElevenLabs + Twilio (voice) · Spline/three/GSAP (landing) · swr · sonner · zod. **Full library list in [Submission](docs/SUBMISSION.md).** Branded in Brim's teal/cyan (`#007d93` / `#00c1d5`).

## Run it locally

```bash
npm install
cp .env.example .env.local         # add your GEMINI_API_KEY
npm run db:reset                   # ETL the data + seed policies/approvals/reports
npm run dev                        # http://localhost:3000
```

`npm run db:reset` rebuilds the SQLite DB from `data/transactions.xlsx`: normalizes dates, CAD amounts, and MCC→category mapping (`scripts/etl.ts`), then seeds policy rules, the approval queue, and expense reports. Without a Gemini key the app still runs - the rule-based engines populate; only the AI reasoning/summaries are skipped.

**Multi-agent swarms (optional):** to enable the Brim Agents layer, run the Python sidecar alongside the dev server:

```bash
cd agents && uv sync               # one time (Python 3.12 + LangGraph deps)
npm run agents                     # uvicorn on :8200
```

Set **`OPENAI_API_KEY`** for the sidecar (recommended - the swarm fires more calls than Gemini's free tier allows; it uses your Gemini key otherwise). The app falls back to single-call AI when the sidecar isn't running. See [Brim Agents](docs/AGENTS.md).

**Upload your own data:** the **Import** button on the Dashboard accepts a `.csv` or `.xlsx` card export. It runs the same ingest pipeline (`lib/ingest.ts`, shared with the ETL script) - tolerant of common column-name variants (Date/Merchant/Amount/MCC/Card…) and of either Excel-serial or real date strings. New rows are **appended** (existing data kept) and **de-duplicated** against existing charges, then compliance re-scans and approvals/reports regenerate. See [Data & Ingest](docs/DATA-AND-INGEST.md).

## Architecture notes

- **No raw SQL from the model.** The agent calls parameterized, whitelisted, zod-validated query tools (`lib/tools.ts` → `lib/queries.ts`). The same query layer backs the dashboard.
- **AI is bounded**: each non-chat AI feature is one batched Gemini call (severity triage, approval recs, report summaries) with `responseMimeType: application/json`.
- **Per-model fallback**: `lib/gemini.ts` retries `429`s down a chain of free Gemini models, so any available model serves the request. See [AI Layer](docs/AI.md).

Deeper dives in [`docs/`](docs/).

## Phone-call alerts (optional)

**Critical** compliance alerts call your phone via an ElevenLabs Conversational AI agent over Twilio (high/medium/low stay in the in-app bell only). The same agent has no persona - it announces itself as the automated Brim compliance line - and can also answer inbound questions about compliance.

1. Create a Conversational AI agent in ElevenLabs; copy its **Agent ID**.
2. Import your Twilio number into ElevenLabs; copy the **phone number ID**.
3. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ALERT_PHONE_NUMBER` in `.env.local`.
4. On the **Compliance** page, flip **Phone alerts** on and hit **Test call**.

Alerts always appear in the in-app notification bell regardless of phone config. Calls are deduped (one per distinct alert) and capped at 3 per scan; the rest stay in the feed. Twilio trial accounts can only call verified numbers.

**Notes & limitations:**
- Turn **Phone alerts** on *before* running a scan. Alerts already in the feed from an earlier scan are not re-called when you toggle calling on later - use the **Test call** button to place a live call at any time.
- An alert's severity is recorded when it's first seen. If a later AI re-rating escalates an existing alert into critical, that change won't trigger a new call (it's still visible in the bell).

## Deploy

`better-sqlite3` needs a persistent filesystem. Deploy to a host with a volume (Render / Railway / Fly) and run `npm run db:reset` on first boot - see `Dockerfile` and `render.yaml`. For a serverless target (Vercel), swap the client in `lib/db.ts` to Turso/libSQL (SQLite-compatible). Full instructions in [Setup & Deploy](docs/SETUP-AND-DEPLOY.md).
