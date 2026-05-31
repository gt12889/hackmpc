import { PageHeader } from "@/components/page-header";
import { InsightsView } from "@/components/insights/insights-view";
import { duplicateCharges, roundNumberCharges, largestCharges, anomalySummary } from "@/lib/anomaly";
import { consolidationOpportunities, vendorSummary } from "@/lib/vendors";
import { categoryForecasts, forecastSummary } from "@/lib/forecast";
import { recurringCharges, recurringSummary } from "@/lib/recurring";
import { fxSummary, fxByMonth, fxByCategory, topUsdStates } from "@/lib/fx";
import { categoryProfiles, profilesSummary } from "@/lib/profiles";
import { getCachedFeed } from "@/lib/insights-agent";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const data = {
    feed: getCachedFeed(),
    anomaly: {
      summary: anomalySummary(),
      duplicates: duplicateCharges(12),
      roundNumbers: roundNumberCharges(12),
      largest: largestCharges(10),
    },
    vendors: { summary: vendorSummary(), opportunities: consolidationOpportunities(3) },
    forecast: { summary: forecastSummary(), categories: categoryForecasts(6) },
    recurring: { summary: recurringSummary(), charges: recurringCharges(20) },
    fx: { summary: fxSummary(), byMonth: fxByMonth(), byCategory: fxByCategory(8), byState: topUsdStates(8) },
    profiles: { summary: profilesSummary(), categories: categoryProfiles() },
  };
  return (
    <div>
      <PageHeader
        title="Insights"
        description="Anomaly detection, vendor consolidation savings, and burn-rate forecasting"
      />
      <InsightsView data={data} />
    </div>
  );
}
