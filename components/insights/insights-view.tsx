"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
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
  ChevronDown,
  X,
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

type ReactNodeT = ReactNode;

/** A compact headline figure for a bento tile. */
function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("truncate text-2xl font-semibold tabular-nums md:text-[1.65rem]", tone ?? "text-neutral-900")}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", tone ?? "bg-secondary text-muted-foreground")}>{children}</span>;
}

type Tile = {
  id: string;
  title: string;
  tag: string;
  body: string;
  icon: typeof Sparkles;
  span: string;
  summary: ReactNodeT;
  panel: ReactNodeT;
};

/** A clickable bento summary tile; expands its full panel inline below the grid. */
function BentoTile({ tile, active, onClick }: { tile: Tile; active: boolean; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex h-full w-full flex-col rounded-2xl border bg-card/50 p-5 text-left ring-1 ring-white/[0.02] backdrop-blur-md transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg",
        active ? "border-primary ring-2 ring-primary/50" : "border-border/60"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tile.tag}</span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", active && "rotate-180")} />
      </div>
      <div className="mt-3 min-h-0 flex-1">{tile.summary}</div>
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-neutral-900">{tile.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tile.body}</p>
      </div>
    </button>
  );
}

/** The full panel for the active tile, revealed inline below the bento grid. */
function DetailPanel({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const Icon = tile.icon;
  return (
    <div className="animate-fade-up rounded-2xl border border-border/60 bg-card/50 p-6 ring-1 ring-white/[0.02] backdrop-blur-md">
      <div className="mb-5 flex items-center gap-2 border-b border-border/60 pb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">{tile.title}</h2>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{tile.tag}</span>
        <button onClick={onClose} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">
          <X className="h-3.5 w-3.5" /> Close
        </button>
      </div>
      {tile.panel}
    </div>
  );
}

export function InsightsView({ data }: { data: any }) {
  const [open, setOpen] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // When a tile is expanded, scroll the revealed panel into view so the data is visible.
  useEffect(() => {
    if (!open || !detailRef.current) return;
    const el = detailRef.current;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [open]);

  // Mini-visual data derived from the summaries.
  const fc0 = data.forecast?.categories?.[0];
  const fcData = fc0 ? [...fc0.history, { period: fc0.projectedMonth, spend: fc0.projected }] : [];
  const fxPie = [
    { key: "USD", value: data.fx?.summary?.usdValue ?? 0 },
    { key: "CAD", value: data.fx?.summary?.cadValue ?? 0 },
  ];
  const profCats = data.profiles?.categories ?? [];
  const profMax = Math.max(1, ...profCats.map((c: any) => c.vsBaseline ?? 0));

  const TILES: Tile[] = [
    {
      id: "feed", title: "AI Summary", tag: "DAILY DIGEST", icon: Sparkles, span: "md:col-span-4",
      body: "Most important highlights and key takeaways from your recently uploaded spend file.",
      summary: (
        <div className="space-y-1.5">
          <Stat value={String(data.feed?.length ?? 0)} label="key highlights" tone="text-primary" />
          {(data.feed ?? []).slice(0, 2).map((f: any, i: number) => (
            <p key={i} className="line-clamp-1 text-xs text-neutral-700"><span className="text-primary">•</span> {f.title}</p>
          ))}
        </div>
      ),
      panel: <FeedTab initial={data.feed} />,
    },
    {
      id: "forecast", title: "Forecast", tag: "PROJECTION", icon: TrendingUp, span: "md:col-span-2 md:row-span-2",
      body: "Category-level spend projections with budget overrun risk signals.",
      summary: (
        <div className="flex h-full flex-col">
          <div className="flex items-end gap-5">
            <Stat value={String(data.forecast?.summary?.atRisk ?? 0)} label="overrun risk" tone="text-primary" />
            <Stat value={formatCAD(data.forecast?.summary?.projectedOverrun ?? 0, { compact: true })} label="projected" tone="text-primary" />
          </div>
          {fc0 && (
            <div className="mt-3 flex-1">
              <div className="mb-1 text-[11px] text-muted-foreground">{fc0.category}</div>
              <TrendLine data={fcData} series={[{ key: "spend", label: fc0.category }]} height={130} />
            </div>
          )}
        </div>
      ),
      panel: <ForecastTab f={data.forecast} />,
    },
    {
      id: "anomaly", title: "Anomaly", tag: "FRAUD SIGNALS", icon: AlertTriangle, span: "md:col-span-2",
      body: "Duplicate charges, round-number transactions, and settlement payments flagged for review.",
      summary: (
        <div className="space-y-2">
          <div className="flex items-end gap-5">
            <Stat value={String(data.anomaly?.summary?.duplicateGroups ?? 0)} label="duplicate groups" tone="text-primary" />
            <Stat value={formatCAD(data.anomaly?.summary?.duplicateExposure ?? 0, { compact: true })} label="exposure" tone="text-primary" />
          </div>
          <Chip tone="bg-primary/10 text-primary">{data.anomaly?.summary?.roundNumberCount ?? 0} round-number charges</Chip>
        </div>
      ),
      panel: <AnomalyTab a={data.anomaly} />,
    },
    {
      id: "fraud", title: "Fraud Watch", tag: "RISK SCORING", icon: ShieldCheck, span: "md:col-span-2",
      body: "Transactions ranked by an explainable fraud-risk score.",
      summary: (
        <div className="space-y-2">
          <div className="flex items-end gap-5">
            <Stat value={String(data.fraud?.summary?.flagged ?? 0)} label="flagged" tone="text-primary" />
            <Stat value={String(data.fraud?.summary?.byTier?.high ?? 0)} label="high-risk" tone="text-primary" />
          </div>
          {data.fraud?.summary?.topReason && <Chip tone="bg-primary/10 text-primary">Top signal: {data.fraud.summary.topReason}</Chip>}
        </div>
      ),
      panel: <FraudTab f={data.fraud} />,
    },
    {
      id: "fx", title: "Cross-Border", tag: "CURRENCY", icon: Globe, span: "md:col-span-2 md:row-span-2",
      body: "USD vs CAD spend split, estimated FX cost, and cross-border trends by month.",
      summary: (
        <div className="flex h-full flex-col">
          <div className="flex items-end gap-5">
            <Stat value={`${data.fx?.summary?.usdShare ?? 0}%`} label="cross-border" tone="text-primary" />
            <Stat value={formatCAD(data.fx?.summary?.estFxCost ?? 0, { compact: true })} label="est. FX cost" tone="text-primary" />
          </div>
          <div className="mt-2 flex-1">
            <CategoryPie data={fxPie} height={150} />
          </div>
        </div>
      ),
      panel: <FxTab x={data.fx} />,
    },
    {
      id: "vendors", title: "Vendors", tag: "SAVINGS", icon: Store, span: "md:col-span-2",
      body: "Fragmented vendor spend across categories - consolidation opportunities and estimated annual savings.",
      summary: (
        <div className="space-y-1.5">
          <Stat value={formatCAD(data.vendors?.summary?.estimatedAnnualSavings ?? 0, { compact: true })} label="est. annual savings" tone="text-primary" />
          <p className="text-xs text-muted-foreground">{data.vendors?.summary?.fragmentedCategories ?? 0} fragmented categories · {data.vendors?.summary?.totalVendors ?? 0} vendors</p>
        </div>
      ),
      panel: <VendorTab v={data.vendors} />,
    },
    {
      id: "recurring", title: "Recurring", tag: "COMMITMENTS", icon: Repeat, span: "md:col-span-2",
      body: "Subscriptions and recurring charges on autopilot - your fixed monthly committed spend.",
      summary: (
        <div className="space-y-1.5">
          <Stat value={formatCAD(data.recurring?.summary?.monthlyCommitted ?? 0, { compact: true })} label="committed / month" tone="text-primary" />
          <p className="text-xs text-muted-foreground">{data.recurring?.summary?.count ?? 0} recurring · {formatCAD(data.recurring?.summary?.annualized ?? 0, { compact: true })}/yr</p>
        </div>
      ),
      panel: <RecurringTab r={data.recurring} />,
    },
    {
      id: "profiles", title: "Profiles", tag: "BASELINE", icon: BarChart3, span: "md:col-span-4",
      body: "Category spend profiles benchmarked against the company average transaction size with trend direction.",
      summary: (
        <div className="space-y-2">
          <Stat value={formatCAD(data.profiles?.summary?.baselineAvg ?? 0)} label="company avg txn" />
          <div className="space-y-1">
            {profCats.slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 shrink-0 truncate text-muted-foreground">{c.category}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.vsBaseline / profMax) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{c.vsBaseline}×</span>
              </div>
            ))}
          </div>
        </div>
      ),
      panel: <ProfilesTab p={data.profiles} />,
    },
  ];

  const openTile = TILES.find((t) => t.id === open) ?? null;

  return (
    <div className="space-y-6 p-8">
      <SectionBadge>Insights</SectionBadge>

      {/* Animated bento mosaic of all insight components. Click a tile to expand its full panel. */}
      <div className="grid grid-cols-1 gap-4 md:auto-rows-[minmax(210px,auto)] md:grid-cols-6">
        {TILES.map((tile, i) => (
          <Reveal key={tile.id} delay={i * 60} className={cn("min-w-0", tile.span)}>
            <BentoTile tile={tile} active={open === tile.id} onClick={() => setOpen(open === tile.id ? null : tile.id)} />
          </Reveal>
        ))}
      </div>

      {openTile && (
        <div ref={detailRef} className="scroll-mt-28">
          <DetailPanel key={openTile.id} tile={openTile} onClose={() => setOpen(null)} />
        </div>
      )}
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
    { label: "Duplicate groups", value: String(a.summary.duplicateGroups), tone: "text-primary" },
    { label: "Duplicate exposure", value: formatCAD(a.summary.duplicateExposure, { compact: true }), tone: "text-primary" },
    { label: "Round-number charges", value: String(a.summary.roundNumberCount), tone: "text-primary" },
    { label: "Settlements (not spend)", value: formatCAD(a.summary.settlements.total, { compact: true }), tone: "text-neutral-600" },
  ] as const;

  return (
    <div className="space-y-6">
      <MetricsBar
        metrics={metrics}
        footer={
          <p className="border-t border-border/60 px-4 py-2.5 text-sm text-neutral-600">
            <span className="font-medium text-primary">Context:</span>{" "}
            The single largest line in the data is a {formatCAD(a.summary.settlements.largest)} card-balance payment - correctly classified as a settlement, not operational spend or fraud. {a.summary.settlements.count} such payments total {formatCAD(a.summary.settlements.total)}.
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
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[12px] font-medium text-primary">{d.occurrences}×</span>
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
          <p className="mt-0.5 text-xs text-neutral-600">Exact $100 multiples ≥ $500 - unusual for fuel/permits</p>
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
const VERDICT_STYLE: Record<string, { cls: string; label: string }> = {
  likely_fraud: { cls: "bg-primary/15 text-primary", label: "Likely fraud" },
  suspicious: { cls: "bg-primary/10 text-primary", label: "Suspicious" },
  benign: { cls: "bg-primary/15 text-primary", label: "Benign" },
  unreviewed: { cls: "bg-secondary text-muted-foreground", label: "Unreviewed" },
};

function FraudTab({ f }: { f: any }) {
  const { summary, suspects } = f;
  const [cases, setCases] = useState<Record<number, any>>({});
  const [busy, setBusy] = useState(false);

  // Load any existing case files so verdicts persist across visits.
  useEffect(() => {
    fetch("/api/fraud/investigate")
      .then((r) => r.json())
      .then((d) => setCases(Object.fromEntries((d.cases ?? []).map((c: any) => [c.transaction_id, c]))))
      .catch(() => {});
  }, []);

  async function investigate() {
    if (busy) return;
    setBusy(true);
    try {
      const d = await fetch("/api/fraud/investigate", { method: "POST" }).then((r) => r.json());
      setCases(Object.fromEntries((d.cases ?? []).map((c: any) => [c.transaction_id, c])));
      if (d.mode === "degraded") toast("Agent sidecar offline - showing deterministic signals only");
      else toast.success(`Investigated ${d.investigated} suspect${d.investigated === 1 ? "" : "s"}`);
    } catch {
      toast.error("Investigation failed");
    } finally {
      setBusy(false);
    }
  }

  const metrics = [
    { label: "Flagged", value: String(summary.flagged), tone: "text-primary" },
    { label: "Exposure", value: formatCAD(summary.exposure, { compact: true }), tone: "text-primary" },
    { label: "High-risk", value: String(summary.byTier.high), tone: "text-primary" },
    { label: "Top signal", value: summary.topReason ?? "-", tone: "text-neutral-600" },
  ] as const;

  function tierBadgeClass(score: number) {
    if (score >= 60) return "bg-primary/15 text-primary";
    if (score >= 40) return "bg-primary/10 text-primary";
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
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm text-neutral-900">Ranked Suspects</h3>
              <p className="mt-0.5 text-xs text-neutral-600">Scored by independent signals - duplicate charges, outlier amounts, round numbers, pre-auth patterns, and same-day repeats.</p>
            </div>
            <button
              onClick={investigate}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <Sparkles className={cn("h-3.5 w-3.5 text-primary", busy && "animate-pulse")} />
              {busy ? "Investigating…" : "Investigate suspects"}
            </button>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {suspects.map((s: any) => {
              const c = cases[s.id];
              const vstyle = c ? VERDICT_STYLE[c.verdict] ?? VERDICT_STYLE.unreviewed : null;
              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
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
                        {vstyle && (
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", vstyle.cls)}>
                            {vstyle.label}
                            {c.confidence != null && ` · ${Math.round(c.confidence * 100)}%`}
                          </span>
                        )}
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

                  {/* Investigator case file */}
                  {c && c.verdict !== "unreviewed" && (c.narrative || c.recommended_action) && (
                    <div className="mt-2 rounded-lg border border-border/60 bg-secondary/30 p-2.5 sm:ml-[3.25rem]">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                        <Sparkles className="h-3 w-3" /> Investigator
                      </div>
                      {c.narrative && <p className="mt-1 text-[13px] leading-relaxed text-neutral-700">{c.narrative}</p>}
                      {c.recommended_action && (
                        <p className="mt-1 text-[13px] text-neutral-900">
                          <span className="font-medium">Action:</span> {c.recommended_action}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
          { label: "Fragmented categories", value: String(v.summary.fragmentedCategories), tone: "text-primary" },
          { label: "Est. annual savings", value: formatCAD(v.summary.estimatedAnnualSavings, { compact: true }), tone: "text-primary" },
        ]}
      />

      <div className="space-y-4">
        {v.opportunities.slice(0, 6).map((o: any, i: number) => (
          <Reveal key={i} delay={i * 70}>
          <SectionCard
            title={`${o.category} - ${o.vendors} vendors`}
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
  const trendTone = { rising: "text-primary", falling: "text-primary", flat: "text-muted-foreground" };
  return (
    <div className="space-y-6">
      <MetricsBar
        metrics={[
          { label: "Categories modeled", value: String(f.summary.categories) },
          { label: "Overrun risk", value: String(f.summary.atRisk), tone: "text-primary" },
          { label: "Projected overrun", value: formatCAD(f.summary.projectedOverrun, { compact: true }), tone: "text-primary" },
          { label: "Rising trends", value: String(f.summary.risingCount), tone: "text-primary" },
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
                  <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 font-medium text-primary">
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
        <div className="text-sm text-muted-foreground">No summary yet - click Regenerate.</div>
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
          { label: "Committed / month", value: formatCAD(r.summary.monthlyCommitted, { compact: true }), tone: "text-primary" },
          { label: "Annualized", value: formatCAD(r.summary.annualized, { compact: true }), tone: "text-neutral-600" },
          { label: "Top category", value: r.summary.topCategory || "-", tone: "text-neutral-600" },
        ]}
      />
      <div>
        <h3 className="text-sm text-neutral-900">Detected Subscriptions & Recurring Spend</h3>
        <p className="mt-0.5 text-xs text-neutral-600">Consistent amounts on a regular cadence - committed spend you may not realize is on autopilot</p>
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
          { label: "Cross-border share", value: `${x.summary.usdShare}%`, tone: "text-primary" },
          { label: "USD spend", value: formatCAD(x.summary.usdValue, { compact: true }), tone: "text-primary" },
          { label: "Est. FX cost", value: formatCAD(x.summary.estFxCost, { compact: true }), tone: "text-primary" },
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
  const trendTone: any = { rising: "text-primary", falling: "text-primary", flat: "text-muted-foreground" };
  return (
    <div className="space-y-6">
      <MetricsBar
        metrics={[
          { label: "Categories", value: String(p.summary.categories) },
          { label: "Company avg txn", value: formatCAD(p.summary.baselineAvg), tone: "text-neutral-600" },
          { label: "Biggest riser", value: p.summary.biggestRiser || "-", tone: "text-primary" },
          { label: "Top share", value: p.summary.topShare || "-", tone: "text-primary" },
        ]}
      />
      <Reveal>
      <SectionCard title="Category Profiles vs Company Baseline" description="Average-transaction size relative to the company average (1.0×) - and month-over-month trend">
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
                <span
                  title="Monthly spend volatility (coefficient of variation)"
                  className={cn("w-20 shrink-0 text-right text-[11px] tabular-nums", (c.volatility ?? 0) >= 0.6 ? "text-primary" : "text-muted-foreground")}
                >
                  vol {(c.volatility ?? 0).toFixed(2)}
                </span>
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
