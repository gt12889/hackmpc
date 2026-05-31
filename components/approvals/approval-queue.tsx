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
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const REC_STYLE: Record<string, { cls: string; icon: any; label: string }> = {
  approve: { cls: "text-primary", icon: CircleCheck, label: "Approve" },
  deny: { cls: "text-destructive", icon: CircleX, label: "Deny" },
  review: { cls: "text-warning", icon: CircleHelp, label: "Review" },
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
    // let the card slide out before the queue advances
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
        <div className="relative mx-auto max-w-2xl pb-6">
          {/* deck behind, implying more in the queue */}
          {pending.length > 2 && (
            <div className="absolute inset-x-8 top-0 -z-20 h-full translate-y-6 scale-[0.92] rounded-2xl border border-border/50 bg-card/40" />
          )}
          {pending.length > 1 && (
            <div className="absolute inset-x-4 top-0 -z-10 h-full translate-y-3 scale-[0.96] rounded-2xl border border-border/60 bg-card/60" />
          )}
          {/* active card slides out on decision, next slides up */}
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
            <ApprovalCard req={pending[0]} busy={busy === pending[0].id} onDecide={decide} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Queue is clear — every request has been decided.
        </div>
      )}

      {decided.length > 0 && (
        <SectionCard title="Recent Decisions" description="Audit trail">
          <div className="space-y-1.5">
            {decided.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0">
                <div className="flex items-center gap-2">
                  {r.status === "approved" ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  <span>{r.merchant_name}</span>
                  <span className="text-xs text-muted-foreground">· card {r.transaction_code}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatCAD(r.amount_cad)}</span>
                  <span className={cn("text-xs font-medium uppercase", r.status === "approved" ? "text-primary" : "text-destructive")}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function ApprovalCard({ req, busy, onDecide }: { req: any; busy: boolean; onDecide: (id: number, d: "approved" | "denied") => void }) {
  const ctx = req.context || {};
  const rec = REC_STYLE[req.ai_recommendation] || REC_STYLE.review;
  const RecIcon = rec.icon;
  const overBudget = ctx.categoryRemaining < 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{req.merchant_name}</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[13px] text-muted-foreground">{req.category}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{req.reason}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-primary">{formatCAD(req.amount_cad)}</div>
          <div className="text-[13px] text-muted-foreground">Card {req.transaction_code} · {ctx.month}</div>
        </div>
      </div>

      {/* Context grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Ctx icon={CreditCard} label="Card total spend" value={formatCAD(ctx.cardTotalSpend || 0, { compact: true })} />
        <Ctx icon={History} label={`Prior ${req.category} (card)`} value={formatCAD(ctx.cardCategorySpend || 0, { compact: true })} />
        <Ctx icon={History} label="Prior txns w/ vendor" value={String(ctx.cardMerchantCount ?? 0)} />
        <Ctx
          icon={Wallet}
          label="Category budget left"
          value={formatCAD(ctx.categoryRemaining || 0, { compact: true })}
          tone={overBudget ? "destructive" : "primary"}
        />
      </div>

      {/* AI recommendation */}
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background", rec.cls)}>
          <RecIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide">AI Recommendation:</span>
            <span className={cn("text-xs font-bold uppercase", rec.cls)}>{rec.label}</span>
            {req.ai_confidence != null && <span className="text-[13px] text-muted-foreground">({Math.round(req.ai_confidence * 100)}% confidence)</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{req.ai_reasoning}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => onDecide(req.id, "denied")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
          <X className="h-4 w-4" /> Deny
        </button>
        <button onClick={() => onDecide(req.id, "approved")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Check className="h-4 w-4" /> Approve
        </button>
      </div>
    </div>
  );
}

function Ctx({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "destructive" && "text-destructive", tone === "primary" && "text-primary")}>{value}</div>
    </div>
  );
}
