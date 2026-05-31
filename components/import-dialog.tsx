"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, X } from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";

export function ImportDialog({ variant = "default" }: { variant?: "default" | "prominent" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(file: File) {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setResult(data);
      if (data.added > 0) {
        toast.success(`Added ${data.added.toLocaleString()} transactions${data.skipped ? ` · ${data.skipped} duplicates skipped` : ""}`);
      } else {
        toast.info(`No new transactions — all ${data.skipped.toLocaleString()} rows were already in your data`);
      }
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex shrink-0 items-center transition-all",
          variant === "prominent"
            ? "gap-3 rounded-2xl bg-amber-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-amber-500/30 hover:scale-[1.02] hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/35 active:scale-[0.98]"
            : "gap-2 rounded-lg border border-border/60 bg-foreground/[0.03] px-3 py-2 text-[15px] text-muted-foreground hover:border-primary/30 hover:text-foreground"
        )}
      >
        <Upload className={cn(variant === "prominent" ? "h-6 w-6" : "h-4 w-4")} />
        <span className={variant === "prominent" ? "inline" : "hidden sm:inline"}>
          {variant === "prominent" ? "Upload transactions" : "Upload"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full max-w-lg animate-fade-up rounded-2xl border border-border/70 bg-popover/95 p-6 shadow-2xl ring-1 ring-inset ring-white/[0.04] backdrop-blur-xl">
            <button onClick={() => !busy && setOpen(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-lg text-neutral-900">Upload Transactions</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Upload a card-transaction export (.csv or .xlsx). New rows are normalized, categorized, and scanned against your policy — then <b>added to your existing data</b>.
            </p>

            {!result ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
                onClick={() => !busy && inputRef.current?.click()}
                className={cn(
                  "mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors",
                  drag ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/40 hover:bg-foreground/[0.02]"
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <div className="text-sm text-muted-foreground">Processing & scanning policy…</div>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                      <FileSpreadsheet className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-sm">Drag a file here, or <span className="text-primary">browse</span></div>
                    <div className="text-[13px] text-muted-foreground">CSV or Excel · columns like Date, Merchant, Amount, MCC, Card</div>
                  </>
                )}
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>
                    Added <b>{result.added.toLocaleString()}</b> from {result.fileName} — <b>{result.count.toLocaleString()}</b> total
                    {result.skipped > 0 && <span className="text-muted-foreground"> · {result.skipped.toLocaleString()} duplicate{result.skipped === 1 ? "" : "s"} skipped</span>}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Total spend" value={formatCAD(result.total, { compact: true })} />
                  <Stat label="Date range" value={`${result.start} → ${result.end}`} small />
                  <Stat label="Cards" value={String(result.cards)} />
                  <Stat label="Policy flags" value={String(result.violations)} />
                </div>
                <div className="text-[13px] text-muted-foreground">
                  Regenerated: {result.requests} approval requests, {result.reports} expense reports
                  {result.ai && (result.ai.severity || result.ai.recommendations || result.ai.summaries)
                    ? " · AI enrichment applied"
                    : " · AI enrichment skipped (quota) — use the in-page Re-scan/Regenerate buttons later"}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setResult(null)} className="rounded-md border border-border px-3 py-2 text-sm text-neutral-800 hover:bg-secondary">Upload another</button>
                  <button onClick={() => setOpen(false)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
      <div className="text-[13px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 tabular-nums", small ? "text-xs" : "text-base")}>{value}</div>
    </div>
  );
}
