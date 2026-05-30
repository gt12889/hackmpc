import { Type } from "@google/genai";
import { z } from "zod";
import {
  aggregate,
  timeSeries,
  topMerchants,
  listTransactions,
  compareGroups,
  type Filters,
  type GroupDim,
  type Metric,
} from "./queries";

// Tool layer for the agent. Each tool maps to a parameterized, read-only query.
// The model never writes SQL — it picks a tool + whitelisted args, which we
// validate with zod before touching the DB. Every result carries a `suggested_viz`
// hint the client uses to auto-render the right chart.

const GROUP_DIMS = [
  "category",
  "subcategory",
  "state_province",
  "country",
  "transaction_code",
  "month",
  "merchant_norm",
] as const;

const filterShape = {
  category: z.string().optional(),
  subcategory: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  card: z.string().optional(),
  merchant: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  direction: z.enum(["Debit", "Credit"]).optional(),
  include_settlements: z.boolean().optional(),
};

// JSON-schema fragment for filters, reused across tool declarations.
const FILTER_SCHEMA = {
  type: Type.OBJECT,
  description: "Optional filters. Omit fields you don't need. Settlements (card payments) are excluded unless include_settlements=true.",
  properties: {
    category: { type: Type.STRING, description: "Exact category, e.g. 'Fuel', 'Permits & Compliance', 'Tolls & Border'" },
    subcategory: { type: Type.STRING },
    country: { type: Type.STRING, description: "'USA' or 'CAN'" },
    state: { type: Type.STRING, description: "State/province code, e.g. 'TX', 'AB', 'ON'" },
    card: { type: Type.STRING, description: "Card / cost-center code, e.g. '3001'" },
    merchant: { type: Type.STRING, description: "Substring match on merchant name" },
    date_from: { type: Type.STRING, description: "ISO yyyy-mm-dd inclusive" },
    date_to: { type: Type.STRING, description: "ISO yyyy-mm-dd inclusive" },
    min_amount: { type: Type.NUMBER },
    max_amount: { type: Type.NUMBER },
    direction: { type: Type.STRING, description: "'Debit' or 'Credit'" },
    include_settlements: { type: Type.BOOLEAN },
  },
};

export const FUNCTION_DECLARATIONS = [
  {
    name: "aggregate_spend",
    description:
      "Group total/average spend or transaction counts by a dimension. Use for 'how much by X', rankings, breakdowns. Returns rows sorted by value.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        group_by: { type: Type.STRING, enum: GROUP_DIMS as unknown as string[], description: "Dimension to group by" },
        metric: { type: Type.STRING, enum: ["sum", "count", "avg"], description: "sum=total CAD, count=#txns, avg=avg CAD. Default sum." },
        filters: FILTER_SCHEMA,
        limit: { type: Type.NUMBER, description: "Max groups (default 12)" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "time_series",
    description:
      "Spend over time by day/week/month. Use for trends, 'over time', 'monthly'. Set group_by_category to split lines per category.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        interval: { type: Type.STRING, enum: ["day", "week", "month"], description: "Default month" },
        filters: FILTER_SCHEMA,
        group_by_category: { type: Type.BOOLEAN, description: "Split into one line per category" },
      },
      required: ["interval"],
    },
  },
  {
    name: "top_merchants",
    description: "Ranked merchants by spend or transaction count. Use for 'top vendors', 'who are we paying'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        by: { type: Type.STRING, enum: ["spend", "count"] },
        filters: FILTER_SCHEMA,
        limit: { type: Type.NUMBER, description: "Default 15" },
      },
    },
  },
  {
    name: "list_transactions",
    description: "Return individual transactions (max 100). Use for 'show me the transactions', drill-downs, finding specific charges.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filters: FILTER_SCHEMA,
        sort_by: { type: Type.STRING, enum: ["amount", "date"] },
        limit: { type: Type.NUMBER, description: "Default 25, max 100" },
      },
    },
  },
  {
    name: "compare_periods",
    description:
      "Compare two filter sets side by side (e.g. two date ranges, two states, two categories) grouped by a dimension. Use for 'compare X vs Y', 'how does this quarter compare'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        group_by: { type: Type.STRING, enum: GROUP_DIMS as unknown as string[] },
        filters_a: FILTER_SCHEMA,
        filters_b: FILTER_SCHEMA,
        label_a: { type: Type.STRING },
        label_b: { type: Type.STRING },
      },
      required: ["group_by", "filters_a", "filters_b"],
    },
  },
] as const;

