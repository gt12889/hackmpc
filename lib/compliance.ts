import { getDb } from "./db";
import { getClient, generateWithFallback } from "./gemini";

// Policy Compliance Engine. Scans transactions against configurable rules seeded
// from the REAL Brim expense policy (decoded from the PDF), flags violations,
// ranks by severity, and applies AI contextual judgment ("a $200 team dinner is
// different from a $200 solo dinner" — here: legit permit batching vs. split-to-evade).

export const POLICY_SUMMARY = `Brim Expense Policy (key controls):
- All expenses over $50 require manager pre-authorization; receipts required before reimbursement.
- Splitting a purchase to duck an approval threshold is prohibited (falsifying expense reports).
- Brim does NOT pay for traffic or parking TICKETS, or cars rented for personal use. (Reasonable PAID parking IS reimbursable.)
- Tolls are reimbursed; mileage at Canada Revenue Agency rates.
- No alcohol unless dining with a customer; guest names + purpose required.
- Tips up to 15% (services/porterage); meal tips not reimbursed above 20%.
Context: this is a small/medium business operating across Canada and the US. Recurring operational spend (e.g. permits, fuel, tolls, services) is normal and expected. Multiple charges to the same operational vendor on the same day are often legitimate (per-item fees), not evasion — judge by amount shape and merchant type.`;

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export type Rule = {
  id: number;
  name: string;
  rule_type: string;
  description: string | null;
  scope_category: string | null;
  scope_mcc: string | null;
  scope_merchant: string | null;
  threshold_amount: number | null;
  window: string | null;
  severity_base: string;
  enabled: number;
  policy_clause: string | null;
};

export function getRules(): Rule[] {
  return getDb().prepare(`SELECT * FROM policy_rules ORDER BY id`).all() as Rule[];
}

/** Re-scan all enabled rules. Clears prior violations and rebuilds them. */
export function runScan(): { total: number; byRule: Record<string, number> } {
  const db = getDb();
  db.prepare(`DELETE FROM violations`).run();
  const rules = (db.prepare(`SELECT * FROM policy_rules WHERE enabled=1`).all() as Rule[]);
  const byRule: Record<string, number> = {};

  const ins = db.prepare(`
    INSERT INTO violations (rule_id, rule_name, rule_type, transaction_id, group_key, severity,
                            amount_involved, merchant_name, txn_date, status)
    VALUES (@rule_id, @rule_name, @rule_type, @transaction_id, @group_key, @severity,
            @amount_involved, @merchant_name, @txn_date, 'open')`);

  const insertMany = db.transaction((rows: any[]) => rows.forEach((r) => ins.run(r)));

  for (const rule of rules) {
    const rows = detectForRule(rule);
    insertMany(rows);
    byRule[rule.name] = rows.length;
  }

  const total = (db.prepare(`SELECT COUNT(*) n FROM violations`).get() as any).n;
  return { total, byRule };
}

