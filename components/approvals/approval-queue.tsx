"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Check,
  X,
  Sparkles,
  CreditCard,
  History,
  Wallet,
  RefreshCw,
  CircleCheck,
  CircleX,
  CircleHelp,
  MapPin,
  Calendar,
  FileText,
  AlertTriangle,
  Tag,
  ChevronRight,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { AnchorBadge } from "@/components/solana/anchor-badge";
import { MagicSection, MagicCard } from "@/components/magic-bento/magic-fx";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const REC_STYLE: Record<string, { cls: string; icon: any; label: string }> = {
  approve: { cls: "text-primary", icon: CircleCheck, label: "Approve" },
  deny: { cls: "text-destructive", icon: CircleX, label: "Deny" },
  review: { cls: "text-warning", icon: CircleHelp, label: "Review" },
};

const SEV_DOT: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

export function ApprovalQueue({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/requests", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [exit, setExit] = useState<{ id: number; dir: "left" | "right" } | null>(null);

  const requests = data?.requests ?? [];
  const summary = data?.summary ?? initial.summary;
  const pending = requests.filter((r: any) => r.status === "pending");
  const decided = requests.filter((r: any) => r.status !== "pending");

  async function decide(id: number, decision: "approved" | "denied") {
    if (busy) return;
    setBusy(id);
    setExit({ id, dir: decision === "approved" ? "right" : "left" });
    await new Promise((r) => setTimeout(r, 320));
    try {
      await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await mutate();
      toast.success(decision === "approved" ? "Approved" : "Denied");
    } catch {
      toast.error("Failed to record decision");
    } finally {
      setExit(null);
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("all");
    toast.loading("Rebuilding queue & generating recommendations…", { id: "regen" });
    try {
      await fetch("/api/requests", { method: "POST" });
      await mutate();
      toast.success("Queue refreshed", { id: "regen" });
    } finally {
      setBusy(null);
    }
  }

  const metrics = [
    { label: "Pending", value: String(summary.pending), tone: "text-warning" },
    { label: "Pending value", value: formatCAD(summary.pendingAmount || 0, { compact: true }), tone: "text-primary" },
    { label: "Approved", value: String(summary.approved), tone: "text-primary" },
    { label: "Denied", value: String(summary.denied), tone: "text-destructive" },
  ] as const;

  return (
    <MagicSection className="space-y-6 p-8" glowColor="0, 193, 213" spotlightRadius={320}>
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
        <div>
          <h2 className="text-sm font-semibold">{pending.length ? `Reviewing 1 of ${pending.length}` : "All caught up"}</h2>
          <p className="text-xs text-muted-foreground">
            {(summary.approved || 0) + (summary.denied || 0)} of {(summary.approved || 0) + (summary.denied || 0) + pending.length} decided
          </p>
        </div>
        <button onClick={regenerate} disabled={busy === "all"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", busy === "all" && "animate-spin")} /> Rebuild queue
        </button>
      </div>

      {pending.length > 0 ? (
        <div className="relative mx-auto max-w-4xl pb-6">
          {pending.length > 2 && (
            <div className="absolute inset-x-8 top-0 -z-20 h-full translate-y-6 scale-[0.92] rounded-2xl border border-border/50 bg-card/40" />
          )}
          {pending.length > 1 && (
            <div className="absolute inset-x-4 top-0 -z-10 h-full translate-y-3 scale-[0.96] rounded-2xl border border-border/60 bg-card/60" />
          )}
          <div
            key={pending[0].id}
            className="relative transition-all duration-300 ease-out"
            style={{
              transform:
                exit && exit.id === pending[0].id
                  ? `translateX(${exit.dir === "right" ? "130%" : "-130%"}) rotate(${exit.dir === "right" ? 6 : -6}deg)`
                  : "none",
              opacity: exit && exit.id === pending[0].id ? 0 : 1,
            }}
          >
            <MagicCard className="block rounded-xl" glowColor="0, 193, 213" enableTilt={false}>
              <ApprovalCard req={pending[0]} busy={busy === pending[0].id} onDecide={decide} />
            </MagicCard>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Queue is clear - every request has been decided.
        </div>
      )}

      {decided.length > 0 && (
        <SectionCard title="Recent Decisions" description="Audit trail">
          <div className="space-y-1.5">
            {decided.map((r: any) => (
              <div key={r.id} className="border-b border-border/50 py-2 text-sm last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.status === "approved" ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                    <span>{r.merchant_name}</span>
                    <span className="text-xs text-muted-foreground">· card {r.transaction_code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatCAD(r.amount_cad)}</span>
                    <span className={cn("text-xs font-medium uppercase", r.status === "approved" ? "text-success" : "text-destructive")}>{r.status}</span>
                  </div>
                </div>
                <div className="mt-1 pl-6">
                  <AnchorBadge recordType="request" recordId={r.id} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </MagicSection>
  );
}

function ApprovalCard({ req, busy, onDecide }: { req: any; busy: boolean; onDecide: (id: number, d: "approved" | "denied") => void }) {
  const ctx = req.context || {};
  const rec = REC_STYLE[req.ai_recommendation] || REC_STYLE.review;
  const RecIcon = rec.icon;
  const overBudget = ctx.categoryRemaining < 0;
  const location = [ctx.merchantCity, ctx.state, ctx.country].filter(Boolean).join(", ");
  const history: any[] = req.merchantHistory ?? [];
  const flags: any[] = req.violations ?? [];
  const [showCtx, setShowCtx] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold">{req.merchant_name}</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[13px] text-muted-foreground">{req.category}</span>
            {ctx.subcategory && (
              <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[13px] text-muted-foreground">{ctx.subcategory}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{req.reason}</p>
          {ctx.description && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-neutral-700">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {ctx.description}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums text-primary">{formatCAD(req.amount_cad)}</div>
          {ctx.currency && ctx.currency !== "CAD" && (
            <div className="text-[13px] text-muted-foreground">{ctx.currency} · converted to CAD</div>
          )}
        </div>
      </div>

      {/* Transaction details */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail icon={CreditCard} label="Card / holder" value={`${req.transaction_code}${req.cardholder ? ` · ${req.cardholder}` : ""}`} />
        <Detail icon={Calendar} label="Transaction date" value={ctx.txnDate ? formatDate(ctx.txnDate) : "-"} sub={ctx.postingDate && ctx.postingDate !== ctx.txnDate ? `Posted ${formatDate(ctx.postingDate)}` : undefined} />
        {location && <Detail icon={MapPin} label="Location" value={location} sub={ctx.isCrossBorder ? "Cross-border charge" : undefined} />}
        {ctx.mcc && <Detail icon={Tag} label="MCC" value={ctx.mcc} />}
      </div>

      {/* Policy flags */}
      {flags.length > 0 && (
        <div className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" />
            Policy flags on this transaction
          </div>
          <ul className="mt-2 space-y-2">
            {flags.map((v: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEV_DOT[v.severity] ?? "bg-slate-400")} />
                <div>
                  <span className="font-medium">{v.rule_name}</span>
                  <span className="ml-1.5 text-[13px] uppercase text-muted-foreground">{v.severity}</span>
                  {v.ai_reasoning && <p className="mt-0.5 text-[13px] text-muted-foreground">{v.ai_reasoning}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deeper context (spend history + prior vendor charges) - collapsed by default to keep the card scannable */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowCtx((v) => !v)}
          aria-expanded={showCtx}
          className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-neutral-500 transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showCtx && "rotate-90")} />
          Spend context{history.length > 0 ? ` & vendor history (${history.length})` : ""}
        </button>
        <div className={cn("grid transition-all duration-200", showCtx ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Ctx icon={CreditCard} label="Card total spend" value={formatCAD(ctx.cardTotalSpend || 0, { compact: true })} sub={`${ctx.cardTxnCount ?? 0} transactions`} />
              <Ctx icon={History} label={`Prior ${req.category} (card)`} value={formatCAD(ctx.cardCategorySpend || 0, { compact: true })} />
              <Ctx icon={History} label="Prior txns w/ vendor" value={String(ctx.cardMerchantCount ?? 0)} sub={ctx.cardMerchantCount > 0 ? "Established vendor" : "First-time vendor"} />
              <Ctx
                icon={Wallet}
                label="Category budget left"
                value={formatCAD(ctx.categoryRemaining || 0, { compact: true })}
                sub={`${formatCAD(ctx.categoryThisMonth || 0, { compact: true })} of ${formatCAD(ctx.categoryBudget || 0, { compact: true })} used in ${ctx.month}`}
                tone={overBudget ? "destructive" : "primary"}
              />
            </div>

            {history.length > 0 && (
              <div className="mt-4">
                <h3 className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">Prior charges with this vendor (same card)</h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-secondary/30 text-left text-[13px] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Merchant</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h: any, i: number) => (
                        <tr key={i} className="border-b border-border/40 last:border-0">
                          <td className="px-3 py-2 text-neutral-600">{h.txn_date}</td>
                          <td className="max-w-[180px] truncate px-3 py-2">{h.merchant_name}</td>
                          <td className="px-3 py-2 text-neutral-600">{h.category}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCAD(h.amount_cad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI recommendation */}
      <div className="mt-5 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background", rec.cls)}>
            <RecIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide">AI recommendation</span>
              <span className={cn("text-xs font-bold uppercase", rec.cls)}>{rec.label}</span>
              {req.ai_confidence != null && (
                <span className="text-[13px] text-muted-foreground">({Math.round(req.ai_confidence * 100)}% confidence)</span>
              )}
            </div>
            {req.ai_reasoning && <p className="mt-2 text-sm leading-relaxed text-neutral-800">{req.ai_reasoning}</p>}
          </div>
        </div>

        {(ctx.approveCase || ctx.denyCase) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ctx.approveCase && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <CircleCheck className="h-3.5 w-3.5" /> Case for approving
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{ctx.approveCase}</p>
              </div>
            )}
            {ctx.denyCase && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                  <CircleX className="h-3.5 w-3.5" /> Case for denying
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{ctx.denyCase}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-2 border-t border-border/60 pt-5">
        <button onClick={() => onDecide(req.id, "denied")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
          <X className="h-4 w-4" /> Deny
        </button>
        <button onClick={() => onDecide(req.id, "approved")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Check className="h-4 w-4" /> Approve
        </button>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Ctx({ icon: Icon, label, value, sub, tone }: any) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "destructive" && "text-destructive", tone === "primary" && "text-primary")}>{value}</div>
      {sub && <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