export type ToolResult = {
  ok: boolean;
  suggested_viz: "bar" | "line" | "pie" | "table" | "stat" | "multiline";
  data: any;
  meta?: Record<string, any>;
  error?: string;
};

function vizForGroups(rows: any[]): ToolResult["suggested_viz"] {
  if (rows.length <= 1) return "stat";
  if (rows.length <= 6) return "pie";
  return "bar";
}

/** Validate + execute a tool call. Errors are returned (not thrown) so the model can recover. */
export function runTool(name: string, rawArgs: any): ToolResult {
  try {
    switch (name) {
      case "aggregate_spend": {
        const args = z
          .object({
            group_by: z.enum(GROUP_DIMS),
            metric: z.enum(["sum", "count", "avg"]).default("sum"),
            filters: z.object(filterShape).optional(),
            limit: z.number().int().positive().max(100).default(12),
          })
          .parse(rawArgs);
        const out = aggregate(args.group_by as GroupDim, args.metric as Metric, (args.filters as Filters) || {}, args.limit);
        const money = args.metric !== "count";
        const viz = args.group_by === "month" ? "bar" : vizForGroups(out.rows);
        return { ok: true, suggested_viz: viz, data: out.rows, meta: { total: out.total, metric: args.metric, group_by: args.group_by, money } };
      }
      case "time_series": {
        const args = z
          .object({
            interval: z.enum(["day", "week", "month"]),
            filters: z.object(filterShape).optional(),
            group_by_category: z.boolean().default(false),
          })
          .parse(rawArgs);
        const raw = timeSeries(args.interval, (args.filters as Filters) || {}, args.group_by_category);
        if (args.group_by_category) {
          const cats = new Set<string>();
          raw.forEach((r) => Object.keys(r.series).forEach((k) => cats.add(k)));
          const data = raw.map((r) => ({ period: r.period, ...r.series }));
          return { ok: true, suggested_viz: "multiline", data, meta: { series: [...cats], money: true } };
        }
        const data = raw.map((r) => ({ period: r.period, spend: r.series.spend, count: r.series.count }));
        return { ok: true, suggested_viz: "line", data, meta: { series: ["spend"], money: true } };
      }
      case "top_merchants": {
        const args = z
          .object({ by: z.enum(["spend", "count"]).default("spend"), filters: z.object(filterShape).optional(), limit: z.number().int().positive().max(50).default(15) })
          .parse(rawArgs);
        const rows = topMerchants((args.filters as Filters) || {}, args.by, args.limit);
        return { ok: true, suggested_viz: "bar", data: rows.map((m) => ({ key: m.merchant, value: args.by === "spend" ? m.spend : m.count, count: m.count, category: m.category })), meta: { by: args.by, money: args.by === "spend" } };
      }
      case "list_transactions": {
        const args = z
          .object({ filters: z.object(filterShape).optional(), sort_by: z.enum(["amount", "date"]).default("date"), limit: z.number().int().positive().max(100).default(25) })
          .parse(rawArgs);
        const rows = listTransactions((args.filters as Filters) || {}, args.sort_by, args.limit);
        return { ok: true, suggested_viz: "table", data: rows, meta: { count: rows.length } };
      }
      case "compare_periods": {
        const args = z
          .object({
            group_by: z.enum(GROUP_DIMS),
            filters_a: z.object(filterShape),
            filters_b: z.object(filterShape),
            label_a: z.string().default("A"),
            label_b: z.string().default("B"),
          })
          .parse(rawArgs);
        const rows = compareGroups(args.group_by as GroupDim, args.filters_a as Filters, args.filters_b as Filters, args.label_a, args.label_b);
        return { ok: true, suggested_viz: "bar", data: rows, meta: { compare: true, label_a: args.label_a, label_b: args.label_b, money: true } };
      }
      default:
        return { ok: false, suggested_viz: "stat", data: null, error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { ok: false, suggested_viz: "stat", data: null, error: `Invalid arguments for ${name}: ${e?.message || e}` };
  }
}
