"use client";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/use-count-up";
import { useInView } from "@/lib/use-in-view";

type KpiFormat = "cad" | "cadFull" | "pct" | "int";

function formatKpi(n: number, format: KpiFormat): string {
  switch (format) {
    case "cad":
      return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0, notation: "compact" }).format(n);
    case "cadFull":
      return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
    case "pct":
      return `${n.toFixed(1)}%`;
    case "int":
      return new Intl.NumberFormat("en-CA").format(Math.round(n));
  }
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  countTo,
  format = "int",
}: {
  label: string;
  value?: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: "primary" | "warning" | "destructive" | "muted";
  countTo?: number;
  format?: KpiFormat;
}) {
  const tone = {
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[accent || "primary"];

  const { ref, inView } = useInView<HTMLDivElement>();
  const animated = useCountUp(countTo ?? 0, { enabled: countTo != null && inView });
  const display = countTo != null ? formatKpi(animated, format) : value ?? "";

  return (
    <div ref={ref} className="group rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-card/70">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-amber-700">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4 transition-transform duration-300 group-hover:scale-110", tone)} />}
      </div>
      <div className="mt-2 text-2xl tabular-nums text-neutral-900 display-serif">{display}</div>
      {sub && <div className="mt-1 text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md", className)}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className={cn("text-sm text-neutral-900", "display-serif")}>{title}</h3>
          {description && <p className="mt-0.5 text-xs text-neutral-600">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
