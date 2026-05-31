# Design Decisions

The non-obvious calls and why we made them.

### Framed as a general SMB card-spend product (not the dataset's literal contents)
The brief is "AI expense intelligence for SMBs." The product is positioned and worded generically for any business's company-card spend. Categories shown (Fuel, Permits, etc.) are derived from the actual merchants in the file, but the UI/AI copy never themes the product around a specific industry.

### No fabricated org chart
The data has no department/employee fields. Rather than invent them, the app slices by the **real** dimensions: card (cost-center), merchant, category, location, time. The AI explicitly reframes "which department?" questions. Honest to the data and to the real expense policy, which describes a flat "team member / manager" structure.

### Settlements quarantined from "spend"
The largest line (~$264K) and ~$1.2M total are **bank card-balance payments**, not operational spend. They're categorized as `Payments & Settlements` and excluded from all spend analytics, so a payment never distorts the numbers. Surfaced in Insights as a context flag.

### Reports grouped by jurisdiction + month
The data is shared company spend across many locations (no per-trip identifier), so reports group by **state/province + month** - the natural way a business reviews where and when money went. CFO-ready, with policy flags and AI summaries.

### MCC-derived categories
The file's own category column is 99% one value. Categories come from a curated **MCC → category** map (95 codes) plus merchant-pattern overrides - the real category signal.

### AI is agentic but bounded, and never writes SQL
The chat is a tool-use loop over whitelisted, zod-validated query tools. The other three AI features are single batched JSON calls. This gives multi-step reasoning and contextual judgment without unbounded cost or SQL-injection risk.

### Per-model fallback for resilience
Free-tier quota is per-model, so all AI calls retry down a chain of free Gemini models on `429`. Any available model keeps features working; missing AI degrades to rule-based data, never an error.

### Upload appends + de-duplicates
Uploads add to the dataset (a business accrues transactions over time) and skip exact duplicate charges, so re-uploading an overlapping export is safe.

### Brim teal/cyan branding
Pulled from Brim Financial's actual CSS (`static.brimfinancial.com`): primary teal `#007d93`, accent cyan `#00c1d5`, near-black surfaces - not the purple first assumed. Helvetica Bold throughout.

### Home = cinematic overview; app consolidated into four surfaces
`/` is a scroll-reveal brand hero ("noise → clarity" particle field + a Spline 3D scene). The working app is four nav surfaces - **Overview** (Spending · Budgets), **Insights**, **Governance** (Violations · Receipts · Audit), and **Workflow** (Approvals · Reports · Agents) - with sub-tabs, plus a floating **Ask AI** chat on every page. The earlier per-feature routes (`/dashboard`, `/compliance`, `/approvals`, `/reports`, `/chat`) redirect into these. On the landing page the nav hides and the blue ribbon slides out on hover.

### On-chain anchoring: devnet, server keypair, Memo program
The audit anchor uses a Solana **Memo transaction on devnet**, signed by a **server-side keypair**, rather than a custom Anchor program, an SPL-token settlement, or a browser wallet. Rationale: the Memo program needs nothing deployed, the server keypair means zero setup for a judge, and it stays server-only so `@solana/web3.js` never enters the client bundle. It is best-effort and env-gated, so it never blocks an approval and is simply off when `SOLANA_PAYER_SECRET` is unset. See [SOLANA.md](SOLANA.md).

### Multi-agent reasoning in a Python LangGraph sidecar
The four agentic upgrades (debate, fraud investigator, compliance reviewer + challenger, insights sweep) run in a **separate stateless Python service** (`agents/`, FastAPI + **LangGraph** + langchain-google-genai), not hand-rolled in TypeScript. Rationale: LangGraph gives real graph primitives (parallel fan-out, `Send` map-reduce, fan-in joins) with far less glue, and Python is the natural home for the agent ecosystem. The sidecar **never touches the DB** — the TS routes gather context, call it, and persist results + per-agent traces — so writes stay in one language and there's no dual-DB-access risk. It **degrades gracefully**: if the sidecar is down or `AGENTS_SWARM_ENABLED=false`, every route falls back to its original single-call AI pass, so the sidecar is optional to run. See [AGENTS.md](AGENTS.md).

### Sidecar LLM: OpenAI for the swarm, Gemini for everything else
A multi-agent run fires many LLM calls at once, which the Gemini **free tier (~20/min)** cannot feed - calls 429, LangChain retries with backoff, and the run times out into the fallback. So the sidecar uses **OpenAI `gpt-4o-mini`** when `OPENAI_API_KEY` is set (one capable model, real per-key limits), and Gemini otherwise. The main TS app keeps using Gemini. This is the one place where provider choice, not architecture, decided whether the feature actually runs.

### One universal error modal ("API credits ran out")
Any genuine failure across the site (a 5xx response, a network error, or an unhandled rejection) pops a single themed modal with a fixed message, instead of a broken screen or a raw stack. It is installed once in `components/api-error-modal.tsx` by wrapping `window.fetch` + an `unhandledrejection` listener, ignores expected 4xx (auth/validation) and intentional aborts, and is throttled so background polling can't spam it. Chosen for demo resilience: an exhausted key never looks like a crash.

### Self-assessed scorecard
See [SUBMISSION.md](SUBMISSION.md) for the writeup and the rubric mapping (required /6, optional /6, AI depth /4, UI/UX /4) with evidence.
