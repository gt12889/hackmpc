"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, ScanLine, Link2, Link2Off } from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ReceiptsView({ initial }: { initial: any }) {
  const { data, mutate } = useSWR("/api/receipts", fetcher, { fallbackData: initial });
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const s = data?.summary ?? initial.summary;
  const unmatched = data?.unmatched ?? [];

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

  const metrics = [
    { label: "Receipt coverage", value: `${s.coveragePct}%`, tone: "text-primary" },
    { label: "Missing receipts", value: String(s.missing), tone: "text-warning" },
    { label: "At risk value", value: formatCAD(s.missingValue, { compact: true }), tone: "text-destructive" },
    { label: "Receipts on file", value: String(s.totalReceipts), tone: "text-neutral-600" },
  ] as const;

  return (
    <div className="space-y-6 p-8">
      <div className="overflow-hidden rounded-lg border border-border/60">
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((m) => (
            <div key={m.label} className="px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{m.label}</dt>
              <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", m.tone)}>{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border/60 px-4 py-2.5 text-sm text-neutral-600">
          {s.matched} of {s.required} charges over $50 · {s.unmatchedUploads ? `${s.unmatchedUploads} unmatched uploads` : "all uploads matched"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-border/60 p-4">
        <h3 className="text-sm font-medium text-neutral-900">Scan a receipt</h3>
        <p className="mt-0.5 text-xs text-neutral-600">Upload a photo — AI Vision reads it and matches it to a transaction</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
          onClick={() => !busy && inputRef.current?.click()}
          className={cn(
            "mt-3 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-8 transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-foreground/[0.02]"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <div className="text-sm text-neutral-600">Reading receipt with AI Vision…</div>
            </>
          ) : (
            <>
              <ScanLine className="h-8 w-8 text-primary" />
              <div className="text-sm text-neutral-800">Drag a receipt image, or <span className="text-primary">browse</span></div>
              <div className="text-[11px] text-neutral-500">JPG / PNG · merchant, date, amount extracted automatically</div>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
              <ScanLine className="h-3.5 w-3.5" /> Extracted
            </div>
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
      </div>

      <div className="rounded-lg border border-border/60 p-4">
        <h3 className="text-sm font-medium text-neutral-900">Receipt compliance</h3>
        <p className="mt-0.5 text-xs text-neutral-600">Policy: receipts are required before reimbursement</p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-neutral-700">Coverage of charges over $50</span>
            <span className="font-semibold text-neutral-900">{s.coveragePct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${s.coveragePct}%` }} />
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>{s.missing}</b> charges totaling <b>{formatCAD(s.missingValue)}</b> have no receipt on file. High-value gaps are flagged in Compliance.</span>
        </div>
      </div>
      </div>

      <div>
        <h3 className="text-sm text-neutral-900">Charges missing a receipt</h3>
        <p className="mt-0.5 text-xs text-neutral-600">Highest-value operational charges over $50 with no receipt</p>
        <div className="mt-3 rounded-lg border border-border/60">
          {unmatched.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-neutral-600">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Every charge over $50 has a receipt.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatched.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[240px] truncate font-medium text-neutral-900">{t.merchant_name}</TableCell>
                    <TableCell className="text-neutral-600">{t.category}</TableCell>
                    <TableCell className="text-neutral-600">{t.txn_date}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-neutral-900">{formatCAD(t.amount_cad)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
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
