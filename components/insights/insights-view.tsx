"use client";

import { useState, type ReactNode } from "react";
import {
  TrendingUp,
  Store,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Repeat,
  Globe,
  BarChart3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn, formatCAD } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";
import { Reveal } from "@/components/reveal";
import { TrendLine, CategoryPie, CHART_COLORS } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollSpyAccordion, type ScrollSpyItem } from "@/components/ui/scroll-spy";
import { SectionBadge } from "@/components/ui/section-badge";

export function InsightsView({ data }: { data: any }) {
  const items: ScrollSpyItem[] = [
    {
      id: "feed",
      title: "AI Summary",
      tag: "DAILY DIGEST",
      body: "Most important highlights and key takeaways from your recently uploaded spend file.",
      panel: <FeedTab initial={data.feed} />,
    },
    {
      id: "anomaly",
      title: "Anomaly",
      tag: "FRAUD SIGNALS",
      body: "Duplicate charges, round-number transactions, and settlement payments flagged for review.",
      panel: <AnomalyTab a={data.anomaly} />,
    },
    {
      id: "fraud",
      title: "Fraud Watch",
      tag: "RISK SCORING",
      body: "Transactions ranked by an explainable fraud-risk score.",
      panel: <FraudTab f={data.fraud} />,
    },
    {
      id: "vendors",
      title: "Vendors",
      tag: "SAVINGS",
      body: "Fragmented vendor spend across categories — consolidation opportunities and estimated annual savings.",
      panel: <VendorTab v={data.vendors} />,
    },
    {
      id: "forecast",
      title: "Forecast",
      tag: "PROJECTION",
      body: "Category-level spend projections for the next period with budget overrun risk signals.",
      panel: <ForecastTab f={data.forecast} />,
    },
    {
      id: "recurring",
      title: "Recurring",
      tag: "COMMITMENTS",
      body: "Subscriptions and recurring charges on autopilot — your fixed monthly committed spend.",
      panel: <RecurringTab r={data.recurring} />,
    },
    {
      id: "fx",
      title: "Cross-Border",
      tag: "CURRENCY",
      body: "USD vs CAD spend split, estimated FX cost, and cross-border trends by month.",
      panel: <FxTab x={data.fx} />,
    },
    {
      id: "profiles",
      title: "Profiles",
      tag: "BASELINE",
      body: "Category spend profiles benchmarked against the company average transaction size with trend direction.",
      panel: <ProfilesTab p={data.profiles} />,
    },
  ];

  return (
    <div className="space-y-6 p-8">
      <SectionBadge>Insights</SectionBadge>
      <ScrollSpyAccordion items={items} />
    </div>
  );
}

function MetricsBar({
  metrics,
  cols = 4,
  footer,
}: {
  metrics: readonly { label: string; value: string; tone?: string }[];
  cols?: 3 | 4;
  footer?: ReactNode;
}) {
  const gridClass =
    cols === 3
      ? "grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      : "grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0";

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <dl className={cn("grid divide-border/60", gridClass)}>
        {metrics.map((m) => (
          <div key={m.label} className="px-4 py-3">
            <dt className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">{m.label}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", m.tone ?? "text-neutral-900")}>{m.value}</dd>
          </div>
        ))}
      </dl>
      {footer}
    </div>
  );
}

