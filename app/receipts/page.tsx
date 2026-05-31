import { PageHeader } from "@/components/page-header";
import { ReceiptsView } from "@/components/receipts/receipts-view";
import { receiptSummary, recentReceipts, unmatchedRequiredCharges } from "@/lib/receipts";

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  const initial = {
    summary: receiptSummary(),
    recent: recentReceipts(20),
    unmatched: unmatchedRequiredCharges(20),
  };
  return (
    <div>
      <PageHeader title="Receipts" description="AI Vision matches receipts to transactions and flags charges missing one" />
      <ReceiptsView initial={initial} />
    </div>
  );
}
