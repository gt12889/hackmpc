"use client";

import { useState } from "react";
import {
  Copy,
  Hash,
  TrendingUp,
  Store,
  AlertTriangle,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { TrendLine, CHART_COLORS } from "@/components/charts";

const TABS = [
  { key: "anomaly", label: "Anomaly & Fraud", icon: AlertTriangle },
  { key: "vendors", label: "Vendor Consolidation", icon: Store },
  { key: "forecast", label: "Forecasting", icon: TrendingUp },
] as const;

export function InsightsView({ data }: { data: any }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("anomaly");

  return (
    <div className="space-y-6 p-8">
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "anomaly" && <AnomalyTab a={data.anomaly} />}
      {tab === "vendors" && <VendorTab v={data.vendors} />}
      {tab === "forecast" && <ForecastTab f={data.forecast} />}
    </div>
  );
}

function AnomalyTab({ a }: { a: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Duplicate Groups" value={String(a.summary.duplicateGroups)} icon={Copy} tone="warning" />
        <Stat label="Duplicate Exposure" value={formatCAD(a.summary.duplicateExposure, { compact: true })} icon={Banknote} tone="destructive" />
        <Stat label="Round-Number Charges" value={String(a.summary.roundNumberCount)} icon={Hash} tone="warning" />
        <Stat label="Settlements (not spend)" value={formatCAD(a.summary.settlements.total, { compact: true })} icon={Banknote} tone="muted" />
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
        <span className="font-medium text-warning">Context flag:</span>{" "}
        <span className="text-muted-foreground">
          The single largest line in the data is a {formatCAD(a.summary.settlements.largest)} card-balance payment — correctly classified as a settlement, not operational spend or fraud. {a.summary.settlements.count} such payments total {formatCAD(a.summary.settlements.total)}.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Duplicate / Recurring Charges" description="Same card + merchant + exact amount, 2+ times">
          <div className="space-y-2">
            {a.duplicates.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.merchant_name}</span>
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">{d.occurrences}×</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">card {d.transaction_code} · {d.dates}</div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatCAD(d.amount_cad)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Round-Number Charges" description="Exact $100 multiples ≥ $500 — unusual for fuel/permits">
          <div className="space-y-2">
            {a.roundNumbers.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div className="min-w-0">
                  <span className="truncate font-medium">{r.merchant_name}</span>
                  <div className="text-[11px] text-muted-foreground">{r.txn_date} · {r.category}</div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatCAD(r.amount_cad)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function VendorTab({ v }: { v: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Distinct Vendors" value={String(v.summary.totalVendors)} icon={Store} />
        <Stat label="Fragmented Categories" value={String(v.summary.fragmentedCategories)} icon={AlertTriangle} tone="warning" />
        <Stat label="Est. Annual Savings" value={formatCAD(v.summary.estimatedAnnualSavings, { compact: true })} icon={Banknote} tone="primary" />
      </div>

      <div className="space-y-4">
        {v.opportunities.slice(0, 6).map((o: any, i: number) => (
          <SectionCard
            key={i}
            title={`${o.category} — ${o.vendors} vendors`}
            description={`${formatCAD(o.spend)} across ${o.txns} transactions · top vendor only ${o.topVendorShare}% of spend`}
            action={
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Est. savings @ {Math.round(o.savingsRate * 100)}%</div>
                <div className="text-lg font-semibold text-primary tabular-nums">{formatCAD(o.estimatedSavings, { compact: true })}</div>
              </div>
            }
          >
            <div className="space-y-1.5">
              {o.topVendors.map((tv: any, j: number) => (
                <div key={j} className="flex items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate text-muted-foreground">{tv.vendor}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${(tv.spend / o.topVendors[0].spend) * 100}%`, background: CHART_COLORS[j % CHART_COLORS.length] }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">{formatCAD(tv.spend, { compact: true })}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

function ForecastTab({ f }: { f: any }) {
  const trendIcon = { rising: ArrowUpRight, falling: ArrowDownRight, flat: Minus };
  const trendTone = { rising: "text-warning", falling: "text-primary", flat: "text-muted-foreground" };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Categories Modeled" value={String(f.summary.categories)} icon={TrendingUp} />
        <Stat label="Overrun Risk" value={String(f.summary.atRisk)} icon={AlertTriangle} tone="destructive" />
        <Stat label="Projected Overrun" value={formatCAD(f.summary.projectedOverrun, { compact: true })} icon={Banknote} tone="warning" />
        <Stat label="Rising Trends" value={String(f.summary.risingCount)} icon={ArrowUpRight} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {f.categories.map((c: any, i: number) => {
          const TI = (trendIcon as any)[c.trend];
          const projData = [...c.history, { period: c.projectedMonth, spend: c.projected, projected: true }];
          return (
            <SectionCard
              key={i}
              title={c.category}
              description={`Avg ${formatCAD(c.avgMonthly, { compact: true })}/mo · budget ${formatCAD(c.budget, { compact: true })}`}
              action={
                <span className={cn("inline-flex items-center gap-1 text-xs font-medium", (trendTone as any)[c.trend])}>
                  <TI className="h-3.5 w-3.5" /> {c.trend}
                </span>
              }
            >
              <TrendLine data={projData} series={[{ key: "spend", label: "Monthly" }]} />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Projected {c.projectedMonth}: <span className="font-semibold text-foreground">{formatCAD(c.projected)}</span></span>
                {c.overrunRisk ? (
                  <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Overrun +{formatCAD(c.overrunBy, { compact: true })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">within budget</span>
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: any) {
  const t = { destructive: "text-destructive", warning: "text-warning", primary: "text-primary", muted: "text-muted-foreground" }[tone as string] || "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", t)} />}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", t)}>{value}</div>
    </div>
  );
}
