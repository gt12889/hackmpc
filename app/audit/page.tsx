import { PageHeader } from "@/components/page-header";
import { AuditTrail } from "@/components/solana/audit-trail";
import { listAnchors, isAnchorConfigured } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AuditPage() {
  const configured = isAnchorConfigured();
  const anchors = configured ? (listAnchors() as any[]) : [];
  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Every approval and HIGH/CRITICAL alert notarized on Solana - SHA-256 of the record, written to the chain and re-verifiable for tamper detection."
      />
      <AuditTrail configured={configured} initial={anchors} />
    </div>
  );
}
