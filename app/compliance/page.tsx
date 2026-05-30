import { PageHeader } from "@/components/page-header";
import { ComplianceView } from "@/components/compliance/compliance-view";
import { getRules, getViolations, getViolationSummary, getRepeatOffenders } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export default function CompliancePage() {
  const initial = {
    rules: getRules(),
    violations: getViolations(),
    summary: getViolationSummary(),
    offenders: getRepeatOffenders(),
  };
  return (
    <div>
      <PageHeader
        title="Policy Compliance"
        description="Scan transactions against the digitized expense policy — AI ranks violations by real-world severity"
      />
      <ComplianceView initial={initial} />
    </div>
  );
}
