import { redirect } from "next/navigation";

// Consolidated into the Governance tab (Receipts sub-tab).
export default function ReceiptsPage() {
  redirect("/governance?tab=receipts");
}
