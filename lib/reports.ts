import { getDb } from "./db";
import { GoogleGenAI } from "@google/genai";

// Automated Expense Report Generation. The provided card data is a SHARED fleet
// card (10-50 states transact on it per day → no single-truck trips exist), so
// reports are grouped by JURISDICTION + MONTH — exactly how a trucking fleet
// reconciles fuel-tax (IFTA), permits (IRP) and operating spend per state. Each
// report bundles line items by category, counts policy flags, and gets an AI
// summary, ready for CFO approval.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}
function monthBounds(m: string): { start: string; end: string } {
  const [y, mo] = m.split("-").map(Number);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { start: `${m}-01`, end };
}

/** (Re)generate the top jurisdiction-period expense reports. */
export function generateReports(limit = 12): number {
  const db = getDb();
  db.prepare(`DELETE FROM report_line_items`).run();
  db.prepare(`DELETE FROM expense_reports`).run();

  const groups = db
    .prepare(
      `SELECT state_province st, substr(txn_date,1,7) m, COUNT(*) n, ROUND(SUM(amount_cad),2) s
       FROM transactions WHERE ${NON_OP} AND state_province IS NOT NULL
       GROUP BY st, m HAVING n >= 5 ORDER BY s DESC LIMIT ?`
    )
    .all(limit) as any[];

  const insReport = db.prepare(
    `INSERT INTO expense_reports (title, transaction_code, start_date, end_date, corridor, total_cad, txn_count, status, policy_flag_count, category_breakdown)
     VALUES (@title,@transaction_code,@start_date,@end_date,@corridor,@total_cad,@txn_count,'draft',@policy_flag_count,@category_breakdown)`
  );
  const insLine = db.prepare(
    `INSERT INTO report_line_items (report_id, transaction_id, category, merchant_name, txn_date, amount_cad)
     VALUES (?,?,?,?,?,?)`
  );

  const tx = db.transaction((gs: any[]) => {
    for (const g of gs) {
      const { start, end } = monthBounds(g.m);
      const items = db
        .prepare(`SELECT id, category, merchant_name, txn_date, amount_cad FROM transactions WHERE ${NON_OP} AND state_province=? AND substr(txn_date,1,7)=? ORDER BY amount_cad DESC`)
        .all(g.st, g.m) as any[];

      const breakdown: Record<string, number> = {};
      for (const it of items) breakdown[it.category] = Math.round(((breakdown[it.category] || 0) + it.amount_cad) * 100) / 100;

      const ids = items.map((i) => i.id);
      const flags = ids.length
        ? (db.prepare(`SELECT COUNT(DISTINCT COALESCE(group_key, CAST(id AS TEXT))) n FROM violations WHERE status='open' AND transaction_id IN (${ids.map(() => "?").join(",")})`).get(...ids) as any).n
        : 0;

      const info = insReport.run({
        title: `${g.st} · ${monthLabel(g.m)}`,
        transaction_code: null,
        start_date: start,
        end_date: end,
        corridor: g.st,
        total_cad: g.s,
        txn_count: g.n,
        policy_flag_count: flags,
        category_breakdown: JSON.stringify(breakdown),
      });
      const reportId = Number(info.lastInsertRowid);
      for (const it of items) insLine.run(reportId, it.id, it.category, it.merchant_name, it.txn_date, it.amount_cad);
    }
  });
  tx(groups);
  return groups.length;
}

/** One Gemini call → a CFO-ready summary for each report. */
export async function summarizeReports(): Promise<number> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return 0;
  const db = getDb();
  const reports = db.prepare(`SELECT * FROM expense_reports WHERE ai_summary IS NULL`).all() as any[];
  if (!reports.length) return 0;

  const payload = reports.map((r) => ({
    id: r.id,
    jurisdiction: r.corridor,
    period: r.title,
    total_cad: r.total_cad,
    transactions: r.txn_count,
    policy_flags: r.policy_flag_count,
    category_breakdown: JSON.parse(r.category_breakdown || "{}"),
  }));

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You write concise CFO-facing expense-report summaries for a cross-border trucking fleet. Each report bundles one US state / Canadian province for one month. For each, write a 1-2 sentence summary naming the dominant spend categories and their drivers (permits, fuel, scales, maintenance), and noting any policy flags. Be specific with the dominant CAD figures.

Return ONLY a JSON array: [{"id": <number>, "summary": "<text>"}].

Reports:
${JSON.stringify(payload, null, 1)}`;

  let text = "";
  try {
    const resp = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.3, responseMimeType: "application/json" },
    });
    text = resp.text || "";
  } catch (e) {
    console.error("[reports AI]", e);
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
  const upd = db.prepare(`UPDATE expense_reports SET ai_summary=? WHERE id=?`);
  let n = 0;
  const tx = db.transaction((items: any[]) => {
    for (const it of items) { upd.run(it.summary ?? null, it.id); n++; }
  });
  tx(parsed);
  return n;
}

export function getReports(): any[] {
  const db = getDb();
  return (db.prepare(`SELECT * FROM expense_reports ORDER BY total_cad DESC`).all() as any[]).map((r) => ({
    ...r,
    category_breakdown: JSON.parse(r.category_breakdown || "{}"),
  }));
}

export function getReport(id: number): any {
  const db = getDb();
  const report = db.prepare(`SELECT * FROM expense_reports WHERE id=?`).get(id) as any;
  if (!report) return null;
  const lines = db.prepare(`SELECT * FROM report_line_items WHERE report_id=? ORDER BY amount_cad DESC`).all(id) as any[];
  return { ...report, category_breakdown: JSON.parse(report.category_breakdown || "{}"), lines };
}

export function setReportStatus(id: number, status: "draft" | "approved" | "flagged") {
  getDb().prepare(`UPDATE expense_reports SET status=? WHERE id=?`).run(status, id);
  return getReport(id);
}

export function getReportsSummary() {
  const db = getDb();
  const agg = db.prepare(`SELECT COUNT(*) n, ROUND(SUM(total_cad),2) total, SUM(policy_flag_count) flags, SUM(status='approved') approved FROM expense_reports`).get() as any;
  return { count: agg.n ?? 0, total: agg.total ?? 0, flags: agg.flags ?? 0, approved: agg.approved ?? 0 };
}
