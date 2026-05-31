import { getDb } from "./db";
import { getClient, generateWithFallback } from "./gemini";
import { POLICY_SUMMARY } from "./compliance";
import { cardVolatility } from "./profiles";

// AI Pre-Approval Workflow. Each pending request shows the approver everything
// they need - the requesting card's spend history, the category budget status,
// and an AI approve/deny recommendation with reasoning - so they decide once.

export type ApprovalContext = {
  cardTotalSpend: number;
  cardTxnCount: number;
  cardCategorySpend: number;
  cardMerchantCount: number; // prior txns with this merchant
  categoryMonthlyAvg: number;
  categoryBudget: number;
  categoryThisMonth: number;
  categoryRemaining: number;
  month: string;
  // Transaction snapshot (stored at queue build time)
  txnDate?: string;
  postingDate?: string;
  description?: string;
  mcc?: string;
  subcategory?: string;
  merchantCity?: string;
  state?: string;
  country?: string;
  currency?: string;
  isCrossBorder?: boolean;
  // AI dual-rationale (populated after generateRecommendations)
  approveCase?: string;
  denyCase?: string;
};

export type MerchantHistoryRow = {
  txn_date: string;
  amount_cad: number;
  category: string;
  merchant_name: string;
};

export type RequestViolation = {
  rule_name: string;
  severity: string;
  ai_reasoning: string | null;
};

function buildContext(card: string, category: string, merchant: string, date: string): ApprovalContext {
  const db = getDb();
  const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;
  const month = (date || "").slice(0, 7);

  const cardAgg = db.prepare(`SELECT ROUND(SUM(amount_cad),2) s, COUNT(*) n FROM transactions WHERE ${NON_OP} AND transaction_code=?`).get(card) as any;
  const cardCat = db.prepare(`SELECT ROUND(SUM(amount_cad),2) s FROM transactions WHERE ${NON_OP} AND transaction_code=? AND category=?`).get(card, category) as any;
  const merchN = db.prepare(`SELECT COUNT(*) n FROM transactions WHERE ${NON_OP} AND transaction_code=? AND merchant_name LIKE ?`).get(card, `%${(merchant || "").slice(0, 12)}%`) as any;

  // Category monthly average → a soft budget at 1.25x; remaining vs this month.
  const monthly = db.prepare(`SELECT AVG(ms) a FROM (SELECT substr(txn_date,1,7) m, SUM(amount_cad) ms FROM transactions WHERE ${NON_OP} AND category=? GROUP BY m)`).get(category) as any;
  const avg = Math.round(monthly?.a ?? 0);
  const budget = Math.round(avg * 1.25);
  const thisMonth = (db.prepare(`SELECT ROUND(SUM(amount_cad),2) s FROM transactions WHERE ${NON_OP} AND category=? AND substr(txn_date,1,7)=?`).get(category, month) as any)?.s ?? 0;

  return {
    cardTotalSpend: cardAgg?.s ?? 0,
    cardTxnCount: cardAgg?.n ?? 0,
    cardCategorySpend: cardCat?.s ?? 0,
    cardMerchantCount: merchN?.n ?? 0,
    categoryMonthlyAvg: avg,
    categoryBudget: budget,
    categoryThisMonth: thisMonth,
    categoryRemaining: Math.round(budget - thisMonth),
    month,
  };
}

