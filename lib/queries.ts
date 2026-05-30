import { getDb } from "./db";
import { NON_OPERATIONAL } from "./mcc-seed";

// Read-only, parameterized analytics. These functions back BOTH the dashboard
// and the AI agent's tools, so all filtering goes through a single whitelisted
// builder — the model never injects raw SQL.

export type Filters = {
  category?: string;
  subcategory?: string;
  country?: string;
  state?: string;
  card?: string; // transaction_code
  merchant?: string; // matches merchant_norm (LIKE)
  date_from?: string; // ISO yyyy-mm-dd
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  direction?: "Debit" | "Credit";
  include_settlements?: boolean; // default false — exclude card payments from "spend"
};

const SETTLEMENT_LIST = NON_OPERATIONAL.map((c) => `'${c}'`).join(",");

/** Build a parameterized WHERE clause + bind params from whitelisted filters. */
function buildWhere(f: Filters = {}): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  if (!f.include_settlements) clauses.push(`category NOT IN (${SETTLEMENT_LIST})`);
  if (f.category) { clauses.push("category = ?"); params.push(f.category); }
  if (f.subcategory) { clauses.push("subcategory = ?"); params.push(f.subcategory); }
  if (f.country) { clauses.push("country = ?"); params.push(f.country); }
  if (f.state) { clauses.push("state_province = ?"); params.push(f.state); }
  if (f.card) { clauses.push("transaction_code = ?"); params.push(f.card); }
  if (f.merchant) { clauses.push("merchant_norm LIKE ?"); params.push(`%${f.merchant.toUpperCase()}%`); }
  if (f.date_from) { clauses.push("txn_date >= ?"); params.push(f.date_from); }
  if (f.date_to) { clauses.push("txn_date <= ?"); params.push(f.date_to); }
  if (f.min_amount != null) { clauses.push("amount_cad >= ?"); params.push(f.min_amount); }
  if (f.max_amount != null) { clauses.push("amount_cad <= ?"); params.push(f.max_amount); }
  if (f.direction) { clauses.push("direction = ?"); params.push(f.direction); }

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export type GroupDim =
  | "category"
  | "subcategory"
  | "state_province"
  | "country"
  | "transaction_code"
  | "month"
  | "merchant_norm";

const GROUP_EXPR: Record<GroupDim, string> = {
  category: "category",
  subcategory: "subcategory",
  state_province: "state_province",
  country: "country",
  transaction_code: "transaction_code",
  month: "substr(txn_date,1,7)",
  merchant_norm: "merchant_norm",
};

export type Metric = "sum" | "count" | "avg";
const METRIC_EXPR: Record<Metric, string> = {
  sum: "ROUND(SUM(amount_cad),2)",
  count: "COUNT(*)",
  avg: "ROUND(AVG(amount_cad),2)",
};

export function aggregate(
  groupBy: GroupDim,
  metric: Metric = "sum",
  filters: Filters = {},
  limit = 50
): { rows: { key: string; value: number; count: number }[]; total: number } {
  const db = getDb();
  const { sql, params } = buildWhere(filters);
  const expr = GROUP_EXPR[groupBy];
  const rows = db
    .prepare(
      `SELECT ${expr} AS key, ${METRIC_EXPR[metric]} AS value, COUNT(*) AS count
       FROM transactions ${sql}
       GROUP BY ${expr}
       HAVING key IS NOT NULL AND key != ''
       ORDER BY value DESC
       LIMIT ?`
    )
    .all(...params, limit) as any[];
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return { rows, total };
}

export function timeSeries(
  interval: "day" | "week" | "month",
  filters: Filters = {},
  groupByCategory = false
): { period: string; series: Record<string, number> }[] {
  const db = getDb();
  const { sql, params } = buildWhere(filters);
  const periodExpr =
    interval === "month"
      ? "substr(txn_date,1,7)"
      : interval === "week"
      ? "strftime('%Y-W%W', txn_date)"
      : "txn_date";

  if (groupByCategory) {
    const rows = db
      .prepare(
        `SELECT ${periodExpr} AS period, category AS k, ROUND(SUM(amount_cad),2) AS v
         FROM transactions ${sql}
         GROUP BY period, category ORDER BY period`
      )
      .all(...params) as any[];
    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!map.has(r.period)) map.set(r.period, {});
      map.get(r.period)![r.k] = r.v;
    }
    return [...map.entries()].map(([period, series]) => ({ period, series }));
  }

  const rows = db
    .prepare(
      `SELECT ${periodExpr} AS period, ROUND(SUM(amount_cad),2) AS v, COUNT(*) AS n
       FROM transactions ${sql}
       GROUP BY period ORDER BY period`
    )
    .all(...params) as any[];
  return rows.map((r) => ({ period: r.period, series: { spend: r.v, count: r.n } }));
}

