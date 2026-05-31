"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCAD } from "@/lib/utils";

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
];

const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function MoneyTooltip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-popover px-3 py-2.5 text-xs shadow-xl">
      {label != null && <div className="mb-1.5 font-medium text-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {money ? formatCAD(Number(p.value)) : Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export type SeriesPoint = { key: string; value: number; count?: number };

export function SpendBar({
  data,
  money = true,
  horizontal = false,
  height,
}: {
  data: SeriesPoint[];
  money?: boolean;
  horizontal?: boolean;
  height?: number;
}) {
  const chartHeight = height ?? Math.max(220, horizontal ? data.length * 34 : 260);
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 20, bottom: 8, left: horizontal ? 4 : 0 }}
        barCategoryGap={horizontal ? "18%" : "20%"}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)}
            />
            <YAxis type="category" dataKey="key" tick={AXIS} tickLine={false} axisLine={false} width={140} />
          </>
        ) : (
          <>
            <XAxis
              dataKey="key"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={data.length > 6 ? -25 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={data.length > 6 ? 50 : 30}
            />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)}
              width={56}
            />
          </>
        )}
        <Tooltip content={<MoneyTooltip money={money} />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.25 }} />
        <Bar dataKey="value" name={money ? "Spend" : "Count"} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={horizontal ? 22 : 48}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={horizontal ? 0.55 + (d.value / maxVal) * 0.45 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({
  data,
  series,
  money = true,
  height = 280,
}: {
  data: any[];
  series: { key: string; label?: string }[];
  money?: boolean;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 20, bottom: 8, left: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} dy={4} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)}
          width={60}
        />
        <Tooltip content={<MoneyTooltip money={money} />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2.5}
            fill={`url(#trend-${s.key})`}
            dot={{ r: 3.5, strokeWidth: 0, fill: CHART_COLORS[i % CHART_COLORS.length] }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--background))", fill: CHART_COLORS[i % CHART_COLORS.length] }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PieCenterLabel({ viewBox, total, money }: { viewBox?: { cx?: number; cy?: number }; total: number; money: boolean }) {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.6em" fontSize={11} fill="hsl(var(--muted-foreground))">
        Total
      </tspan>
      <tspan x={cx} dy="1.5em" fontSize={15} fontWeight={600} fill="hsl(var(--foreground))">
        {money ? formatCAD(total, { compact: true }) : total.toLocaleString()}
      </tspan>
    </text>
  );
}

export function CategoryPie({
  data,
  money = true,
  height = 280,
  showTotal = false,
}: {
  data: SeriesPoint[];
  money?: boolean;
  height?: number;
  showTotal?: boolean;
}) {
  const scale = height / 280;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          cx="50%"
          cy="50%"
          innerRadius={showTotal ? 72 * scale : 60 * scale}
          outerRadius={showTotal ? 108 * scale : 100 * scale}
          paddingAngle={3}
          stroke="hsl(var(--background))"
          strokeWidth={2}
          label={showTotal ? undefined : ({ name, percent }) => (percent > 0.06 ? name : "")}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
          {showTotal && (
            <Label
              content={({ viewBox }) => <PieCenterLabel viewBox={viewBox as { cx?: number; cy?: number }} total={total} money={money} />}
              position="center"
            />
          )}
        </Pie>
        <Tooltip content={<MoneyTooltip money={money} />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          iconType="circle"
          iconSize={8}
          layout="horizontal"
          verticalAlign="bottom"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
