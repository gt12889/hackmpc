"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertTriangle, ReceiptText, ScanLine, Link2, Link2Off } from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ReceiptsView({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/receipts", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const s = data?.summary ?? initial.summary;
  const unmatched = data?.unmatched ?? [];
  const recent = data?.recent ?? [];

  async function upload(file: File) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error("Upload a receipt image (jpg/png)"); return; }
    setBusy(true); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/receipts", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Upload failed");
      setResult(d);
      toast[d.matched ? "success" : "warning"](d.matched ? "Receipt matched to a transaction" : "Extracted, but no matching transaction found");
      await mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Receipt Coverage" value={`${s.coveragePct}%`} sub={`${s.matched} of ${s.required} charges >$50`} tone="primary" />
        <Stat label="Missing Receipts" value={String(s.missing)} sub="require a receipt" tone="warning" />
        <Stat label="At Risk Value" value={formatCAD(s.missingValue, { compact: true })} sub="unreceipted spend" tone="destructive" />
        <Stat label="Receipts on File" value={String(s.totalReceipts)} sub={s.unmatchedUploads ? `${s.unmatchedUploads} unmatched uploads` : "all matched"} tone="muted" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload / OCR */}
        <SectionCard title="Scan a Receipt" description="Upload a photo — AI Vision reads it and matches it to a transaction">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
            onClick={() => !busy && inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors",
              drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-foreground/[0.02]"
            )}
          >
            {busy ? (
              <><Loader2 className="h-7 w-7 animate-spin text-primary" /><div className="text-sm text-neutral-600">Reading receipt with AI Vision…</div></>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30"><ScanLine className="h-6 w-6 text-primary" /></div>
                <div className="text-sm text-neutral-800">Drag a receipt image, or <span className="text-primary">browse</span></div>
                <div className="text-[11px] text-neutral-500">JPG / PNG · merchant, date, amount extracted automatically</div>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>

          {result && (
            <div className="mt-4 rounded-lg border border-border bg-foreground/[0.02] p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500"><ScanLine className="h-3.5 w-3.5" /> Extracted</div>
              <div className="grid grid-cols-3 gap-2 text-neutral-800">
                <Field label="Merchant" value={result.extracted?.merchant ?? "—"} />
                <Field label="Date" value={result.extracted?.date ?? "—"} />
                <Field label="Amount" value={result.extracted?.amount != null ? formatCAD(Number(result.extracted.amount)) : "—"} />
              </div>
              <div className={cn("mt-3 flex items-center gap-2 rounded-md p-2 text-xs", result.matched ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning")}>
                {result.matched ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                {result.matched
                  ? <span>Matched to <b>{result.txn?.merchant_name}</b> · {formatCAD(result.txn?.amount_cad)} · {result.txn?.txn_date} ({Math.round((result.confidence || 0) * 100)}% confidence)</span>
                  : <span>No matching transaction found — saved as an unmatched receipt.</span>}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Coverage */}
        <SectionCard title="Receipt Compliance" description="Policy: receipts are required before reimbursement">
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-neutral-700">Coverage of charges over $50</span>
              <span className="font-semibold text-neutral-900">{s.coveragePct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${s.coveragePct}%` }} />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>{s.missing}</b> charges totaling <b>{formatCAD(s.missingValue)}</b> have no receipt on file. High-value gaps are flagged in Compliance.</span>
          </div>
        </SectionCard>
      </div>

      {/* Unmatched required */}
      <SectionCard title="Charges Missing a Receipt" description="Highest-value operational charges over $50 with no receipt">
        {unmatched.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-neutral-600"><CheckCircle2 className="h-5 w-5 text-primary" /> Every charge over $50 has a receipt.</div>
        ) : (
          <div className="space-y-1.5">
            {unmatched.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-warning" />
                  <span className="text-neutral-800">{t.merchant_name}</span>
                  <span className="text-xs text-neutral-500">· {t.category} · {t.txn_date}</span>
                </div>
                <span className="font-semibold tabular-nums text-neutral-900">{formatCAD(t.amount_cad)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="truncate text-sm">{value}</div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: any) {
  const t = { primary: "text-primary", warning: "text-warning", destructive: "text-destructive", muted: "text-neutral-500" }[tone as string] || "text-neutral-900";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cn("mt-2 text-2xl tabular-nums", t)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
