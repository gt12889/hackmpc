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
  Sparkles,
  Repeat,
  Globe,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { TrendLine, SpendBar, CategoryPie, CHART_COLORS } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TABS = [
  { key: "feed", label: "AI Insights", icon: Sparkles },
  { key: "anomaly", label: "Anomaly", icon: AlertTriangle },
  { key: "vendors", label: "Vendors", icon: Store },
  { key: "forecast", label: "Forecast", icon: TrendingUp },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "fx", label: "Cross-Border", icon: Globe },
  { key: "profiles", label: "Profiles", icon: BarChart3 },
] as const;

export function InsightsView({ data }: { data: any }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("feed");

  return (
    <div className="space-y-6 p-8">
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "feed" && <FeedTab initial={data.feed} />}
      {tab === "anomaly" && <AnomalyTab a={data.anomaly} />}
      {tab === "vendors" && <VendorTab v={data.vendors} />}
      {tab === "forecast" && <ForecastTab f={data.forecast} />}
      {tab === "recurring" && <RecurringTab r={data.recurring} />}
      {tab === "fx" && <FxTab x={data.fx} />}
      {tab === "profiles" && <ProfilesTab p={data.profiles} />}
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

      <p className="text-sm text-neutral-600">
        <span className="font-medium text-warning">Context flag:</span>{" "}
        The single largest line in the data is a {formatCAD(a.summary.settlements.largest)} card-balance payment — correctly classified as a settlement, not operational spend or fraud. {a.summary.settlements.count} such payments total {formatCAD(a.summary.settlements.total)}.
      </p>

      <div className="space-y-8">
        <div>
          <h3 className="text-sm text-neutral-900">Duplicate / Recurring Charges</h3>
          <p className="mt-0.5 text-xs text-neutral-600">Same card + merchant + exact amount, 2+ times</p>
          <div className="mt-3 rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Occurrences</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.duplicates.map((d: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[200px] truncate font-medium text-neutral-900">{d.merchant_name}</TableCell>
                    <TableCell className="text-neutral-600">{d.transaction_code}</TableCell>
                    <TableCell className="text-neutral-600">{d.dates}</TableCell>
                    <TableCell className="text-right">
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">{d.occurrences}×</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-neutral-900">{formatCAD(d.amount_cad)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h3 className="text-sm text-neutral-900">Round-Number Charges</h3>
          <p className="mt-0.5 text-xs text-neutral-600">Exact $100 multiples ≥ $500 — unusual for fuel/permits</p>
          <div className="mt-3 rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.roundNumbers.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[240px] truncate font-medium text-neutral-900">{r.merchant_name}</TableCell>
                    <TableCell className="text-neutral-600">{r.txn_date}</TableCell>
                    <TableCell className="text-neutral-600">{r.category}</TableCell>
                    <TableCell className="text-right tabular-nums text-neutral-900">{formatCAD(r.amount_cad)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
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

/* ---------- AI Insights Feed ---------- */
function FeedTab({ initial }: { initial: any[] }) {
  const [feed, setFeed] = useState<any[]>(initial || []);
  const [busy, setBusy] = useState(false);
  const sevTone: Record<string, string> = {
    high: "border-destructive/30 bg-destructive/5",
    medium: "border-warning/30 bg-warning/5",
    low: "border-border bg-card",
  };
  async function regen() {
    setBusy(true);
    try {
      const r = await fetch("/api/insights/feed", { method: "POST" }).then((x) => x.json());
      if (Array.isArray(r.feed)) setFeed(r.feed);
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">AI-ranked findings across every analysis — what's worth your attention.</p>
        <button onClick={regen} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regenerate
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {feed.map((i, idx) => (
          <a key={idx} href={i.link || "#"} className={cn("block rounded-xl border p-4 transition-colors hover:border-primary/40", sevTone[i.severity] || sevTone.low)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 shrink-0 text-primary" /><span className="text-sm font-semibold">{i.title}</span></div>
              {i.metric && <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-[11px] font-medium">{i.metric}</span>}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{i.detail}</p>
          </a>
        ))}
        {feed.length === 0 && <div className="text-sm text-muted-foreground">No insights yet — click Regenerate.</div>}
      </div>
    </div>
  );
}

/* ---------- Recurring / Subscriptions ---------- */
function RecurringTab({ r }: { r: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Recurring Charges" value={String(r.summary.count)} icon={Repeat} tone="primary" />
        <Stat label="Committed / Month" value={formatCAD(r.summary.monthlyCommitted, { compact: true })} icon={Banknote} tone="warning" />
        <Stat label="Annualized" value={formatCAD(r.summary.annualized, { compact: true })} icon={Banknote} tone="muted" />
        <Stat label="Top Category" value={r.summary.topCategory || "—"} icon={Store} tone="muted" />
      </div>
      <SectionCard title="Detected Subscriptions & Recurring Spend" description="Consistent amounts on a regular cadence — committed spend you may not realize is on autopilot">
        <div className="space-y-1.5">
          {r.charges.map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                <span>{c.merchant}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{c.cadence}</span>
                <span className="text-xs text-muted-foreground">· {c.category} · {c.occurrences}×</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">avg {formatCAD(c.avg_amount)}</span>
                <span className="font-semibold tabular-nums">{formatCAD(c.monthlyCommitted)}/mo</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ---------- Cross-Border FX ---------- */
function FxTab({ x }: { x: any }) {
  const fmtMonth = (p: string) => { const [y, m] = p.split("-"); return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-CA", { month: "short", year: "2-digit" }); };
  const monthData = x.byMonth.map((m: any) => ({ period: fmtMonth(m.period), USD: m.usd, CAD: m.cad }));
  const pie = [{ key: "USD (cross-border)", value: x.summary.usdValue }, { key: "CAD (domestic)", value: x.summary.cadValue }];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cross-Border Share" value={`${x.summary.usdShare}%`} icon={Globe} tone="warning" />
        <Stat label="USD Spend" value={formatCAD(x.summary.usdValue, { compact: true })} icon={Banknote} tone="primary" />
        <Stat label="Est. FX Cost" value={formatCAD(x.summary.estFxCost, { compact: true })} icon={Banknote} tone="destructive" />
        <Stat label="Avg FX Rate" value={String(x.summary.avgRate)} icon={TrendingUp} tone="muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard title="USD vs CAD Spend" description="72% of spend crosses the border" className="lg:col-span-2">
          <CategoryPie data={pie} />
        </SectionCard>
        <SectionCard title="Cross-Border Spend by Month" description="USD vs CAD origin" className="lg:col-span-3">
          <TrendLine data={monthData} series={[{ key: "USD", label: "USD" }, { key: "CAD", label: "CAD" }]} />
        </SectionCard>
      </div>
      <SectionCard title="USD Exposure by State" description="Where the cross-border spend happens">
        <SpendBar data={x.byState} horizontal />
      </SectionCard>
    </div>
  );
}

/* ---------- Spend Profiles & Benchmarking ---------- */
function ProfilesTab({ p }: { p: any }) {
  const max = Math.max(...p.categories.map((c: any) => c.vsBaseline), 1);
  const trendIcon: any = { rising: ArrowUpRight, falling: ArrowDownRight, flat: Minus };
  const trendTone: any = { rising: "text-warning", falling: "text-primary", flat: "text-muted-foreground" };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Categories" value={String(p.summary.categories)} icon={BarChart3} />
        <Stat label="Company Avg Txn" value={formatCAD(p.summary.baselineAvg)} icon={Banknote} tone="muted" />
        <Stat label="Biggest Riser" value={p.summary.biggestRiser || "—"} icon={ArrowUpRight} tone="warning" />
        <Stat label="Top Share" value={p.summary.topShare || "—"} icon={Store} tone="primary" />
      </div>
      <SectionCard title="Category Profiles vs Company Baseline" description="Average-transaction size relative to the company average (1.0×) — and month-over-month trend">
        <div className="space-y-2.5">
          {p.categories.map((c: any, i: number) => {
            const TI = trendIcon[c.trend];
            return (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate text-muted-foreground">{c.category}</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${(c.vsBaseline / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums">{c.vsBaseline}×</span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{c.share}%</span>
                <span className={cn("flex w-16 shrink-0 items-center justify-end gap-0.5 text-xs", trendTone[c.trend])}><TI className="h-3.5 w-3.5" />{c.momPct}%</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
