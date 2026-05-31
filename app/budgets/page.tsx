import { PageHeader } from "@/components/page-header";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { getBudgetStatus } from "@/lib/budgets";

export const dynamic = "force-dynamic";

export default function BudgetsPage() {
  return (
    <div>
      <PageHeader title="Budgets" description="Per-category monthly limits with burn-down and projected-overrun alerts" />
      <BudgetsView initial={getBudgetStatus()} />
    </div>
  );
}
