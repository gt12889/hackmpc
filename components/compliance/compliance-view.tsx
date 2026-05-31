"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Power,
  Layers,
  ChevronDown,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { Reveal } from "@/components/reveal";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ShowMore, ExpandSection } from "@/components/show-more";
import { AlertSettings } from "@/components/compliance/alert-settings";
import { COMPLIANCE_CONTEXTS } from "@/lib/compliance-contexts";
import { AnchorBadge } from "@/components/solana/anchor-badge";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const SEV_STYLE: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive ring-destructive/30",
  high: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  medium: "bg-warning/15 text-warning ring-warning/30",
  low: "bg-muted text-muted-foreground ring-border",
};

/** Dot-only severity indicator for collapsed accordion rows */
const SEV_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-orange-400",
  medium: "bg-warning",
  low: "bg-muted-foreground",
};

export function SeverityBadge({ severity, ai }: { severity: string; ai?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-medium uppercase tracking-wide ring-1", SEV_STYLE[severity] || SEV_STYLE.low)}>
      {ai && <Sparkles className="h-3 w-3" />}
      {severity}
    </span>
  );
}

export function ComplianceView({ initial }: { initial: any }) {
  const { data, mutate, isValidating } = useSWR("/api/policies", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState("normal");

  /** Accordion open state for violation rows */
  const [openIds, setOpenIds] = useState<Set<number | string>>(new Set());

  function toggleViolation(id: number | string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const summary = data?.summary ?? initial.summary;
  const rules = data?.rules ?? [];
  const violations = data?.violations ?? [];
  const offenders = data?.offenders ?? { by_merchant: [], by_card: [] };

  async function rescan() {
    setBusy(true);
    toast.loading("Re-scanning with AI review…", { id: "scan" });
    try {
      const r = await fetch("/api/policies/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      }).then((x) => x.json());
      await mutate();
      toast.success(`Scan complete - ${r.scan.total} flags, AI reviewed ${r.adjusted}`, { id: "scan" });
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

  const metrics = [
    { label: "At risk", value: formatCAD(summary.amount, { compact: true }), tone: "text-destructive", hint: "Total CAD value of transactions with an open policy violation." },
    { label: "Critical", value: String(summary.counts.critical), tone: "text-destructive", hint: "Genuine breach or strong evasion signal - amounts engineered under a threshold, a prohibited category, or a non-routine merchant. Triggers an outbound alert." },
    { label: "High", value: String(summary.counts.high), tone: "text-warning", hint: "Large or unusual spending that needs pre-authorization visibility. Legitimate but should be reviewed." },
    { label: "Medium / low", value: `${summary.counts.medium} / ${summary.counts.low}`, tone: "text-neutral-600", hint: "Minor or likely-legitimate items - shown in the feed only, no alert." },
  ] as const;

  return (
    <div className="space-y-6 p-8">
      <div className="overflow-hidden rounded-lg border border-border/60">
        <TooltipProvider delayDuration={150}>
          <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
            {metrics.map((m) => (
              <div key={m.label} className="px-4 py-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <dt className="w-fit cursor-help text-[13px] font-medium uppercase tracking-wide text-neutral-500 decoration-dotted underline-offset-4 hover:underline">
                      {m.label}
                    </dt>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-left">{m.hint}</TooltipContent>
                </Tooltip>
                <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", m.tone)}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </TooltipProvider>
        <p className="border-t border-border/60 px-4 py-2.5 text-sm text-neutral-600">
          {summary.total} open policy flags
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Rules */}
        <Reveal delay={0} className="lg:col-span-1">
        <SectionCard
          title="Policy Rules"
          description="Digitized from the Brim expense policy"
          action={
            <div className="flex items-center gap-2">
            <select
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={busy || isValidating}
              title="Compliance context — scales rule thresholds before scanning"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 focus:outline-none disabled:opacity-50"
            >
              {COMPLIANCE_CONTEXTS.map((c) => (
                <option key={c.id} value={c.id} title={c.description}>{c.label}</option>
              ))}
            </select>
            <button onClick={rescan} disabled={busy || isValidating} className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              Re-scan
            </button>
            </div>
          }
        >
          <div className="space-y-2.5">
            {rules.map((r: any) => (
              <div key={r.id} className={cn("group rounded-lg border border-border p-3 transition-colors hover:border-primary/30", !r.enabled && "opacity-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <SeverityBadge severity={r.severity_base} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{r.description}</p>
                  </div>
                  <button onClick={() => toggleRule(r.id, r.enabled)} disabled={busy} title={r.enabled ? "Disable" : "Enable"} className={cn("rounded-md p-1.5", r.enabled ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-secondary")}>
                    <Power className="h-4 w-4" />
                  </button>
                </div>
                {/* Threshold + example: hidden by default, revealed on hover/focus to keep cards condensed */}
                {(r.threshold_amount != null || r.policy_clause) && (
                  <div className="grid grid-rows-[0fr] transition-all duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] motion-reduce:transition-none">
                    <div className="overflow-hidden">
                      {r.threshold_amount != null && (
                        <span className="mt-1 inline-block text-[13px] text-muted-foreground">Threshold: {formatCAD(r.threshold_amount, { compact: true })}{r.window && r.window !== "transaction" ? ` / ${r.window}` : ""}</span>
                      )}
                      {r.policy_clause && (
                        <p className="mt-2 border-l-2 border-border pl-2 text-[12px] italic text-muted-foreground/70">"{r.policy_clause}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
        </Reveal>

        {/* Violations */}
        <Reveal delay={70} className="lg:col-span-2">
        <SectionCard title="Flagged Violations" description="Ranked by severity · AI-adjusted for context" className="h-full">
          {violations.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" /> No open violations - spending is compliant.
            </div>
          ) : (
            <ShowMore items={violations} initial={5} noun="violations" className="space-y-1" render={(v: any) => {
              const isOpen = openIds.has(v.id);
              return (
                <div key={v.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Collapsed row - always visible */}
                  <button
                    onClick={() => toggleViolation(v.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                  >
                    {/* Severity dot */}
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[v.severity] || SEV_DOT.low)}
                      aria-label={v.severity}
                    />
                    {/* Merchant name */}
                    <span className="flex-1 truncate text-sm font-medium">{v.merchant_name}</span>
                    {/* Group badge */}
                    {v.group_size > 1 && (
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[12px] text-muted-foreground">
                        <Layers className="h-3 w-3" /> {v.group_size}×
                      </span>
                    )}
                    {/* AI indicator */}
                    {v.ai_severity && (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="AI-adjusted" />
                    )}
                    {/* Amount */}
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCAD(v.amount_involved)}</span>
                    {/* Chevron */}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Expanded detail - revealed on click */}
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-border/60 px-3 pb-3 pt-2.5 space-y-2">
                        {/* Rule + date + meta row */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
                          <SeverityBadge severity={v.severity} ai={!!v.ai_severity} />
                          <span>{v.rule_name}</span>
                          <span>·</span>
                          <span>{v.txn_date}</span>
                          {v.category && <><span>·</span><span>{v.category}</span></>}
                          {v.transaction_code && <><span>·</span><span>card {v.transaction_code}</span></>}
                          {v.group_size > 1 && (
                            <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[12px]">
                              <Layers className="h-3 w-3" /> {v.group_size}× split
                            </span>
                          )}
                        </div>
                        {/* On-chain anchor for HIGH/CRITICAL alerts (alert_key mirrors lib/notifications) */}
                        {(v.severity === "high" || v.severity === "critical") && v.rule_id != null && (
                          <AnchorBadge
                            recordType="alert"
                            recordId={`${v.rule_id}:${v.group_key ?? (v.transaction_id != null ? `txn-${v.transaction_id}` : "unknown")}`}
                          />
                        )}
                        {/* AI reasoning */}
                        {v.ai_reasoning && (
                          <p className="flex gap-1.5 rounded-md bg-secondary/40 p-2 text-[13px] text-muted-foreground">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            {v.ai_reasoning}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }} />
          )}
        </SectionCard>
        </Reveal>
      </div>

      {/* Repeat offenders - collapsible */}
      <ExpandSection label="Repeat Offenders" defaultOpen={false}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal delay={0}>
            <SectionCard title="By merchant" description="Most-flagged vendors" className="h-full">
              <OffenderTable rows={offenders.by_merchant} keyField="merchant_name" />
            </SectionCard>
          </Reveal>
          <Reveal delay={70}>
            <SectionCard title="By card" description="Most-flagged cost centers" className="h-full">
              <OffenderTable rows={offenders.by_card} keyField="transaction_code" prefix="Card " />
            </SectionCard>
          </Reveal>
        </div>
      </ExpandSection>

      {/* Phone-alert control: tucked bottom-right to keep the page uncluttered */}
      <div className="flex justify-end">
        <AlertSettings />
      </div>
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
