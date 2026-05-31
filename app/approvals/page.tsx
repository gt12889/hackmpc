import { redirect } from "next/navigation";

// Consolidated into the Workflow tab (Approvals sub-tab).
export default function ApprovalsPage() {
  redirect("/workflow?tab=approvals");
}
