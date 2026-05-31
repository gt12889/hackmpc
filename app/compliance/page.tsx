import { redirect } from "next/navigation";

// Consolidated into the Governance tab (Violations sub-tab).
export default function CompliancePage() {
  redirect("/governance?tab=violations");
}
