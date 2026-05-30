import { PageHeader } from "@/components/page-header";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { getRequests, getApprovalSummary } from "@/lib/approvals";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  const initial = { requests: getRequests(), summary: getApprovalSummary() };
  return (
    <div>
      <PageHeader
        title="Pre-Approval Workflow"
        description="Every request, with card history, budget status, and an AI recommendation — decide once"
      />
      <ApprovalQueue initial={initial} />
    </div>
  );
}
