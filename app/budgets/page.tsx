import { redirect } from "next/navigation";

// Consolidated into the Overview tab (Budgets sub-tab).
export default function BudgetsPage() {
  redirect("/overview?tab=budgets");
}
