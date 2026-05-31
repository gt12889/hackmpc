import { getDb } from "./db";
import { getClient, generateWithFallback } from "./gemini";
import { POLICY_SUMMARY } from "./compliance";

// AI Pre-Approval Workflow. Each pending request shows the approver everything
// they need — the requesting card's spend history, the category budget status,
// and an AI approve/deny recommendation with reasoning — so they decide once.

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
      `SELECT id, transaction_code, category, merchant_name, amount_cad, txn_date, state_province, country
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
        ai_context: JSON.stringify({ ...ctx, state: r.state_province, country: r.country }),
      });
    }
  });
  tx(candidates);
  return candidates.length;
}

/** One Gemini call → approve/deny/review recommendation + reasoning for all pending requests. */
export async function generateRecommendations(): Promise<number> {
  const ai = getClient();
  if (!ai) return 0;
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM requests WHERE status='pending'`).all() as any[];
  if (!pending.length) return 0;

  const payload = pending.map((r) => {
    const ctx = JSON.parse(r.ai_context || "{}");
    return {
      id: r.id,
      card: r.transaction_code,
      merchant: r.merchant_name,
      category: r.category,
      amount_cad: r.amount_cad,
      reason: r.reason,
      card_total_spend: ctx.cardTotalSpend,
      card_category_spend: ctx.cardCategorySpend,
      prior_txns_with_merchant: ctx.cardMerchantCount,
      category_budget: ctx.categoryBudget,
      category_spent_this_month: ctx.categoryThisMonth,
      category_remaining: ctx.categoryRemaining,
    };
  });

  const prompt = `${POLICY_SUMMARY}

You are the finance approver for a small/medium business. For each pre-approval request below, decide a recommendation: "approve", "deny", or "review" (needs more info). Weigh: policy compliance, whether the amount fits the card's history and the category budget, and whether the merchant is an established/legitimate vendor. Established vendors with consistent history and budget headroom → approve. Over-budget or unusual merchant/amount → review or deny.

Return ONLY a JSON array: [{"id": <number>, "recommendation": "approve|deny|review", "confidence": <0..1>, "reasoning": "<2 sentences citing the history/budget numbers>"}].

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

  const upd = db.prepare(`UPDATE requests SET ai_recommendation=?, ai_confidence=?, ai_reasoning=? WHERE id=?`);
  let n = 0;
  const tx = db.transaction((items: any[]) => {
    for (const it of items) {
      const rec = ["approve", "deny", "review"].includes(it.recommendation) ? it.recommendation : "review";
      upd.run(rec, Number(it.confidence) || null, it.reasoning ?? null, it.id);
      n++;
    }
  });
  tx(parsed);
  return n;
}

export function getRequests(status?: string): any[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM requests ${status ? "WHERE status=?" : ""} ORDER BY (status='pending') DESC, amount_cad DESC`)
    .all(...(status ? [status] : [])) as any[];
  return rows.map((r) => ({ ...r, context: JSON.parse(r.ai_context || "{}") }));
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
