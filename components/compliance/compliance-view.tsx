"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Power,
  Layers,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { ShowMore } from "@/components/show-more";
import { AlertSettings } from "@/components/compliance/alert-settings";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const SEV_STYLE: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive ring-destructive/30",
  high: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  medium: "bg-warning/15 text-warning ring-warning/30",
  low: "bg-muted text-muted-foreground ring-border",
};

export function SeverityBadge({ severity, ai }: { severity: string; ai?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1", SEV_STYLE[severity] || SEV_STYLE.low)}>
      {ai && <Sparkles className="h-3 w-3" />}
      {severity}
    </span>
  );
}

export function ComplianceView({ initial }: { initial: any }) {
  const { data, mutate, isValidating } = useSWR("/api/policies", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState(false);

  const summary = data?.summary ?? initial.summary;
  const rules = data?.rules ?? [];
  const violations = data?.violations ?? [];
  const offenders = data?.offenders ?? { by_merchant: [], by_card: [] };

  async function rescan() {
    setBusy(true);
    toast.loading("Re-scanning with AI review…", { id: "scan" });
    try {
      const r = await fetch("/api/policies/scan", { method: "POST" }).then((x) => x.json());
      await mutate();
      toast.success(`Scan complete — ${r.scan.total} flags, AI reviewed ${r.adjusted}`, { id: "scan" });
    } catch {
      toast.error("Scan failed", { id: "scan" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(id: number, enabled: number) {
    setBusy(true);
    toast.loading("Updating rule & re-scanning…", { id: "rule" });
    try {
      await fetch(`/api/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enabled ? 0 : 1 }),
      });
      await mutate();
      toast.success("Rule updated", { id: "rule" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      {/* Phone-alert toggle */}
      <AlertSettings />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryStat label="At Risk" value={formatCAD(summary.amount, { compact: true })} icon={AlertTriangle} tone="destructive" sub={`${summary.total} open flags`} />
        <SummaryStat label="Critical" value={String(summary.counts.critical)} tone="destructive" />
        <SummaryStat label="High" value={String(summary.counts.high)} tone="warning" />
        <SummaryStat label="Medium / Low" value={`${summary.counts.medium} / ${summary.counts.low}`} tone="muted" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Rules */}
        <SectionCard
          title="Policy Rules"
          description="Digitized from the Brim expense policy"
          className="lg:col-span-1"
          action={
            <button onClick={rescan} disabled={busy || isValidating} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              Re-scan
            </button>
          }
        >
          <div className="space-y-2.5">
            {rules.map((r: any) => (
              <div key={r.id} className={cn("rounded-lg border border-border p-3", !r.enabled && "opacity-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <SeverityBadge severity={r.severity_base} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{r.description}</p>
                    {r.threshold_amount != null && (
                      <span className="mt-1 inline-block text-[11px] text-muted-foreground">Threshold: {formatCAD(r.threshold_amount, { compact: true })}{r.window && r.window !== "transaction" ? ` / ${r.window}` : ""}</span>
                    )}
                  </div>
                  <button onClick={() => toggleRule(r.id, r.enabled)} disabled={busy} title={r.enabled ? "Disable" : "Enable"} className={cn("rounded-md p-1.5", r.enabled ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-secondary")}>
                    <Power className="h-4 w-4" />
                  </button>
                </div>
                {r.policy_clause && (
                  <p className="mt-2 border-l-2 border-border pl-2 text-[10px] italic text-muted-foreground/70">“{r.policy_clause}”</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Violations */}
        <SectionCard title="Flagged Violations" description="Ranked by severity · AI-adjusted for context" className="lg:col-span-2">
          {violations.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" /> No open violations — spend is compliant.
            </div>
          ) : (
            <ShowMore items={violations} initial={5} noun="violations" className="space-y-2" render={(v: any) => (
                <div key={v.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <SeverityBadge severity={v.severity} ai={!!v.ai_severity} />
                      <span className="truncate text-sm font-medium">{v.merchant_name}</span>
                      {v.group_size > 1 && (
                        <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Layers className="h-3 w-3" /> {v.group_size}× split
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCAD(v.amount_involved)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{v.rule_name}</span>
                    <span>·</span>
                    <span>{v.txn_date}</span>
                    {v.category && <><span>·</span><span>{v.category}</span></>}
                    {v.transaction_code && <><span>·</span><span>card {v.transaction_code}</span></>}
                  </div>
                  {v.ai_reasoning && (
                    <p className="mt-2 flex gap-1.5 rounded-md bg-secondary/40 p-2 text-[11px] text-muted-foreground">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      {v.ai_reasoning}
                    </p>
                  )}
                </div>
            )} />
          )}
        </SectionCard>
      </div>

      {/* Repeat offenders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Repeat Offenders — Merchants" description="Most-flagged vendors">
          <OffenderTable rows={offenders.by_merchant} keyField="merchant_name" />
        </SectionCard>
        <SectionCard title="Repeat Offenders — Cards" description="Most-flagged cost centers">
          <OffenderTable rows={offenders.by_card} keyField="transaction_code" prefix="Card " />
        </SectionCard>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub, icon: Icon, tone }: any) {
  const t = { destructive: "text-destructive", warning: "text-warning", muted: "text-muted-foreground", primary: "text-primary" }[tone as string] || "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", t)} />}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", t)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function OffenderTable({ rows, keyField, prefix = "" }: { rows: any[]; keyField: string; prefix?: string }) {
  if (!rows?.length) return <div className="py-4 text-sm text-muted-foreground">None.</div>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            <td className="py-2 pr-2">{prefix}{r[keyField]}</td>
            <td className="py-2 text-right text-muted-foreground tabular-nums">{r.violations} flags</td>
            <td className="py-2 pl-3 text-right font-medium tabular-nums">{formatCAD(r.total, { compact: true })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