/** Rebuild the pending queue from real high-value / notable transactions. */
export function synthesizeRequests(): number {
  const db = getDb();
  db.prepare(`DELETE FROM requests`).run();

  // Candidates: material single charges that the policy says need pre-authorization,
  // plus a couple of split-charge groups for the approver to weigh in on.
  const candidates = db
    .prepare(
      `SELECT id, transaction_code, category, merchant_name, amount_cad, txn_date, posting_date,
              description, mcc, subcategory, merchant_city, state_province, country, currency, is_cross_border
       FROM transactions
       WHERE category NOT IN ('Payments & Settlements') AND direction='Debit' AND amount_cad >= 5000
       ORDER BY amount_cad DESC LIMIT 8`
    )
    .all() as any[];

  const reasons: Record<string, string> = {
    "Maintenance & Repair": "Maintenance / equipment purchase requiring pre-authorization.",
    Telecom: "Recurring telecom / connectivity service.",
    "Permits & Compliance": "Operating permit / compliance fee for upcoming work.",
    Fuel: "Bulk fuel purchase above the approval threshold.",
    "Office & Admin": "Operational supplies / services above threshold.",
  };

  const ins = db.prepare(
    `INSERT INTO requests (transaction_id, transaction_code, category, merchant_name, amount_cad, reason, status, ai_context)
     VALUES (@transaction_id,@transaction_code,@category,@merchant_name,@amount_cad,@reason,'pending',@ai_context)`
  );
  const tx = db.transaction((rows: any[]) => {
    for (const r of rows) {
      const ctx = buildContext(r.transaction_code, r.category, r.merchant_name, r.txn_date);
      ins.run({
        transaction_id: r.id,
        transaction_code: r.transaction_code,
        category: r.category,
        merchant_name: r.merchant_name,
        amount_cad: r.amount_cad,
        reason: reasons[r.category] || "Expense requiring approval.",
        ai_context: JSON.stringify({
          ...ctx,
          txnDate: r.txn_date,
          postingDate: r.posting_date,
          description: r.description,
          mcc: r.mcc,
          subcategory: r.subcategory,
          merchantCity: r.merchant_city,
          state: r.state_province,
          country: r.country,
          currency: r.currency,
          isCrossBorder: !!r.is_cross_border,
        }),
      });
    }
  });
  tx(candidates);
  return candidates.length;
}

/** Build the rich per-request payload (card history, budget status, policy flags,
 *  merchant history) the AI/agents reason over. Shared by the single-call path and
 *  the multi-agent debate so the two never drift. */
export function buildRequestPayload(db: import("better-sqlite3").Database, r: any) {
  const ctx = JSON.parse(r.ai_context || "{}");
  const violations = db
    .prepare(`SELECT rule_name, severity FROM violations WHERE transaction_id=? AND status='open'`)
    .all(r.transaction_id) as RequestViolation[];
  const merchantHistory = db
    .prepare(
      `SELECT txn_date, amount_cad, category, merchant_name FROM transactions
       WHERE category NOT IN ('Payments & Settlements') AND direction='Debit'
         AND transaction_code=? AND merchant_name LIKE ? AND id != ?
       ORDER BY txn_date DESC LIMIT 5`
    )
    .all(r.transaction_code, `%${(r.merchant_name || "").slice(0, 12)}%`, r.transaction_id ?? 0) as MerchantHistoryRow[];
  const card = db.prepare(`SELECT label, cardholder_alias FROM cards WHERE transaction_code=?`).get(r.transaction_code) as any;
  const vol = cardVolatility(r.transaction_code, db);

  return {
    id: r.id,
    card: r.transaction_code,
    card_volatility: vol.volatility,
    spend_volatility: vol.vsBaseline >= 1.5 ? `${vol.vsBaseline}× baseline (volatile)` : vol.vsBaseline <= 0.6 ? `${vol.vsBaseline}× baseline (steady)` : `${vol.vsBaseline}× baseline`,
    cardholder: card?.cardholder_alias ?? card?.label,
    merchant: r.merchant_name,
    category: r.category,
    amount_cad: r.amount_cad,
    reason: r.reason,
    txn_date: ctx.txnDate,
    location: [ctx.merchantCity, ctx.state, ctx.country].filter(Boolean).join(", "),
    description: ctx.description,
    mcc: ctx.mcc,
    cross_border: ctx.isCrossBorder,
    card_total_spend: ctx.cardTotalSpend,
    card_txn_count: ctx.cardTxnCount,
    card_category_spend: ctx.cardCategorySpend,
    prior_txns_with_merchant: ctx.cardMerchantCount,
    category_budget: ctx.categoryBudget,
    category_monthly_avg: ctx.categoryMonthlyAvg,
    category_spent_this_month: ctx.categoryThisMonth,
    category_remaining: ctx.categoryRemaining,
    policy_flags: violations,
    prior_merchant_txns: merchantHistory,
  };
}

