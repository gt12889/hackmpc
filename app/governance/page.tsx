import { ShieldCheck, ReceiptText, Link2 } from "lucide-react";
import { SubTabs } from "@/components/ui/sub-tabs";
import { PageHeader } from "@/components/page-header";
import { ComplianceView } from "@/components/compliance/compliance-view";
import { AlertSettings } from "@/components/compliance/alert-settings";
import { ReceiptsView } from "@/components/receipts/receipts-view";
import { AuditTrail } from "@/components/solana/audit-trail";
import { getRules, getViolations, getViolationSummary, getRepeatOffenders } from "@/lib/compliance";
import { receiptSummary, recentReceipts, unmatchedRequiredCharges } from "@/lib/receipts";
import { listAnchors, isAnchorConfigured } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Governance = Compliance + Receipts + Audit (the "is spend compliant & trustworthy" cluster).
export default function GovernancePage() {
  const compliance = {
    rules: getRules(),
    violations: getViolations(),
    summary: getViolationSummary(),
    offenders: getRepeatOffenders(),
  };
  const receipts = {
    summary: receiptSummary(),
    recent: recentReceipts(20),
    unmatched: unmatchedRequiredCharges(20),
  };
  // Demo: always surface seeded anchors so the Audit Trail is populated even if the
  // runtime env has no key (the trail is treated as "on" whenever anchors exist).
  const anchors = listAnchors() as any[];
  const configured = isAnchorConfigured() || anchors.length > 0;

  return (
    <SubTabs
      items={[
        {
          value: "violations",
          label: "Violations",
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader
                title="Policy Compliance"
                description="Scan transactions against the digitized expense policy - AI ranks violations by real-world severity"
              >
                <AlertSettings />
              </PageHeader>
              <ComplianceView initial={compliance} />
            </div>
          ),
        },
        {
          value: "receipts",
          label: "Receipts",
          icon: <ReceiptText className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader title="Receipts" description="AI Vision matches receipts to transactions and flags charges missing one" />
              <ReceiptsView initial={receipts} />
            </div>
          ),
        },
        {
          value: "audit",
          label: "Audit",
          icon: <Link2 className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader title="Audit Trail" description="Every approval and HIGH/CRITICAL alert notarized on Solana - SHA-256 of the record, re-verifiable for tamper detection." />
              <AuditTrail configured={configured} initial={anchors} />
            </div>
          ),
        },
      ]}
    />
  );
}
