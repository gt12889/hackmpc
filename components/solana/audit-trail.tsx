"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  Link2,
  FileText,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Anchor = {
  id: number;
  record_type: "report" | "request" | "alert";
  record_id: string;
  hash: string;
  signature: string | null;
  slot: number | null;
  status: string | null;
  error: string | null;
  created_at: string;
};

const TYPE_META: Record<Anchor["record_type"], { label: string; icon: typeof FileText; href: (id: string) => string }> = {
  report: { label: "Report", icon: FileText, href: () => "/workflow?tab=reports" },
  request: { label: "Approval", icon: CheckSquare, href: () => "/workflow?tab=approvals" },
  alert: { label: "Alert", icon: AlertTriangle, href: () => "/governance?tab=violations" },
};

function explorerUrl(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function AuditTrail({ configured, initial }: { configured: boolean; initial: Anchor[] }) {
  const [rows, setRows] = useState<Anchor[]>(initial);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, "ok" | "tampered" | "error">>({});

  async function refresh() {
    const res = await fetch("/api/anchor");
    const j = await res.json();
    setRows(j.anchors ?? []);
  }

  async function verify(a: Anchor) {
    const key = `${a.record_type}:${a.record_id}`;
    setVerifying(key);
    try {
      const res = await fetch(`/api/anchor?recordType=${a.record_type}&recordId=${encodeURIComponent(a.record_id)}`);
      const j = await res.json();
      const v = j.verify;
      setVerdicts((m) => ({ ...m, [key]: v?.tampered ? "tampered" : v?.matches ? "ok" : "error" }));
    } catch {
      setVerdicts((m) => ({ ...m, [key]: "error" }));
    } finally {
      setVerifying(null);
    }
  }

  if (!configured) {
    return (
      <div className="mx-8 rounded-xl border border-border bg-card p-8 text-center">
        <Link2 className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          On-chain anchoring is off. Run <code className="rounded bg-muted px-1.5 py-0.5">npm run solana:setup</code> to
          provision a funded devnet keypair, then approve a report to see it notarized here.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-8 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No anchors yet. Approve a report or a pre-approval request - its hash will be notarized on Solana and appear here.
      </div>
    );
  }

  return (
    <div className="mx-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {rows.length} on-chain anchor{rows.length === 1 ? "" : "s"} · Solana devnet
        </span>
        <button onClick={refresh} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Record</th>
              <th className="px-4 py-2 font-medium">Hash</th>
              <th className="px-4 py-2 font-medium">Transaction</th>
              <th className="px-4 py-2 font-medium">Slot</th>
              <th className="px-4 py-2 font-medium">Anchored</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const meta = TYPE_META[a.record_type];
              const Icon = meta.icon;
              const key = `${a.record_type}:${a.record_id}`;
              const verdict = verdicts[key];
              const failed = a.status !== "confirmed";
              return (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-muted-foreground">#{a.record_id}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground" title={a.hash}>
                      {a.hash.slice(0, 10)}…
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.signature ? (
                      <a
                        href={explorerUrl(a.signature)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                      >
                        {a.signature.slice(0, 6)}…{a.signature.slice(-6)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.slot ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.created_at}</td>
                  <td className="px-4 py-2.5">
                    {failed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600" title={a.error ?? undefined}>
                        <ShieldAlert className="h-3.5 w-3.5" /> Failed
                      </span>
                    ) : verdict === "tampered" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-500/30">
                        <ShieldAlert className="h-3.5 w-3.5" /> Tampered
                      </span>
                    ) : verdict === "ok" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/30">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <button
                        onClick={() => verify(a)}
                        disabled={verifying === key}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                      >
                        <RefreshCw className={cn("h-3 w-3", verifying === key && "animate-spin")} /> Verify
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
