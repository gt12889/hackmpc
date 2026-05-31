import { redirect } from "next/navigation";

// Consolidated into the Workflow tab (Reports sub-tab).
export default function ReportsPage() {
  redirect("/workflow?tab=reports");
}