export function topMerchants(
  filters: Filters = {},
  by: "spend" | "count" = "spend",
  limit = 15
): { merchant: string; spend: number; count: number; category: string }[] {
  const db = getDb();
  const { sql, params } = buildWhere(filters);
  const order = by === "spend" ? "spend DESC" : "count DESC";
  return db
    .prepare(
      `SELECT merchant_norm AS merchant, ROUND(SUM(amount_cad),2) AS spend, COUNT(*) AS count,
              MAX(category) AS category
       FROM transactions ${sql}
       GROUP BY merchant_norm HAVING merchant IS NOT NULL AND merchant != ''
       ORDER BY ${order} LIMIT ?`
    )
    .all(...params, limit) as any[];
}

export function listTransactions(
  filters: Filters = {},
  sortBy: "amount" | "date" = "date",
  limit = 50
) {
  const db = getDb();
  const { sql, params } = buildWhere(filters);
  const order = sortBy === "amount" ? "amount_cad DESC" : "txn_date DESC";
  return db
    .prepare(
      `SELECT id, txn_date, transaction_code, merchant_name, category, subcategory,
              amount_cad, currency, direction, mcc, state_province, country
       FROM transactions ${sql}
       ORDER BY ${order} LIMIT ?`
    )
    .all(...params, Math.min(limit, 100)) as any[];
}

export function compareGroups(
  groupBy: GroupDim,
  a: Filters,
  b: Filters,
  labelA = "A",
  labelB = "B"
) {
  const ra = aggregate(groupBy, "sum", a, 100).rows;
  const rb = aggregate(groupBy, "sum", b, 100).rows;
  const keys = new Set([...ra.map((r) => r.key), ...rb.map((r) => r.key)]);
  const mapA = new Map(ra.map((r) => [r.key, r.value]));
  const mapB = new Map(rb.map((r) => [r.key, r.value]));
  return [...keys].map((key) => ({
    key,
    [labelA]: mapA.get(key) ?? 0,
    [labelB]: mapB.get(key) ?? 0,
    delta: (mapB.get(key) ?? 0) - (mapA.get(key) ?? 0),
  }));
}

/** Headline KPIs for the dashboard. */
export function getKpis() {
  const db = getDb();
  const op = db
    .prepare(
      `SELECT ROUND(SUM(amount_cad),2) spend, COUNT(*) n,
              MIN(txn_date) start, MAX(txn_date) end,
              ROUND(AVG(amount_cad),2) avg
       FROM transactions WHERE category NOT IN (${SETTLEMENT_LIST}) AND direction='Debit'`
    )
    .get() as any;
  const settle = db
    .prepare(`SELECT ROUND(SUM(amount_cad),2) spend, COUNT(*) n FROM transactions WHERE category IN (${SETTLEMENT_LIST})`)
    .get() as any;
  const xborder = db
    .prepare(
      `SELECT ROUND(100.0*SUM(CASE WHEN is_cross_border=1 THEN amount_cad ELSE 0 END)/SUM(amount_cad),1) pct
       FROM transactions WHERE category NOT IN (${SETTLEMENT_LIST})`
    )
    .get() as any;
  const cards = db.prepare(`SELECT COUNT(*) n FROM cards`).get() as any;
  return {
    operationalSpend: op.spend ?? 0,
    txnCount: op.n ?? 0,
    avgTxn: op.avg ?? 0,
    dateStart: op.start,
    dateEnd: op.end,
    settlementsSpend: settle.spend ?? 0,
    settlementsCount: settle.n ?? 0,
    crossBorderPct: xborder.pct ?? 0,
    cardCount: cards.n ?? 0,
  };
}

export function getCategories(): string[] {
  const db = getDb();
  return (db.prepare(`SELECT DISTINCT category FROM transactions ORDER BY category`).all() as any[]).map((r) => r.category);
}

export function getDateBounds(): { min: string; max: string } {
  const db = getDb();
  return db.prepare(`SELECT MIN(txn_date) min, MAX(txn_date) max FROM transactions`).get() as any;
}
