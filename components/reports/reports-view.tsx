"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  MapPin,
  AlertTriangle,
  Sparkles,
  Check,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { Reveal } from "@/components/reveal";
import { CHART_COLORS } from "@/components/charts";
import { SectionBadge } from "@/components/ui/section-badge";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ReportsView({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/reports", fetcher, { fallbackData: initial });
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const BATCH = 6;

  const reports = data?.reports ?? [];
  const summary = data?.summary ?? initial.summary;

  async function regenerate() {
    setBusy(true);
    toast.loading("Generating reports & AI summaries…", { id: "gen" });
    try {
      await fetch("/api/reports/generate", { method: "POST" });
      await mutate();
      toast.success("Reports generated", { id: "gen" });
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: number) {
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    await mutate();
    toast.success("Report approved by CFO");
  }

  const metrics = [
    { label: "Reports", value: String(summary.count), tone: "text-neutral-900" },
    { label: "Total value", value: formatCAD(summary.total || 0, { compact: true }), tone: "text-primary" },
    { label: "Policy flags", value: String(summary.flags), tone: "text-warning" },
    { label: "Approved", value: `${summary.approved} / ${summary.count}`, tone: "text-primary" },
  ] as const;

  return (
    <div className="space-y-6 p-8">
      <div className="overflow-hidden rounded-lg border border-border/60">
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((m) => (
            <div key={m.label} className="px-4 py-3">
              <dt className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">{m.label}</dt>
              <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", m.tone)}>{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Grouped by location &amp; month — a clear view of where and when company spend happened, ready for review.
        </p>
        <button onClick={regenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regenerate
        </button>
      </div>

      <Reveal>
        <div className="mb-3">
          <SectionBadge>Expense Reports</SectionBadge>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {reports.slice(0, visibleCount).map((r: any) => (
            <ReportCard key={r.id} report={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} onApprove={() => approve(r.id)} />
          ))}
        </div>
        {visibleCount < reports.length && (
          <button
            onClick={() => setVisibleCount((c) => Math.min(c + BATCH, reports.length))}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-foreground/[0.02] py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            Load {Math.min(BATCH, reports.length - visibleCount)} more reports
          </button>
        )}
      </Reveal>
    </div>
  );
}

function ReportCard({ report, open, onToggle, onApprove }: any) {
  const { data } = useSWR(open ? `/api/reports/${report.id}` : null, fetcher);
  const breakdown = Object.entries(report.category_breakdown || {}).sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  const max = breakdown[0]?.[1] || 1;
  const approved = report.status === "approved";

  return (
    <div className={cn("rounded-xl border bg-card transition-colors", approved ? "border-primary/40" : "border-border")}>
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-3 p-5 text-left">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-semibold">{report.title}</span>
            {approved && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[12px] font-medium uppercase text-primary">Approved</span>}
            {report.policy_flag_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[12px] font-medium text-warning">
                <AlertTriangle className="h-3 w-3" /> {report.policy_flag_count}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{report.txn_count} transactions · {breakdown.length} categories</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tabular-nums">{formatCAD(report.total_cad, { compact: true })}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* Category breakdown bars (always visible) */}
      <div className="space-y-1.5 px-5 pb-4">
        {breakdown.slice(0, open ? breakdown.length : 4).map(([cat, amt], i) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate text-muted-foreground">{cat}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full" style={{ width: `${(amt / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums">{formatCAD(amt, { compact: true })}</span>
          </div>
        ))}
      </div>

      {report.ai_summary && (
        <div className="mx-5 mb-4 flex gap-1.5 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          {report.ai_summary}
        </div>
      )}

      {open && (
        <div className="border-t border-border p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Line items ({report.txn_count})</div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/80 text-left text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 font-medium">Merchant</th>
                  <th className="px-3 py-1.5 font-medium">Category</th>
                  <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(data?.report?.lines || []).map((l: any) => (
                  <tr key={l.id} className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-muted-foreground">{l.txn_date}</td>
                    <td className="px-3 py-1.5">{l.merchant_name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{l.category}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCAD(l.amount_cad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!approved && (
            <div className="mt-4 flex justify-end">
              <button onClick={onApprove} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Check className="h-4 w-4" /> Approve as CFO
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
