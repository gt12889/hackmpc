import { redirect } from "next/navigation";

// Consolidated into the Governance tab (Audit sub-tab).
export default function AuditPage() {
  redirect("/governance?tab=audit");
}
