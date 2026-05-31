import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { ingestRows } from "@/lib/ingest";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";
import { synthesizeRequests, generateRecommendations } from "@/lib/approvals";
import { generateReports, summarizeReports } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upload a transactions file (CSV or XLSX), normalize + load it, then rebuild
// compliance violations, the approval queue, and expense reports.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    let rows: any[];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    } catch {
      return NextResponse.json({ error: "Could not parse the file. Upload a .csv or .xlsx export." }, { status: 400 });
    }
    if (!rows.length) return NextResponse.json({ error: "The file has no rows." }, { status: 400 });

    const db = getDb();
    const result = ingestRows(db, rows, { mode: "append" });
    if (!result.added && !result.skipped) {
      return NextResponse.json({ error: "No transactions could be read - check the column headers." }, { status: 400 });
    }

    // Only re-derive downstream data if something actually changed.
    let scan = { total: result.added ? 0 : -1 } as { total: number };
    let requests = 0;
    let reports = 0;
    const ai = { severity: 0, recommendations: 0, summaries: 0 };
    if (result.added > 0) {
      scan = runScan();
      requests = synthesizeRequests();
      reports = generateReports(12);
      // AI enrichment - best effort so a quota limit never fails the upload.
      try { ai.severity = await adjustSeverityWithAI(); } catch {}
      try { ai.recommendations = await generateRecommendations(); } catch {}
      try { ai.summaries = await summarizeReports(); } catch {}
    }

    // Report the current open-violation count (after any rescan).
    const violations = (getDb().prepare(`SELECT COUNT(DISTINCT COALESCE(group_key, CAST(id AS TEXT))) n FROM violations WHERE status='open'`).get() as any).n ?? 0;

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      ...result,
      violations,
      requests,
      reports,
      ai,
    });
  } catch (e: any) {
    console.error("[/api/import]", e);
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
