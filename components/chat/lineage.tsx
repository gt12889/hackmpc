"use client";

import { useState } from "react";
import { GitBranch, ChevronRight, Database, AlertTriangle } from "lucide-react";
import type { ToolCallTrace } from "@/lib/agent";
import { cn } from "@/lib/utils";

// Data-lineage panel. Sphinx's flagship promise is that every AI answer traces
// back to its source data + the logic that produced it. The agent already
// captures each whitelisted tool call; this renders that trail so a finance
// manager can audit exactly which rows a number came from.

const TOOL_LABELS: Record<string, string> = {
  aggregate_spend: "Aggregated spend",
  time_series: "Spend over time",
  top_merchants: "Ranked merchants",
  list_transactions: "Listed transactions",
  compare_periods: "Compared two periods",
};

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
  notation: "compact",
});

const num = new Intl.NumberFormat("en-CA");

function fmt(v: number, money: boolean): string {
  return typeof v === "number" ? (money ? cad.format(v) : num.format(v)) : String(v);
}

/** Reduce a result row to a readable {label, value} pair, adapting to each
 *  tool's row shape, so the lineage shows the actual figures behind the answer. */
function describeRow(row: any, t: ToolCallTrace): { label: string; value: string } {
  if (row == null || typeof row !== "object") return { label: String(row), value: "" };
  const money = t.meta?.money !== false;

  if (t.name === "compare_periods") {
    const la = t.args?.label_a ?? "A";
    const lb = t.args?.label_b ?? "B";
    return { label: String(row.key), value: `${la} ${cad.format(row[la] ?? 0)} · ${lb} ${cad.format(row[lb] ?? 0)}` };
  }
  if ("merchant_name" in row) {
    return { label: `${row.txn_date ?? ""} · ${row.merchant_name ?? row.merchant_norm ?? ""}`.trim(), value: cad.format(row.amount_cad ?? 0) };
  }
  if ("period" in row) {
    const v =
      typeof row.spend === "number"
        ? row.spend
        : Object.entries(row).reduce((s, [k, x]) => s + (k !== "period" && typeof x === "number" ? x : 0), 0);
    return { label: String(row.period), value: cad.format(v) };
  }
  if ("key" in row && "value" in row) {
    const count = typeof row.count === "number" && money ? ` · ${num.format(row.count)} txns` : "";
    return { label: String(row.key), value: `${fmt(row.value, money)}${count}` };
  }
  return { label: JSON.stringify(row).slice(0, 48), value: "" };
}

const FILTER_KEYS = [
  "category",
  "subcategory",
  "country",
  "state",
  "card",
  "merchant",
  "direction",
  "min_amount",
  "max_amount",
] as const;

/** Turn a whitelisted filter object into human-readable tokens. */
function filterTokens(f: any): string[] {
  if (!f || typeof f !== "object") return [];
  const out: string[] = [];
  if (f.date_from || f.date_to) {
    out.push(`${f.date_from ?? "…"} → ${f.date_to ?? "…"}`);
  }
  for (const k of FILTER_KEYS) {
    if (f[k] != null && f[k] !== "") out.push(`${k}: ${f[k]}`);
  }
  out.push(f.include_settlements ? "incl. settlements" : "spend only (settlements excluded)");
  return out;
}

/** Pull the dimension/metric framing out of a tool's args. */
function framingTokens(t: ToolCallTrace): string[] {
  const a = t.args ?? {};
  const out: string[] = [];
  if (a.group_by) out.push(`group by ${a.group_by}`);
  if (a.metric) out.push(a.metric);
  if (a.interval) out.push(`per ${a.interval}`);
  if (a.group_by_category) out.push("split by category");
  if (a.by) out.push(`by ${a.by}`);
  if (a.sort_by) out.push(`sorted by ${a.sort_by}`);
  return out;
}

function Token({ children, tone }: { children: React.ReactNode; tone?: "filter" | "frame" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[12px] leading-tight",
        tone === "frame"
          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
          : "bg-secondary/70 text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function Step({ t, index }: { t: ToolCallTrace; index: number }) {
  const label = TOOL_LABELS[t.name] ?? t.name;
  const frame = framingTokens(t);
  // compare_periods carries two filter sets; everything else nests under `filters`.
  const filterSets =
    t.name === "compare_periods"
      ? [
          { label: t.args?.label_a ?? "A", f: t.args?.filters_a },
          { label: t.args?.label_b ?? "B", f: t.args?.filters_b },
        ]
      : [{ label: null, f: t.args?.filters }];

  return (
    <li className="relative pl-5">
      <span className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-medium text-primary ring-1 ring-primary/30">
        {index + 1}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <code className="rounded bg-background/60 px-1 py-0.5 text-[12px] text-muted-foreground">{t.name}</code>
        {frame.map((f, i) => (
          <Token key={`fr-${i}`} tone="frame">
            {f}
          </Token>
        ))}
      </div>

      <div className="mt-1 space-y-1">
        {filterSets.map((set, si) => {
          const tokens = filterTokens(set.f);
          return (
            <div key={si} className="flex flex-wrap items-center gap-1.5">
              {set.label && (
                <span className="text-[12px] font-medium text-muted-foreground/80">{set.label}:</span>
              )}
              {tokens.map((tok, i) => (
                <Token key={i}>{tok}</Token>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Database className="h-3 w-3" />
        {t.ok ? (
          <span>
            from <code className="rounded bg-background/60 px-1 text-[9px]">transactions</code> ·{" "}
            {t.rowCount} {t.rowCount === 1 ? "row" : "rows"} returned
            {typeof t.total === "number" && t.total > 0 && <> · total {cad.format(t.total)}</>}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            {t.error ?? "tool error"}
          </span>
        )}
      </div>

      {t.ok && t.sample && t.sample.length > 0 && (
        <table className="mt-1.5 w-full max-w-md border-separate border-spacing-0 text-[12px]">
          <tbody>
            {t.sample.map((row, i) => {
              const { label, value } = describeRow(row, t);
              return (
                <tr key={i} className="text-muted-foreground">
                  <td className="truncate py-0.5 pr-2 text-foreground/80">{label}</td>
                  <td className="whitespace-nowrap py-0.5 text-right tabular-nums">{value}</td>
                </tr>
              );
            })}
            {t.rowCount > t.sample.length && (
              <tr>
                <td colSpan={2} className="py-0.5 text-muted-foreground/60">
                  + {t.rowCount - t.sample.length} more {t.rowCount - t.sample.length === 1 ? "row" : "rows"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </li>
  );
}

export function Lineage({ tools }: { tools: ToolCallTrace[] }) {
  const [open, setOpen] = useState(false);
  if (!tools || tools.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-border/70 bg-card/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        Data lineage
        <span className="text-muted-foreground/60">
          · {tools.length} {tools.length === 1 ? "query" : "queries"} against the ledger
        </span>
      </button>
      {open && (
        <ol className="space-y-3 border-t border-border/60 px-3 py-3">
          {tools.map((t, i) => (
            <Step key={i} t={t} index={i} />
          ))}
          <li className="pl-5 text-[12px] italic text-muted-foreground/70">
            Every number above came from these parameterized, read-only queries — the model never wrote SQL or
            invented figures.
          </li>
        </ol>
      )}
    </div>
  );
}
