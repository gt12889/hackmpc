import { NextRequest, NextResponse } from "next/server";
import { getClient, generateWithFallback, hasOpenAIKey } from "@/lib/gemini";
import { matchReceipt, insertReceipt, receiptSummary, recentReceipts, unmatchedRequiredCharges } from "@/lib/receipts";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    summary: receiptSummary(),
    recent: recentReceipts(20),
    unmatched: unmatchedRequiredCharges(20),
  });
}

// Upload a receipt image → Gemini Vision extracts fields → fuzzy-match to a transaction.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const ai = getClient();
    if (!ai && !hasOpenAIKey()) return NextResponse.json({ error: "No AI key configured for OCR" }, { status: 503 });

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const mimeType = file.type || "image/jpeg";

    let extracted: any = {};
    try {
      const { resp } = await generateWithFallback(ai, {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              {
                text:
                  "Extract these fields from this receipt image. Return ONLY JSON: " +
                  '{"merchant": string, "date": "YYYY-MM-DD", "amount": number (grand total in the receipt currency), "tax": number}. ' +
                  "If a field is unreadable use null.",
              },
            ],
          },
        ],
        config: { temperature: 0, responseMimeType: "application/json" },
      });
      const text = resp.text || "{}";
      extracted = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    } catch (e: any) {
      return NextResponse.json({ error: "OCR failed: " + (e?.message || "vision error") }, { status: 502 });
    }

    const { transaction_id, confidence } = matchReceipt(extracted);
    insertReceipt({
      transaction_id,
      source: "upload",
      image_path: file.name,
      extracted_merchant: extracted.merchant ?? null,
      extracted_date: extracted.date ?? null,
      extracted_amount: extracted.amount ?? null,
      extracted_tax: extracted.tax ?? null,
      confidence,
    });

    const txn = transaction_id
      ? getDb().prepare(`SELECT id, merchant_name, txn_date, amount_cad, category FROM transactions WHERE id=?`).get(transaction_id)
      : null;

    return NextResponse.json({ ok: true, extracted, matched: !!transaction_id, confidence, txn, summary: receiptSummary() });
  } catch (e: any) {
    console.error("[/api/receipts]", e);
    return NextResponse.json({ error: e?.message || "Receipt upload failed" }, { status: 500 });
  }
}
