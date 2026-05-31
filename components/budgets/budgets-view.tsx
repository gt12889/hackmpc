"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Wallet, TrendingUp, AlertTriangle, Check, Pencil } from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function BudgetsView({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/budgets", fetcher, { fallbackData: initial });
  const [editing, setEditing] = useState<number | null>(null);
  const [val, setVal] = useState("");

  const summary = data?.summary ?? initial.summary;
  const budgets = data?.budgets ?? [];

  async function save(b: any) {
    const limit = Number(val);
    if (!limit || limit <= 0) { setEditing(null); return; }
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: b.scope, scope_value: b.scope_value, limit_amount: limit }),
    });
    setEditing(null);
    await mutate();
    toast.success(`Budget for ${b.scope_value} updated`);
  }

  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Monthly Budget" value={formatCAD(summary.totalBudget, { compact: true })} sub={`${summary.month} · ${summary.count} categories`} tone="primary" />
        <Stat label="Actual Spend" value={formatCAD(summary.totalActual, { compact: true })} sub="this month" tone="muted" />
        <Stat label="Over Budget" value={String(summary.overBudget)} sub="categories" tone="destructive" />
        <Stat label="Overrun Risk" value={String(summary.atRisk)} sub="projected to exceed" tone="warning" />
      </div>

      <div className="space-y-3">
        {budgets.map((b: any) => {
          const pct = Math.min(100, b.pct);
          const barTone = b.overrun ? "bg-destructive" : b.projectedOverrun ? "bg-warning" : "bg-primary";
          const TrendIcon = TrendingUp;
          return (
            <div key={b.id} className="rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-neutral-900">{b.scope_value}</span>
                  {b.overrun && <Badge tone="destructive"><AlertTriangle className="h-3 w-3" /> Over by {formatCAD(b.overBy, { compact: true })}</Badge>}
                  {!b.overrun && b.projectedOverrun && <Badge tone="warning"><TrendIcon className="h-3 w-3" /> Projected overrun</Badge>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="tabular-nums text-neutral-900">{formatCAD(b.actual)}</span>
                  <span className="text-neutral-400">/</span>
                  {editing === b.id ? (
                    <input
                      autoFocus
                      defaultValue={b.limit_amount}
                      onChange={(e) => setVal(e.target.value)}
                      onBlur={() => save(b)}
                      onKeyDown={(e) => e.key === "Enter" && save(b)}
                      className="w-24 rounded border border-border bg-background px-2 py-0.5 text-right text-sm text-neutral-900 outline-none ring-primary/40 focus:ring-2"
                    />
                  ) : (
                    <button onClick={() => { setEditing(b.id); setVal(String(b.limit_amount)); }} className="group inline-flex items-center gap-1 tabular-nums text-neutral-600 hover:text-primary">
                      {formatCAD(b.limit_amount)} <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                </div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-500">
                <span>{b.pct}% used</span>
                <span>Projected month-end: <span className={cn(b.projectedOverrun && "text-warning", b.overrun && "text-destructive")}>{formatCAD(b.projected, { compact: true })}</span> ({b.trend})</span>
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-neutral-600">No budgets set.</div>}
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls = tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning";
  return <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", cls)}>{children}</span>;
}

function Stat({ label, value, sub, tone }: any) {
  const t = { primary: "text-primary", warning: "text-warning", destructive: "text-destructive", muted: "text-neutral-500" }[tone as string] || "text-neutral-900";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cn("mt-2 text-2xl tabular-nums", t)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
