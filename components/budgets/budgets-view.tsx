"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Pencil, Plus } from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { Reveal } from "@/components/reveal";
import { SectionBadge } from "@/components/ui/section-badge";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Shape of a budget row from getBudgetStatus() (lib/budgets.ts). Loosely typed
// (the API returns `any`); this just lets the view read the fields it uses.
type BudgetRow = {
  id: number;
  scope: string;
  scope_value: string;
  limit_amount: number;
  actual: number;
  pct: number;
  projected: number;
  projPct: number;
  remaining: number;
  overrun: boolean;
  projectedOverrun: boolean;
  overBy: number;
  trend: string;
  month: string;
};

export function BudgetsView({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/budgets", fetcher, { fallbackData: initial });
  const [editing, setEditing] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [busy, setBusy] = useState(false);
  // Set of open row ids (keyed by BudgetRow.id)
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());

  const summary = data?.summary ?? initial.summary;
  const budgets = data?.budgets ?? [];
  const categories = data?.categories ?? initial.categories ?? [];

  const budgetByCategory = useMemo(
    () => new Map<string, BudgetRow>(budgets.map((b: BudgetRow): [string, BudgetRow] => [b.scope_value, b])),
    [budgets]
  );
  const selectedBudget = newCategory ? budgetByCategory.get(newCategory) : undefined;

  function toggleRow(id: number) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function saveBudget(scope_value: string, limit: number) {
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "category", scope_value, limit_amount: limit }),
    });
    if (!res.ok) throw new Error("Failed to save budget");
    await mutate();
  }

  async function saveRow(b: any) {
    const limit = Number(editVal);
    if (!limit || limit <= 0) {
      setEditing(null);
      return;
    }
    try {
      await saveBudget(b.scope_value, limit);
      setEditing(null);
      toast.success(`Budget for ${b.scope_value} updated`);
    } catch {
      toast.error("Could not update budget");
    }
  }

  async function addBudget(e: React.FormEvent) {
    e.preventDefault();
    const limit = Number(newLimit);
    if (!newCategory || !limit || limit <= 0) {
      toast.error("Choose a category and enter a monthly limit");
      return;
    }
    setBusy(true);
    try {
      await saveBudget(newCategory, limit);
      toast.success(selectedBudget ? `Budget for ${newCategory} updated` : `Budget set for ${newCategory}`);
      setNewLimit("");
      if (!selectedBudget) setNewCategory("");
    } catch {
      toast.error("Could not set budget");
    } finally {
      setBusy(false);
    }
  }

  const metrics = [
    { label: "Monthly budget", value: formatCAD(summary.totalBudget, { compact: true }), tone: "text-primary" },
    { label: "Actual spend", value: formatCAD(summary.totalActual, { compact: true }), tone: "text-neutral-600" },
    { label: "Over budget", value: String(summary.overBudget), tone: "text-destructive" },
    { label: "Overrun risk", value: String(summary.atRisk), tone: "text-warning" },
  ] as const;

  return (
    <div className="space-y-6 p-8">
      {/* ── KPI metrics bar ── */}
      <div className="overflow-hidden rounded-lg border border-border/60">
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((m) => (
            <div key={m.label} className="px-4 py-3">
              <dt className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">{m.label}</dt>
              <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", m.tone)}>{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border/60 px-4 py-2.5 text-sm text-neutral-600">
          {summary.count} categories tracked · {summary.month}
        </p>
      </div>

      {/* ── Set a budget form ── */}
      <Reveal delay={0}>
        <div className="rounded-lg border border-border/60 p-4">
          <SectionBadge>Set a budget</SectionBadge>
          <p className="mt-2 text-xs text-neutral-600">Monthly limit per spend category</p>
          <form onSubmit={addBudget} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1 space-y-1">
              <span className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">Category</span>
              <select
                value={newCategory}
                onChange={(e) => {
                  const cat = e.target.value;
                  setNewCategory(cat);
                  const existing = budgetByCategory.get(cat);
                  setNewLimit(existing ? String(existing.limit_amount) : "");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-neutral-900 outline-none ring-primary/40 focus:ring-2"
              >
                <option value="">Select category</option>
                {categories.map((c: any) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                    {budgetByCategory.has(c.category) ? " (budget set)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-40 space-y-1">
              <span className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">Monthly limit</span>
              <input
                type="number"
                min={1}
                step={100}
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none ring-primary/40 focus:ring-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {selectedBudget ? "Update budget" : "Set budget"}
            </button>
          </form>
          {selectedBudget && (
            <p className="mt-3 text-sm text-neutral-600">
              Current budget for <span className="font-medium text-neutral-900">{newCategory}</span>:{" "}
              <span className="font-semibold tabular-nums text-primary">{formatCAD(selectedBudget.limit_amount)}</span>
              {" · "}
              {formatCAD(selectedBudget.actual)} spent this month ({selectedBudget.pct}% used)
            </p>
          )}
        </div>
      </Reveal>

      {/* ── Category budgets expandable list ── */}
      <Reveal delay={70}>
        <div>
          <SectionBadge>Category budgets</SectionBadge>
          <p className="mt-2 text-xs text-neutral-600">
            Spend vs limit for {summary.month} — click a row to expand · click a limit to edit
          </p>
          <div className="mt-3 rounded-lg border border-border/60 divide-y divide-border/60">
            {budgets.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-600">
                No budgets set yet — use the form above.
              </div>
            ) : (
              budgets.map((b: BudgetRow) => {
                const isOpen = openRows.has(b.id);
                const pct = Math.min(100, b.pct);
                const barTone = b.overrun
                  ? "bg-destructive"
                  : b.projectedOverrun
                  ? "bg-warning"
                  : "bg-primary";

                return (
                  <div key={b.id}>
                    {/* ── Collapsed summary row ── */}
                    <button
                      type="button"
                      onClick={() => toggleRow(b.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={isOpen}
                    >
                      {/* Category name */}
                      <span className="w-36 shrink-0 truncate text-sm font-medium text-neutral-900">
                        {b.scope_value}
                      </span>

                      {/* Usage progress bar */}
                      <div className="flex flex-1 flex-col gap-1 min-w-0">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", barTone)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Used % */}
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                        {b.pct}%
                      </span>

                      {/* Compact status badge */}
                      <span className="w-32 shrink-0 text-right">
                        {b.overrun ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Over by {formatCAD(b.overBy, { compact: true })}
                          </span>
                        ) : b.projectedOverrun ? (
                          <span className="text-xs font-medium text-warning">Projected overrun</span>
                        ) : (
                          <span className="text-xs text-neutral-500">On track</span>
                        )}
                      </span>

                      {/* Chevron */}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 motion-reduce:transition-none",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {/* ── Expanded detail panel ── */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      )}
                    >
                      <div className="overflow-hidden">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/40 bg-muted/20 px-4 py-3 sm:grid-cols-4">
                          {/* Limit — inline-editable */}
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                              Limit
                            </dt>
                            <dd className="mt-0.5">
                              {editing === b.id ? (
                                <input
                                  autoFocus
                                  defaultValue={b.limit_amount}
                                  onChange={(e) => setEditVal(e.target.value)}
                                  onBlur={() => saveRow(b)}
                                  onKeyDown={(e) => e.key === "Enter" && saveRow(b)}
                                  className="w-24 rounded border border-border bg-background px-2 py-0.5 text-right text-sm tabular-nums outline-none ring-primary/40 focus:ring-2"
                                />
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing(b.id);
                                    setEditVal(String(b.limit_amount));
                                  }}
                                  className="group inline-flex items-center gap-1 text-sm tabular-nums text-neutral-900 hover:text-primary"
                                >
                                  {formatCAD(b.limit_amount)}
                                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                </button>
                              )}
                            </dd>
                          </div>

                          {/* Spent */}
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                              Spent
                            </dt>
                            <dd className="mt-0.5 text-sm tabular-nums text-neutral-600">
                              {formatCAD(b.actual)}
                            </dd>
                          </div>

                          {/* Projected */}
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                              Projected
                            </dt>
                            <dd className="mt-0.5 text-sm tabular-nums text-neutral-600">
                              {formatCAD(b.projected, { compact: true })}{" "}
                              <span className="text-xs text-neutral-400">({b.projPct}%)</span>
                            </dd>
                          </div>

                          {/* Remaining */}
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                              Remaining
                            </dt>
                            <dd
                              className={cn(
                                "mt-0.5 text-sm tabular-nums",
                                b.overrun ? "text-destructive" : "text-neutral-600"
                              )}
                            >
                              {formatCAD(b.remaining)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
