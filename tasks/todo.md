# Brim It — Build Plan & Review

AI expense-intelligence platform for the Brim × MPC Hacks challenge.
Full plan: `~/.claude/plans/brim-financial-x-mpc-quirky-pretzel.md`.

## Plan (completed)

- [x] **Phase 0 — Skeleton**: Next 15 + TS + Tailwind 3 + shadcn (from TSA), better-sqlite3 DB singleton, schema.
- [x] **Phase 1 — Data spine**: MCC→category map (95 codes), ETL (xlsx→sqlite, date/CAD/merchant normalization), dashboard.
- [x] **Phase 2 — Talk to Your Data**: Gemini function-calling agent, 5 read-only tools, auto-viz, multi-turn.
- [x] **Phase 3 — Policy Compliance**: 6 rules from the real policy, split-charge detection, AI severity triage.
- [x] **Phase 4 — Pre-Approval**: request synthesis, card-history + budget context, AI approve/deny recs.
- [x] **Phase 5 — Expense Reports**: jurisdiction-period grouping, line items, policy flags, AI CFO summaries.
- [x] **Phase 6 — Insights**: anomaly/fraud, vendor consolidation savings, burn-rate forecasting.
- [x] **Final**: production build passes, all pages 200, deploy config (Dockerfile + render.yaml), README.

## Review

**What shipped.** All four required capabilities plus all three optional ones, each verified end-to-end against the real data (not stubs). Production build is clean (17 routes, 0 type errors).

**The defining decision.** The provided data is a cross-border trucking fleet with no employees/departments — contradicting the brief's narrative. Rather than fabricate an org chart (which the real expense policy would contradict), we built around the real dimensions: MCC-derived categories, cards as cost-centers, jurisdiction-period reporting. This also surfaced genuine findings: the $264K "outlier" is a card-balance payment (quarantined $1.2M of settlements), fuel is fragmented across 218 vendors (~$85K savings), and same-day permit "splits" are legitimate batching (the AI correctly down-ranks them).

**AI depth.** Five distinct Gemini integrations, all bounded: an agentic tool-use loop (chat) and four batched single-call reasoning passes (severity triage, approval recs, report summaries). The model never writes SQL — it calls whitelisted, zod-validated query tools.

**Verification highlights.**
- Chat: multi-turn follow-up reuses prior filters; "which department?" reframes without hallucinating.
- Compliance: AB/OK permit splits → LOW (legit), Michelin tire buys → HIGH (visibility); $591K flagged.
- Approvals: recs cite real budget figures; decisions persist.
- Reports: 12 reports ($305K), TX·Dec = 86 line items / 8 categories; CFO approval persists.
- Insights: 32 duplicate groups, $85K vendor savings, Permits flagged as overrun risk.

## Known scope notes

- Per-truck "trips" are impossible (shared fleet card spans 10–50 states/day) → reports group by jurisdiction+month (IFTA/IRP-style), which is the authentic fleet analog.
- Tip-limit and alcohol rules are defined from the policy but find 0 hits (no such spend in the data) — correct, not a gap.
- Deploy needs a volume-backed host (better-sqlite3); serverless would swap `lib/db.ts` to Turso/libSQL.
