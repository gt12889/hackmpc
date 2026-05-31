"use client";

import { TrendLine, CategoryPie, GroupedBar, CHART_COLORS } from "@/components/charts";
import { formatCAD } from "@/lib/utils";
import type { VizPayload } from "@/lib/agent";

// Dependency-free horizontal bar list. Recharts' horizontal BarChart collapses
// (only the first bar gets a size) when it mounts inside the chat's dynamically
// sized/animated overlay, so for the chat we render bars as plain CSS widths -
// always correct regardless of container measurement.
function HBars({ data, money }: { data: any[]; money: boolean }) {
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 text-xs">
          <span className="w-36 shrink-0 truncate text-muted-foreground" title={String(d.key)}>{String(d.key)}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (Number(d.value) / max) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
          <span className="w-24 shrink-0 text-right font-medium tabular-nums">
            {money ? formatCAD(Number(d.value)) : Number(d.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// Auto-render the right visualization from a tool result. The agent chooses the
// tool; the server tags a suggested_viz; this switch renders it.
export function ChartRenderer({ viz }: { viz: VizPayload }) {
  const { suggested_viz, data, meta } = viz;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <div className="text-xs text-muted-foreground">No data for that query.</div>;
  }
  const money = meta?.money !== false;

  switch (suggested_viz) {
    case "stat": {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return (
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div className="text-xs text-muted-foreground">{row.key}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {money ? formatCAD(Number(row.value)) : Number(row.value).toLocaleString()}
          </div>
          {row.count != null && <div className="text-xs text-muted-foreground">{row.count} transactions</div>}
        </div>
      );
    }
    case "pie":
      return <CategoryPie data={data} money={money} />;
    case "bar":
      // compare_periods returns two value columns per row ({key, [labelA], [labelB]}),
      // which SpendBar (single `value` field) can't render — use a grouped bar.
      if (meta?.compare && meta.label_a && meta.label_b) {
        return (
          <GroupedBar
            data={data}
            series={[
              { key: meta.label_a, label: meta.label_a },
              { key: meta.label_b, label: meta.label_b },
            ]}
            money={money}
          />
        );
      }
      return <HBars data={data} money={money} />;
    case "line":
      return <TrendLine data={data} series={[{ key: "spend", label: "Spending" }]} money={money} />;
    case "multiline": {
      const series = (meta?.series || []).map((k: string) => ({ key: k, label: k }));
      return <TrendLine data={data} series={series} money={money} />;
    }
    case "table":
      return <TxnTable rows={data} />;
    default:
      return null;
  }
}

function TxnTable({ rows }: { rows: any[] }) {
  const cols =
    rows[0]?.amount_cad !== undefined
      ? ["txn_date", "merchant_name", "category", "state_province", "amount_cad"]
      : Object.keys(rows[0] || {}).slice(0, 5);
  const label: Record<string, string> = {
    txn_date: "Date",
    merchant_name: "Merchant",
    category: "Category",
    state_province: "State",
    amount_cad: "Amount",
  };
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-secondary/80 text-left text-muted-foreground backdrop-blur">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">{label[c] || c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {cols.map((c) => (
                <td key={c} className={`px-3 py-1.5 ${c === "amount_cad" ? "text-right tabular-nums font-medium" : ""}`}>
                  {c === "amount_cad" ? formatCAD(Number(r[c])) : String(r[c] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