function AnomalyTab({ a }: { a: any }) {
  const metrics = [
    { label: "Duplicate groups", value: String(a.summary.duplicateGroups), tone: "text-warning" },
    { label: "Duplicate exposure", value: formatCAD(a.summary.duplicateExposure, { compact: true }), tone: "text-destructive" },
    { label: "Round-number charges", value: String(a.summary.roundNumberCount), tone: "text-warning" },
    { label: "Settlements (not spend)", value: formatCAD(a.summary.settlements.total, { compact: true }), tone: "text-neutral-600" },
  ] as const;

  return (
    <div className="space-y-6">
      <MetricsBar
        metrics={metrics}
        footer={
          <p className="border-t border-border/60 px-4 py-2.5 text-sm text-neutral-600">
            <span className="font-medium text-warning">Context:</span>{" "}
            The single largest line in the data is a {formatCAD(a.summary.settlements.largest)} card-balance payment — correctly classified as a settlement, not operational spend or fraud. {a.summary.settlements.count} such payments total {formatCAD(a.summary.settlements.total)}.
          </p>
        }
      />

      <div className="space-y-8">
        <div>
          <h3 className="text-sm text-neutral-900">Duplicate Charges</h3>
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
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[12px] font-medium text-warning">{d.occurrences}×</span>
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

/* ---------- Fraud Watch ---------- */
function FraudTab({ f }: { f: any }) {
  const { summary, suspects } = f;

  const metrics = [
    { label: "Flagged", value: String(summary.flagged), tone: "text-destructive" },
    { label: "Exposure", value: formatCAD(summary.exposure, { compact: true }), tone: "text-warning" },
    { label: "High-risk", value: String(summary.byTier.high), tone: "text-destructive" },
    { label: "Top signal", value: summary.topReason ?? "—", tone: "text-neutral-600" },
  ] as const;

  function tierBadgeClass(score: number) {
    if (score >= 60) return "bg-destructive/15 text-destructive";
    if (score >= 40) return "bg-warning/15 text-warning";
    return "bg-secondary text-muted-foreground";
  }

  return (
    <div className="space-y-6">
      <MetricsBar metrics={metrics} />

      {suspects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-neutral-900">No high-risk transactions detected</p>
          <p className="text-xs text-muted-foreground">All transactions passed the fraud-risk threshold.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm text-neutral-900">Ranked Suspects</h3>
            <p className="mt-0.5 text-xs text-neutral-600">Scored by independent signals — duplicate charges, outlier amounts, round numbers, pre-auth patterns, and same-day repeats.</p>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {suspects.map((s: any, i: number) => (
              <div key={s.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
                {/* Score badge */}
                <span className={`inline-flex h-8 w-10 shrink-0 items-center justify-center rounded text-sm font-semibold tabular-nums ${tierBadgeClass(s.score)}`}>
                  {s.score}
                </span>

                {/* Main info */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="max-w-[220px] truncate font-medium text-neutral-900">{s.merchant_name}</span>
                    <span className="text-xs text-muted-foreground">{s.category}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{s.txn_date}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{s.transaction_code}</span>
                  </div>
                  {/* Reason chips */}
                  <div className="flex flex-wrap gap-1">
                    {s.reasons.map((reason: string, j: number) => (
                      <span key={j} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <span className="shrink-0 self-start text-sm font-semibold tabular-nums text-neutral-900 sm:self-center">
                  {formatCAD(s.amount_cad)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VendorTab({ v }: { v: any }) {
  return (
    <div className="space-y-6">
      <MetricsBar
        cols={3}
        metrics={[
          { label: "Distinct vendors", value: String(v.summary.totalVendors) },
          { label: "Fragmented categories", value: String(v.summary.fragmentedCategories), tone: "text-warning" },
          { label: "Est. annual savings", value: formatCAD(v.summary.estimatedAnnualSavings, { compact: true }), tone: "text-primary" },
        ]}
      />

      <div className="space-y-4">
        {v.opportunities.slice(0, 6).map((o: any, i: number) => (
          <Reveal key={i} delay={i * 70}>
          <SectionCard
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
          </Reveal>
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
      <MetricsBar
        metrics={[
          { label: "Categories modeled", value: String(f.summary.categories) },
          { label: "Overrun risk", value: String(f.summary.atRisk), tone: "text-destructive" },
          { label: "Projected overrun", value: formatCAD(f.summary.projectedOverrun, { compact: true }), tone: "text-warning" },
          { label: "Rising trends", value: String(f.summary.risingCount), tone: "text-warning" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {f.categories.map((c: any, i: number) => {
          const TI = (trendIcon as any)[c.trend];
          const projData = [...c.history, { period: c.projectedMonth, spend: c.projected, projected: true }];
          return (
            <Reveal key={i} delay={i * 70}>
            <SectionCard
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
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- AI Summary ---------- */
function FeedTab({ initial }: { initial: any[] }) {
  const [feed, setFeed] = useState<any[]>(initial || []);
  const [busy, setBusy] = useState(false);
  async function regen() {
    setBusy(true);
    try {
      const r = await fetch("/api/insights/feed", { method: "POST" }).then((x) => x.json());
      if (Array.isArray(r.feed)) setFeed(r.feed);
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="relative flex min-h-7 items-center justify-center">
        <p className="text-center text-sm text-muted-foreground">Most important highlights based on recently uploaded file.</p>
        <button onClick={regen} disabled={busy} className="absolute right-0 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regenerate
        </button>
      </div>
      {feed.length === 0 ? (
        <div className="text-sm text-muted-foreground">No summary yet — click Regenerate.</div>
      ) : (
        <ol className="list-decimal space-y-4 pl-5">
          {feed.map((i, idx) => (
            <li key={idx} className="text-sm text-neutral-900 marker:font-medium marker:text-neutral-500">
              {i.link ? (
                <a href={i.link} className="font-semibold hover:text-primary">
                  {i.title}
                </a>
              ) : (
                <span className="font-semibold">{i.title}</span>
              )}
              <p className="mt-1 text-muted-foreground">{i.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- Recurring / Subscriptions ---------- */
function RecurringTab({ r }: { r: any }) {
  return (
    <div className="space-y-6">
      <MetricsBar
        metrics={[
          { label: "Recurring charges", value: String(r.summary.count), tone: "text-primary" },
          { label: "Committed / month", value: formatCAD(r.summary.monthlyCommitted, { compact: true }), tone: "text-warning" },
          { label: "Annualized", value: formatCAD(r.summary.annualized, { compact: true }), tone: "text-neutral-600" },
          { label: "Top category", value: r.summary.topCategory || "—", tone: "text-neutral-600" },
        ]}
      />
      <div>
        <h3 className="text-sm text-neutral-900">Detected Subscriptions & Recurring Spend</h3>
        <p className="mt-0.5 text-xs text-neutral-600">Consistent amounts on a regular cadence — committed spend you may not realize is on autopilot</p>
        <div className="mt-3 rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead className="text-right">Occurrences</TableHead>
                <TableHead className="text-right">Avg Amount</TableHead>
                <TableHead className="text-right">Committed / Mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.charges.map((c: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="max-w-[200px] truncate font-medium text-neutral-900">{c.merchant}</TableCell>
                  <TableCell className="text-neutral-600">{c.category}</TableCell>
                  <TableCell>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[12px] uppercase text-muted-foreground">{c.cadence}</span>
                  </TableCell>
                  <TableCell className="text-right text-neutral-600">{c.occurrences}×</TableCell>
                  <TableCell className="text-right tabular-nums text-neutral-600">{formatCAD(c.avg_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-neutral-900">{formatCAD(c.monthlyCommitted)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Cross-Border FX ---------- */
function FxTab({ x }: { x: any }) {
  const fmtMonth = (p: string) => { const [y, m] = p.split("-"); return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-CA", { month: "short", year: "2-digit" }); };
  const monthData = x.byMonth.map((m: any) => ({ period: fmtMonth(m.period), USD: m.usd, CAD: m.cad }));
  const pie = [{ key: "USD (cross-border)", value: x.summary.usdValue }, { key: "CAD (domestic)", value: x.summary.cadValue }];
  return (
    <div className="space-y-4">
      <MetricsBar
        metrics={[
          { label: "Cross-border share", value: `${x.summary.usdShare}%`, tone: "text-warning" },
          { label: "USD spend", value: formatCAD(x.summary.usdValue, { compact: true }), tone: "text-primary" },
          { label: "Est. FX cost", value: formatCAD(x.summary.estFxCost, { compact: true }), tone: "text-destructive" },
          { label: "Avg FX rate", value: String(x.summary.avgRate), tone: "text-neutral-600" },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <h3 className="text-sm text-neutral-900">USD vs CAD Spend</h3>
          <p className="mt-0.5 text-xs text-neutral-600">{x.summary.usdShare}% of spend crosses the border</p>
          <div className="mt-2 rounded-lg border border-border/60 p-2">
            <CategoryPie data={pie} height={180} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <h3 className="text-sm text-neutral-900">Cross-Border Spend by Month</h3>
          <p className="mt-0.5 text-xs text-neutral-600">USD vs CAD origin</p>
          <div className="mt-2 rounded-lg border border-border/60 p-2">
            <TrendLine data={monthData} series={[{ key: "USD", label: "USD" }, { key: "CAD", label: "CAD" }]} height={180} />
          </div>
        </div>
      </div>
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
      <MetricsBar
        metrics={[
          { label: "Categories", value: String(p.summary.categories) },
          { label: "Company avg txn", value: formatCAD(p.summary.baselineAvg), tone: "text-neutral-600" },
          { label: "Biggest riser", value: p.summary.biggestRiser || "—", tone: "text-warning" },
          { label: "Top share", value: p.summary.topShare || "—", tone: "text-primary" },
        ]}
      />
      <Reveal>
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
      </Reveal>
    </div>
  );
}
