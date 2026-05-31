import { CheckSquare, FileText } from "lucide-react";
import { SubTabs } from "@/components/ui/sub-tabs";
import { PageHeader } from "@/components/page-header";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { ReportsView } from "@/components/reports/reports-view";
import { getRequests, getApprovalSummary } from "@/lib/approvals";
import { getReports, getReportsSummary } from "@/lib/reports";

export const dynamic = "force-dynamic";

// Workflow = Approvals (pre-spend) + Reports (post-spend, CFO sign-off) — both approval flows.
export default function WorkflowPage() {
  const approvals = { requests: getRequests(), summary: getApprovalSummary() };
  const reports = { reports: getReports(), summary: getReportsSummary() };

  return (
    <SubTabs
      items={[
        {
          value: "approvals",
          label: "Approvals",
          icon: <CheckSquare className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader title="Pre-Approval Workflow" description="Every request, with card history, budget status, and an AI recommendation - decide once" />
              <ApprovalQueue initial={approvals} />
            </div>
          ),
        },
        {
          value: "reports",
          label: "Reports",
          icon: <FileText className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader title="Expense Reports" description="Auto-grouped transactions with category breakdowns, policy checks, and AI summaries - CFO-ready" />
              <ReportsView initial={reports} />
            </div>
          ),
        },
      ]}
    />
  );
}
