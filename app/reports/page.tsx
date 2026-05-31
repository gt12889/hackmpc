import { PageHeader } from "@/components/page-header";
import { ReportsView } from "@/components/reports/reports-view";
import { getReports, getReportsSummary } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const initial = { reports: getReports(), summary: getReportsSummary() };
  return (
    <div>
      <PageHeader
        title="Expense Reports"
        description="Auto-grouped transactions with category breakdowns, policy checks, and AI summaries - CFO-ready"
      />
      <ReportsView initial={initial} />
    </div>
  );
}
