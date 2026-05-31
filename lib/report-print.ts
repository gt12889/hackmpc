import { formatCAD } from "@/lib/utils";

// Browser print-to-PDF for expense reports. Builds a clean, self-contained
// printable document in a new window and opens the print dialog (the user
// picks "Save as PDF"). Zero dependencies — no PDF library required.

type Line = { txn_date: string; merchant_name: string; category: string; amount_cad: number };

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

async function fetchLines(id: number): Promise<Line[]> {
  try {
    const r = await fetch(`/api/reports/${id}`).then((x) => x.json());
    return r?.report?.lines ?? [];
  } catch {
    return [];
  }
}

function reportSection(report: any, lines: Line[]): string {
  const breakdown = (Object.entries(report.category_breakdown || {}) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const approved = report.status === "approved";
  const statusBadge = approved
    ? `<span class="badge ok">Approved</span>`
    : report.status === "flagged"
    ? `<span class="badge warn">Flagged</span>`
    : `<span class="badge">Draft</span>`;
  const flags = report.policy_flag_count > 0 ? `<span class="badge warn">${report.policy_flag_count} policy flag${report.policy_flag_count === 1 ? "" : "s"}</span>` : "";

  const breakdownRows = breakdown
    .map(([cat, amt]) => `<tr><td>${esc(cat)}</td><td class="num">${esc(formatCAD(amt))}</td></tr>`)
    .join("");

  const lineRows = lines
    .map(
      (l) =>
        `<tr><td>${esc(l.txn_date)}</td><td>${esc(l.merchant_name)}</td><td>${esc(l.category)}</td><td class="num">${esc(formatCAD(l.amount_cad))}</td></tr>`
    )
    .join("");

  return `
  <section class="report">
    <div class="rhead">
      <div>
        <h2>${esc(report.title)}</h2>
        <div class="meta">${esc(report.txn_count)} transactions · ${breakdown.length} categories ${statusBadge} ${flags}</div>
      </div>
      <div class="total">${esc(formatCAD(report.total_cad))}</div>
    </div>
    ${report.ai_summary ? `<p class="summary">${esc(report.ai_summary)}</p>` : ""}
    <h3>Category breakdown</h3>
    <table class="tbl"><thead><tr><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${breakdownRows}</tbody></table>
    <h3>Line items</h3>
    <table class="tbl"><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th class="num">Amount</th></tr></thead>
      <tbody>${lineRows || `<tr><td colspan="4" class="empty">No line items available.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="num">${esc(formatCAD(report.total_cad))}</td></tr></tfoot>
    </table>
  </section>`;
}

const STYLES = `
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:32px;}
  .brand{display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid #007d93;padding-bottom:10px;margin-bottom:6px;}
  .brand h1{font-size:22px;color:#007d93;margin:0;letter-spacing:.5px;}
  .brand .sub{color:#666;font-size:12px;}
  .genline{color:#888;font-size:11px;margin-bottom:24px;}
  .report{margin-bottom:28px;}
  .rhead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #ddd;padding-bottom:8px;}
  .rhead h2{font-size:17px;margin:0 0 2px;}
  .meta{font-size:11px;color:#666;}
  .total{font-size:20px;font-weight:700;color:#007d93;white-space:nowrap;}
  .summary{font-style:italic;color:#444;background:#f3f8f9;border-left:3px solid #00c1d5;padding:8px 12px;font-size:12px;margin:12px 0;}
  h3{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#888;margin:16px 0 6px;}
  table.tbl{width:100%;border-collapse:collapse;font-size:11px;}
  table.tbl th{text-align:left;background:#f5f5f5;color:#555;font-weight:600;padding:5px 8px;border-bottom:1px solid #ddd;}
  table.tbl td{padding:4px 8px;border-bottom:1px solid #eee;}
  table.tbl tfoot td{font-weight:700;border-top:2px solid #ccc;border-bottom:none;}
  .num{text-align:right;font-variant-numeric:tabular-nums;}
  .empty{color:#999;font-style:italic;text-align:center;}
  .badge{display:inline-block;font-size:9px;text-transform:uppercase;letter-spacing:.4px;padding:1px 6px;border-radius:4px;background:#eee;color:#555;margin-left:4px;}
  .badge.ok{background:#dff3e8;color:#1a7f4b;} .badge.warn{background:#fdeccd;color:#9a6b00;}
  .page-break{page-break-after:always;}
  @media print{ body{padding:0;} @page{margin:18mm;} }
`;

/** Open a print window for one or more reports (user saves as PDF). */
export async function printReports(reports: any[]): Promise<void> {
  if (!reports.length) return;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site to export the PDF.");
    return;
  }
  // Placeholder while line items load.
  win.document.write(`<!doctype html><title>Brim It - Expense Report</title><body style="font-family:Arial;padding:40px;color:#666">Preparing report…</body>`);
  win.document.close();

  const sections = await Promise.all(reports.map(async (r) => reportSection(r, await fetchLines(r.id))));
  const stamp = new Date().toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  const title = reports.length === 1 ? esc(reports[0].title) : `${reports.length} expense reports`;

  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Brim It - Expense Report</title><style>${STYLES}</style></head>
  <body>
    <div class="brand"><h1>BRIM IT</h1><span class="sub">Expense Report${reports.length > 1 ? " Bundle" : ""}</span></div>
    <div class="genline">${title} · Generated ${esc(stamp)} · all amounts in CAD</div>
    ${sections.join('<div class="page-break"></div>')}
  </body></html>`);
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking print.
  setTimeout(() => win.print(), 350);
}
