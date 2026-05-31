# Design Decisions

The non-obvious calls and why we made them.

### Framed as a general SMB card-spend product (not the dataset's literal contents)
The brief is "AI expense intelligence for SMBs." The product is positioned and worded generically for any business's company-card spend. Categories shown (Fuel, Permits, etc.) are derived from the actual merchants in the file, but the UI/AI copy never themes the product around a specific industry.

### No fabricated org chart
The data has no department/employee fields. Rather than invent them, the app slices by the **real** dimensions: card (cost-center), merchant, category, location, time. The AI explicitly reframes "which department?" questions. Honest to the data and to the real expense policy, which describes a flat "team member / manager" structure.

### Settlements quarantined from "spend"
The largest line (~$264K) and ~$1.2M total are **bank card-balance payments**, not operational spend. They're categorized as `Payments & Settlements` and excluded from all spend analytics, so a payment never distorts the numbers. Surfaced in Insights as a context flag.

### Reports grouped by jurisdiction + month
The data is shared company spend across many locations (no per-trip identifier), so reports group by **state/province + month** — the natural way a business reviews where and when money went. CFO-ready, with policy flags and AI summaries.

### MCC-derived categories
The file's own category column is 99% one value. Categories come from a curated **MCC → category** map (95 codes) plus merchant-pattern overrides — the real category signal.

### AI is agentic but bounded, and never writes SQL
The chat is a tool-use loop over whitelisted, zod-validated query tools. The other three AI features are single batched JSON calls. This gives multi-step reasoning and contextual judgment without unbounded cost or SQL-injection risk.

### Per-model fallback for resilience
Free-tier quota is per-model, so all AI calls retry down a chain of free Gemini models on `429`. Any available model keeps features working; missing AI degrades to rule-based data, never an error.

### Upload appends + de-duplicates
Uploads add to the dataset (a business accrues transactions over time) and skip exact duplicate charges, so re-uploading an overlapping export is safe.

### Brim teal/cyan branding
Pulled from Brim Financial's actual CSS (`static.brimfinancial.com`): primary teal `#007d93`, accent cyan `#00c1d5`, near-black surfaces — not the purple first assumed. Helvetica Bold throughout.

### Home = cinematic overview; dashboard separate
`/` is a scroll-reveal brand hero ("noise → clarity" particle field); the working dashboard lives at `/dashboard`. Minimal top-nav (Dashboard, Ask AI, and a Menu dropdown) with progressive disclosure (view-more / expand) to keep each page lean.
