import { DollarSign, Receipt, Globe, CreditCard } from "lucide-react";
import { KpiCard, SectionCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { SpendBar, TrendLine, CategoryPie } from "@/components/charts";
import { ExpandSection } from "@/components/show-more";
import { ImportDialog } from "@/components/import-dialog";
import { formatCAD } from "@/lib/utils";
import { getKpis, aggregate, timeSeries, topMerchants } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const kpis = getKpis();
  const byCategory = aggregate("category", "sum", {}, 8).rows;
  const byState = aggregate("state_province", "sum", {}, 10).rows;
  const byCard = aggregate("transaction_code", "sum", {}, 9).rows;
  const months = timeSeries("month", {}).map((m) => ({ period: m.period, spend: m.series.spend }));
  const merchants = topMerchants({}, "spend", 12);

  const fmtMonth = (p: string) => {
    const [y, m] = p.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
  };
  const monthData = months.map((m) => ({ ...m, period: fmtMonth(m.period) }));

  return (
    <div>
      <PageHeader
        title="Spend Overview"
        description={`${kpis.dateStart} → ${kpis.dateEnd} · ${kpis.txnCount.toLocaleString()} card transactions`}
      >
        <ImportDialog />
      </PageHeader>

      <div className="space-y-6 p-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Operational Spend" value={formatCAD(kpis.operationalSpend, { compact: true })} sub={`Avg ${formatCAD(kpis.avgTxn)} / txn`} icon={DollarSign} />
          <KpiCard label="Transactions" value={kpis.txnCount.toLocaleString()} sub={`${kpis.cardCount} company cards`} icon={Receipt} />
          <KpiCard label="Cross-Border" value={`${kpis.crossBorderPct}%`} sub="of spend is US/foreign" icon={Globe} accent="warning" />
          <KpiCard label="Card Payments" value={formatCAD(kpis.settlementsSpend, { compact: true })} sub={`${kpis.settlementsCount} settlements (excl. from spend)`} icon={CreditCard} accent="muted" />
        </div>

        {/* Category + Trend */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <SectionCard title="Spend by Category" description="Operational spend, settlements excluded" className="lg:col-span-2">
            <CategoryPie data={byCategory} />
          </SectionCard>
          <SectionCard title="Monthly Spend Trend" description="Total operational spend per month" className="lg:col-span-3">
            <TrendLine data={monthData} series={[{ key: "spend", label: "Spend" }]} />
          </SectionCard>
        </div>

        {/* Secondary breakdowns — collapsed by default to keep the view minimal */}
        <ExpandSection label="More breakdowns — by state, card & merchant">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SectionCard title="Spend by State / Province" description="Top 10 regions by spend">
                <SpendBar data={byState} horizontal />
              </SectionCard>
              <SectionCard title="Spend by Card (Cost Center)" description="Primary company card carries most volume">
                <SpendBar data={byCard} horizontal />
              </SectionCard>
            </div>
            <SectionCard title="Top Merchants" description="Where the money goes">
              <SpendBar data={merchants.map((m) => ({ key: m.merchant, value: m.spend, count: m.count }))} horizontal />
            </SectionCard>
          </div>
        </ExpandSection>
      </div>
    </div>
  );
}
