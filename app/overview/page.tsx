import { LayoutDashboard, Wallet } from "lucide-react";
import { SubTabs } from "@/components/ui/sub-tabs";
import { ImportDialog } from "@/components/import-dialog";
import { SpendOverview } from "@/components/overview/spend-overview";
import { PageHeader } from "@/components/page-header";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { getBudgetStatus } from "@/lib/budgets";

export const dynamic = "force-dynamic";

// Overview = Spend overview + Budgets (consolidated from /dashboard and /budgets).
export default function OverviewPage() {
  return (
    <div className="typography-overview-exempt">
    <SubTabs
      actions={<ImportDialog variant="toolbar" />}
      items={[
        { value: "spend", label: "Spending", icon: <LayoutDashboard className="h-3.5 w-3.5" />, content: <SpendOverview /> },
        {
          value: "budgets",
          label: "Budgets",
          icon: <Wallet className="h-3.5 w-3.5" />,
          content: (
            <div>
              <PageHeader title="Budgets" description="Per-category monthly limits with burn-down and projected-overrun alerts" />
              <BudgetsView initial={getBudgetStatus()} />
            </div>
          ),
        },
      ]}
    />
    </div>
  );
}