function detectForRule(rule: Rule): any[] {
  const db = getDb();
  const base = (txnId: number, amount: number, merchant: string, date: string, groupKey: string | null = null) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    transaction_id: txnId,
    group_key: groupKey,
    severity: rule.severity_base,
    amount_involved: amount,
    merchant_name: merchant,
    txn_date: date,
  });
  const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

  switch (rule.rule_type) {
    case "txn_threshold": {
      const scope = rule.scope_category ? `AND category = '${rule.scope_category.replace(/'/g, "''")}'` : "";
      const rows = db
        .prepare(`SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE ${NON_OP} AND amount_cad >= ? ${scope} ORDER BY amount_cad DESC`)
        .all(rule.threshold_amount ?? 5000) as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "split_charge": {
      const t = rule.threshold_amount ?? 5000;
      // Same card + merchant + day, 2+ charges summing over the threshold while
      // each individual charge stays under it — the classic split-to-evade shape.
      const groups = db
        .prepare(
          `SELECT transaction_code, merchant_norm, txn_date, COUNT(*) n,
                  ROUND(SUM(amount_cad),2) s, ROUND(MAX(amount_cad),2) mx
           FROM transactions WHERE ${NON_OP}
           GROUP BY transaction_code, merchant_norm, txn_date
           HAVING n >= 2 AND s >= ? AND mx < ?
           ORDER BY s DESC`
        )
        .all(t, t) as any[];
      const out: any[] = [];
      for (const g of groups) {
        const gk = `${g.transaction_code}|${g.merchant_norm}|${g.txn_date}`;
        const members = db
          .prepare(`SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE ${NON_OP} AND transaction_code=? AND merchant_norm=? AND txn_date=? ORDER BY amount_cad DESC`)
          .all(g.transaction_code, g.merchant_norm, g.txn_date) as any[];
        // One violation row per member, sharing a group_key, amount = group total.
        members.forEach((m) => out.push({ ...base(m.id, g.s, m.merchant_name, g.txn_date, gk) }));
      }
      return out;
    }

    case "restricted_mcc": {
      const rows = db
        .prepare(`SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE category='Restricted'`)
        .all() as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "restricted_merchant": {
      if (!rule.scope_merchant) return [];
      const rows = db
        .prepare(`SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE ${NON_OP} AND merchant_name LIKE ?`)
        .all(`%${rule.scope_merchant}%`) as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "no_tickets": {
      // Narrowly scoped to ACTUAL tickets/citations — paid parking is reimbursable.
      const rows = db
        .prepare(
          `SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE ${NON_OP} AND (
             merchant_name LIKE '%TICKET%' OR merchant_name LIKE '%CITATION%' OR merchant_name LIKE '%INFRACTION%'
             OR merchant_name LIKE '%RED LIGHT%' OR merchant_name LIKE '%PHOTO RADAR%' OR merchant_name LIKE '%PHOTO ENF%'
             OR merchant_name LIKE '%SPEEDING%' OR merchant_name LIKE '%TOLL VIOLATION%')`
        )
        .all() as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "cross_border_review": {
      const rows = db
        .prepare(`SELECT id, amount_cad, merchant_name, txn_date FROM transactions WHERE ${NON_OP} AND is_cross_border=1 AND amount_cad >= ? ORDER BY amount_cad DESC`)
        .all(rule.threshold_amount ?? 10000) as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "category_limit": {
      // Monthly spend in a category exceeding the limit → one violation per breached month.
      if (!rule.scope_category) return [];
      const months = db
        .prepare(
          `SELECT substr(txn_date,1,7) m, ROUND(SUM(amount_cad),2) s, COUNT(*) n, MAX(id) any_id
           FROM transactions WHERE ${NON_OP} AND category=?
           GROUP BY m HAVING s >= ? ORDER BY s DESC`
        )
        .all(rule.scope_category, rule.threshold_amount ?? 100000) as any[];
      return months.map((mo) =>
        base(mo.any_id, mo.s, `${rule.scope_category} — ${mo.m} (${mo.n} txns)`, `${mo.m}-01`, `cat|${rule.scope_category}|${mo.m}`)
      );
    }

    case "missing_receipt": {
      // Material charge over threshold with no matched receipt (policy: receipts required).
      const t = rule.threshold_amount ?? 1000;
      const rows = db
        .prepare(
          `SELECT id, amount_cad, merchant_name, txn_date FROM transactions
           WHERE ${NON_OP} AND amount_cad >= ?
             AND id NOT IN (SELECT transaction_id FROM receipts WHERE transaction_id IS NOT NULL)
           ORDER BY amount_cad DESC LIMIT 60`
        )
        .all(t) as any[];
      return rows.map((r) => base(r.id, r.amount_cad, r.merchant_name, r.txn_date));
    }

    case "tip_limit":
      // Requires receipt/tip-line data not present in card transactions — informational only.
      return [];

    default:
      return [];
  }
}

/** Summary counts for the dashboard cards. */
export function getViolationSummary() {
  const db = getDb();
  const bySev = db.prepare(`SELECT severity, COUNT(DISTINCT COALESCE(group_key, CAST(id AS TEXT))) n FROM violations WHERE status='open' GROUP BY severity`).all() as any[];
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of bySev) counts[r.severity] = r.n;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const amount = (db.prepare(`SELECT ROUND(SUM(amount_involved),2) s FROM (SELECT DISTINCT COALESCE(group_key, CAST(id AS TEXT)) k, amount_involved FROM violations WHERE status='open')`).get() as any).s ?? 0;
  return { counts, total, amount };
}

/** Distinct violations (split-charge groups collapsed to one row), ranked by severity then amount. */
export function getViolations(severity?: string, db: import("better-sqlite3").Database = getDb()): any[] {
  const rows = db
    .prepare(
      `SELECT v.*, t.category, t.transaction_code, t.mcc, t.state_province,
              (SELECT COUNT(*) FROM violations v2 WHERE v2.group_key = v.group_key) AS group_size
       FROM violations v LEFT JOIN transactions t ON t.id = v.transaction_id
       WHERE status='open' ${severity ? "AND v.severity = ?" : ""}
       ORDER BY v.id`
    )
    .all(...(severity ? [severity] : [])) as any[];

  // Collapse split-charge groups to a single representative row.
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of rows) {
    const key = r.group_key || `id-${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || (b.amount_involved - a.amount_involved));
  return out;
}

/** Repeat offenders — merchants/cards with the most violations. */
export function getRepeatOffenders(): { by_merchant: any[]; by_card: any[] } {
  const db = getDb();
  const by_merchant = db
    .prepare(
      `SELECT merchant_name, COUNT(DISTINCT COALESCE(group_key, CAST(id AS TEXT))) violations,
              ROUND(SUM(amount_involved),2) total
       FROM (SELECT DISTINCT COALESCE(group_key, CAST(id AS TEXT)) gk, merchant_name, id, group_key, amount_involved FROM violations WHERE status='open')
       GROUP BY merchant_name ORDER BY violations DESC, total DESC LIMIT 8`
    )
    .all() as any[];
  const by_card = db
    .prepare(
      `SELECT t.transaction_code, COUNT(DISTINCT COALESCE(v.group_key, CAST(v.id AS TEXT))) violations,
              ROUND(SUM(v.amount_involved),2) total
       FROM violations v JOIN transactions t ON t.id = v.transaction_id
       WHERE v.status='open' GROUP BY t.transaction_code ORDER BY violations DESC LIMIT 8`
    )
    .all() as any[];
  return { by_merchant, by_card };
}

/**
 * AI contextual review: for the top violations, ask Gemini to confirm/adjust
 * severity using the real policy + business context. Bounded to one API call.
 */
export async function adjustSeverityWithAI(limit = 18): Promise<number> {
  const ai = getClient();
  if (!ai) return 0;
  const db = getDb();
  const candidates = getViolations().slice(0, limit);
  if (!candidates.length) return 0;

  // Key must match the UPDATE's COALESCE(group_key, CAST(id AS TEXT)).
  const payload = candidates.map((v) => ({
    key: v.group_key || String(v.id),
    rule: v.rule_name,
    type: v.rule_type,
    merchant: v.merchant_name,
    category: v.category,
    amount_cad: v.amount_involved,
    date: v.txn_date,
    split_count: v.group_size > 1 ? v.group_size : undefined,
    base_severity: v.severity,
  }));

  const prompt = `${POLICY_SUMMARY}

You are a finance compliance reviewer for a small/medium business. Below are flagged transactions. For each, decide the TRUE severity (critical|high|medium|low) using CONTEXT, and give a one-sentence reason. Key judgments:
- Multiple charges to the same operational/government vendor on the same day are usually LEGITIMATE per-item fees → lower severity unless amounts look engineered to sit just under a threshold.
- Split charges at fuel/retail vendors (e.g. multiple fills/items same day) are usually legitimate → low/medium.
- A large single charge from a known, established vendor is legitimate but should be HIGH for pre-authorization visibility, not critical.
- Genuine threshold-ducking (amounts suspiciously just under the limit, non-routine merchant) → critical/high.

Return ONLY a JSON array: [{"key": "...", "severity": "...", "reason": "..."}].

Flagged items:
${JSON.stringify(payload, null, 1)}`;

  let text = "";
  try {
    const { resp } = await generateWithFallback(ai, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.1, responseMimeType: "application/json" },
    });
    text = resp.text || "";
  } catch (e) {
    console.error("[compliance AI]", e);
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

  const upd = db.prepare(
    `UPDATE violations SET severity = ?, ai_severity = ?, ai_reasoning = ?
     WHERE COALESCE(group_key, CAST(id AS TEXT)) = ?`
  );
  let n = 0;
  const tx = db.transaction((items: any[]) => {
    for (const it of items) {
      const sev = ["critical", "high", "medium", "low"].includes(it.severity) ? it.severity : "medium";
      upd.run(sev, sev, it.reason ?? null, it.key);
      n++;
    }
  });
  tx(parsed);
  return n;
}
