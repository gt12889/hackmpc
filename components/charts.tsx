"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 font-medium text-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-medium text-foreground tabular-nums">
            {money ? formatCAD(Number(p.value)) : Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export type SeriesPoint = { key: string; value: number; count?: number };

export function SpendBar({ data, money = true, horizontal = false, height }: { data: SeriesPoint[]; money?: boolean; horizontal?: boolean; height?: number }) {
  const chartHeight = height ?? Math.max(220, horizontal ? data.length * 34 : 260);
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, bottom: 8, left: horizontal ? 8 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)} />
            <YAxis type="category" dataKey="key" tick={AXIS} tickLine={false} axisLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 30} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)} width={56} />
          </>
        )}
        <Tooltip content={<MoneyTooltip money={money} />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }} />
        <Bar dataKey="value" name={money ? "Spend" : "Count"} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, series, money = true, height = 280 }: { data: any[]; series: { key: string; label?: string }[]; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? formatCAD(v, { compact: true }) : v)} width={56} />
        <Tooltip content={<MoneyTooltip money={money} />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryPie({ data, money = true, height = 280 }: { data: SeriesPoint[]; money?: boolean; height?: number }) {
  const scale = height / 280;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="key" cx="50%" cy="50%" innerRadius={60 * scale} outerRadius={100 * scale} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--background))" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip content={<MoneyTooltip money={money} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
