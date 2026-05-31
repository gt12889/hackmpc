import { DollarSign, Receipt, Globe, CreditCard } from "lucide-react";
import { KpiCard, SectionCard } from "@/components/kpi-card";
import { Reveal } from "@/components/reveal";
import { PageHeader } from "@/components/page-header";
import { SpendBar, TrendLine, CategoryPie } from "@/components/charts";
import { ExpandSection } from "@/components/show-more";
import { ImportDialog } from "@/components/import-dialog";
import { SectionBadge } from "@/components/ui/section-badge";
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
      <div className="flex flex-col items-center gap-2 px-8 pt-8 pb-3">
        <ImportDialog variant="prominent" />
        <p className="text-xs text-neutral-500">Drop a card export (.csv or .xlsx) to refresh your spend data</p>
      </div>

      <PageHeader
        title="Spend Overview"
        description={`${kpis.dateStart} → ${kpis.dateEnd} · ${kpis.txnCount.toLocaleString()} card transactions`}
        blur
      />

      <div className="space-y-6 p-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Reveal delay={0}>
            <KpiCard label="Operational Spend" countTo={kpis.operationalSpend} format="cad" sub={`Avg ${formatCAD(kpis.avgTxn)} / txn`} icon={DollarSign} brackets />
          </Reveal>
          <Reveal delay={70}>
            <KpiCard label="Transactions" countTo={kpis.txnCount} format="int" sub={`${kpis.cardCount} company cards`} icon={Receipt} brackets />
          </Reveal>
          <Reveal delay={140}>
            <KpiCard label="Cross-Border" countTo={kpis.crossBorderPct} format="pct" sub="of spend is US/foreign" icon={Globe} accent="warning" brackets />
          </Reveal>
          <Reveal delay={210}>
            <KpiCard label="Card Payments" countTo={kpis.settlementsSpend} format="cad" sub={`${kpis.settlementsCount} settlements (excl. from spend)`} icon={CreditCard} accent="muted" brackets />
          </Reveal>
        </div>

        {/* Category + Trend */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Reveal delay={0} className="lg:col-span-2">
            <div className="flex h-full flex-col gap-2">
              <SectionBadge>Spend by Category</SectionBadge>
              <SectionCard title="Spend by Category" description="Operational spend, settlements excluded" className="h-full flex-1">
                <CategoryPie data={byCategory} height={320} showTotal />
              </SectionCard>
            </div>
          </Reveal>
          <Reveal delay={70} className="lg:col-span-3">
            <div className="flex h-full flex-col gap-2">
              <SectionBadge>Monthly Spend Trend</SectionBadge>
              <SectionCard title="Monthly Spend Trend" description="Total operational spend per month" className="h-full flex-1">
                <TrendLine data={monthData} series={[{ key: "spend", label: "Spend" }]} height={320} />
              </SectionCard>
            </div>
          </Reveal>
        </div>

        {/* Secondary breakdowns - collapsed by default to keep the view minimal */}
        <ExpandSection label="More breakdowns - by state, card & merchant">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <SectionBadge>Spend by State / Province</SectionBadge>
                <SectionCard title="Spend by State / Province" description="Top 10 regions by spend">
                  <SpendBar data={byState} horizontal height={Math.max(280, byState.length * 36)} />
                </SectionCard>
              </div>
              <div className="flex flex-col gap-2">
                <SectionBadge>Spend by Card</SectionBadge>
                <SectionCard title="Spend by Card (Cost Center)" description="Primary company card carries most volume">
                  <SpendBar data={byCard} horizontal height={Math.max(280, byCard.length * 36)} />
                </SectionCard>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <SectionBadge>Top Merchants</SectionBadge>
              <SectionCard title="Top Merchants" description="Where the money goes">
                <SpendBar
                  data={merchants.map((m) => ({ key: m.merchant, value: m.spend, count: m.count }))}
                  horizontal
                  height={Math.max(320, merchants.length * 36)}
                />
              </SectionCard>
            </div>
          </div>
        </ExpandSection>
      </div>
    </div>
  );
}
