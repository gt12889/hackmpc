import { redirect } from "next/navigation";

// Consolidated into the Overview tab.
export default function DashboardPage() {
  redirect("/overview");
}
