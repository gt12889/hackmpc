"use client";

import { useEffect, useState, useCallback } from "react";
import { Link2, ShieldCheck, ShieldAlert, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Verify = {
  found: boolean;
  status?: string | null;
  signature?: string | null;
  explorerUrl?: string | null;
  slot?: number | null;
  storedHash?: string;
  currentHash?: string | null;
  onChainHash?: string | null;
  matches?: boolean;
  tampered?: boolean;
};

// Compact on-chain anchor indicator for an approved report / decided request / alert.
// Self-fetches its anchor + verify state and offers a "Verify" re-check (the tamper demo).
export function AnchorBadge({
  recordType,
  recordId,
  className,
}: {
  recordType: "report" | "request" | "alert" | "vendor";
  recordId: string | number;
  className?: string;
}) {
  const [configured, setConfigured] = useState(true);
  const [data, setData] = useState<Verify | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/anchor?recordType=${recordType}&recordId=${encodeURIComponent(String(recordId))}`);
      const j = await res.json();
      setConfigured(j.configured !== false);
      setData(j.verify ?? null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [recordType, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking chain…
      </span>
    );
  }

  if (!configured) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground/70", className)} title="Set SOLANA_PAYER_SECRET to enable on-chain anchoring">
        <Link2 className="h-3.5 w-3.5" /> On-chain anchoring off
      </span>
    );
  }

  if (!data?.found) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground/70", className)}>
        <Link2 className="h-3.5 w-3.5" /> Not yet anchored
      </span>
    );
  }

  const tampered = !!data.tampered;
  const sig8 = data.signature ? `${data.signature.slice(0, 4)}…${data.signature.slice(-4)}` : null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2 text-xs", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ring-1",
          tampered
            ? "bg-red-500/10 text-red-600 ring-red-500/30"
            : "bg-primary/10 text-primary ring-primary/30"
        )}
      >
        {tampered ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {tampered ? "Tampered" : "Anchored on Solana"}
      </span>

      {data.explorerUrl && sig8 && (
        <a
          href={data.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          title="View the Memo transaction on Solana Explorer (devnet)"
        >
          <span className="font-mono">{sig8}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <button
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        title="Re-hash the live record and compare to the on-chain proof"
      >
        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Verify
      </button>
    </span>
  );
}
