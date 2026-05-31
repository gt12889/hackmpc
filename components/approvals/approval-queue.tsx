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
import { ShowMore } from "@/components/show-more";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const REC_STYLE: Record<string, { cls: string; icon: any; label: string }> = {
  approve: { cls: "text-primary", icon: CircleCheck, label: "Approve" },
  deny: { cls: "text-destructive", icon: CircleX, label: "Deny" },
  review: { cls: "text-warning", icon: CircleHelp, label: "Review" },
};

export function ApprovalQueue({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/requests", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState<number | "all" | null>(null);

  const requests = data?.requests ?? [];
  const summary = data?.summary ?? initial.summary;
  const pending = requests.filter((r: any) => r.status === "pending");
  const decided = requests.filter((r: any) => r.status !== "pending");

  async function decide(id: number, decision: "approved" | "denied") {
    setBusy(id);
    try {
      await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await mutate();
      toast.success(`Request ${decision}`);
    } catch {
      toast.error("Failed to record decision");
    } finally {
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

  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pending" value={String(summary.pending)} tone="warning" />
        <Stat label="Pending Value" value={formatCAD(summary.pendingAmount || 0, { compact: true })} tone="primary" />
        <Stat label="Approved" value={String(summary.approved)} tone="primary" />
        <Stat label="Denied" value={String(summary.denied)} tone="destructive" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">{pending.length} requests awaiting your decision</h2>
        <button onClick={regenerate} disabled={busy === "all"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", busy === "all" && "animate-spin")} /> Rebuild queue
        </button>
      </div>

      <div className="space-y-4">
        <ShowMore
          items={pending}
          initial={3}
          noun="requests"
          className="space-y-4"
          render={(r: any) => <ApprovalCard key={r.id} req={r} busy={busy === r.id} onDecide={decide} />}
        />
        {pending.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Queue is clear — every request has been decided.
          </div>
        )}
      </div>

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
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{req.category}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{req.reason}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{formatCAD(req.amount_cad)}</div>
          <div className="text-[11px] text-muted-foreground">Card {req.transaction_code} · {ctx.month}</div>
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
            {req.ai_confidence != null && <span className="text-[11px] text-muted-foreground">({Math.round(req.ai_confidence * 100)}% confidence)</span>}
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
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "destructive" && "text-destructive", tone === "primary" && "text-primary")}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: any) {
  const t = { destructive: "text-destructive", warning: "text-warning", muted: "text-muted-foreground", primary: "text-primary" }[tone as string] || "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", t)}>{value}</div>
    </div>
  );
}