/** One Gemini call → approve/deny/review recommendation + reasoning for all pending requests. */
export async function generateRecommendations(): Promise<number> {
  const ai = getClient();
  if (!ai) return 0;
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM requests WHERE status='pending'`).all() as any[];
  if (!pending.length) return 0;

  const payload = pending.map((r) => buildRequestPayload(db, r));

  const prompt = `${POLICY_SUMMARY}

You are the finance approver for a small/medium business managing company-card spend across Canada and the USA. For each pre-approval request, weigh policy compliance, card spending history, category budget headroom, merchant familiarity, location, and any policy flags.

For each request return:
- recommendation: "approve", "deny", or "review"
- confidence: 0..1
- reasoning: 2–3 sentences summarizing your call, citing specific numbers (amounts, budget remaining, prior merchant count)
- approve_case: 2–3 sentences on why approving would be reasonable given the transaction details and context (even if you recommend deny/review)
- deny_case: 2–3 sentences on why denying would be reasonable given the risks, policy, or budget pressure (even if you recommend approve/review)

Return ONLY a JSON array:
[{"id": <number>, "recommendation": "approve|deny|review", "confidence": <0..1>, "reasoning": "...", "approve_case": "...", "deny_case": "..."}]

Requests:
${JSON.stringify(payload, null, 1)}`;

  let text = "";
  try {
    const { resp } = await generateWithFallback(ai, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2, responseMimeType: "application/json" },
    });
    text = resp.text || "";
  } catch (e) {
    console.error("[approvals AI]", e);
    return 0;
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return 0;
    parsed = JSON.parse(m[0]);
  }

  const upd = db.prepare(`UPDATE requests SET ai_recommendation=?, ai_confidence=?, ai_reasoning=?, ai_context=? WHERE id=?`);
  let n = 0;
  const tx = db.transaction((items: any[]) => {
    for (const it of items) {
      const rec = ["approve", "deny", "review"].includes(it.recommendation) ? it.recommendation : "review";
      const row = pending.find((r) => r.id === it.id);
      const ctx = JSON.parse(row?.ai_context || "{}");
      if (it.approve_case) ctx.approveCase = it.approve_case;
      if (it.deny_case) ctx.denyCase = it.deny_case;
      upd.run(rec, Number(it.confidence) || null, it.reasoning ?? null, JSON.stringify(ctx), it.id);
      n++;
    }
  });
  tx(parsed);
  return n;
}

function enrichRequest(row: any) {
  const db = getDb();
  const context: ApprovalContext = JSON.parse(row.ai_context || "{}");
  const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

  const card = db.prepare(`SELECT label, cardholder_alias FROM cards WHERE transaction_code=?`).get(row.transaction_code) as any;

  const merchantHistory = db
    .prepare(
      `SELECT txn_date, amount_cad, category, merchant_name FROM transactions
       WHERE ${NON_OP} AND transaction_code=? AND merchant_name LIKE ? AND id != ?
       ORDER BY txn_date DESC LIMIT 5`
    )
    .all(row.transaction_code, `%${(row.merchant_name || "").slice(0, 12)}%`, row.transaction_id ?? 0) as MerchantHistoryRow[];

  const violations = row.transaction_id
    ? (db
        .prepare(`SELECT rule_name, severity, ai_reasoning FROM violations WHERE transaction_id=? AND status='open'`)
        .all(row.transaction_id) as RequestViolation[])
    : [];

  // Backfill txn fields for rows queued before the richer snapshot was stored.
  if (row.transaction_id && !context.txnDate) {
    const txn = db.prepare(`SELECT * FROM transactions WHERE id=?`).get(row.transaction_id) as any;
    if (txn) {
      Object.assign(context, {
        txnDate: txn.txn_date,
        postingDate: txn.posting_date,
        description: txn.description,
        mcc: txn.mcc,
        subcategory: txn.subcategory,
        merchantCity: txn.merchant_city,
        state: txn.state_province,
        country: txn.country,
        currency: txn.currency,
        isCrossBorder: !!txn.is_cross_border,
      });
    }
  }

  return {
    ...row,
    context,
    cardholder: card?.cardholder_alias ?? card?.label ?? row.transaction_code,
    cardLabel: card?.label,
    merchantHistory,
    violations,
  };
}

export function getRequests(status?: string): any[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM requests ${status ? "WHERE status=?" : ""} ORDER BY (status='pending') DESC, amount_cad DESC`)
    .all(...(status ? [status] : [])) as any[];
  return rows.map(enrichRequest);
}

export function decideRequest(id: number, decision: "approved" | "denied", by = "Finance Manager") {
  const db = getDb();
  db.prepare(`UPDATE requests SET status=?, decided_by=?, decided_at=datetime('now') WHERE id=?`).run(decision, by, id);
  return getDb().prepare(`SELECT * FROM requests WHERE id=?`).get(id);
}

export function getApprovalSummary() {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) n, ROUND(SUM(amount_cad),2) amt FROM requests GROUP BY status`).all() as any[];
  const out: any = { pending: 0, approved: 0, denied: 0, pendingAmount: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    if (r.status === "pending") out.pendingAmount = r.amt;
  }
  return out;
}
