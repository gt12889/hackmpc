"use client";

import { SpendBar, TrendLine, CategoryPie } from "@/components/charts";
import { formatCAD } from "@/lib/utils";
import type { VizPayload } from "@/lib/agent";

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
      return <SpendBar data={data} money={money} horizontal={data.length > 6} />;
    case "line":
      return <TrendLine data={data} series={[{ key: "spend", label: "Spend" }]} money={money} />;
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
                  {c === "amount_cad" ? formatCAD(Number(r[c])) : String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
