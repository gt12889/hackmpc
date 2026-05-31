import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { KpiCount, type KpiFormat } from "@/components/kpi-count";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  countTo,
  format = "int",
  brackets = false,
}: {
  label: string;
  value?: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: "primary" | "warning" | "destructive" | "muted";
  countTo?: number;
  format?: KpiFormat;
  brackets?: boolean;
}) {
  const tone = {
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[accent || "primary"];

  return (
    <div className="relative group rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-card/70">
      {brackets && (
        <>
          {[
            "left-1.5 top-1.5",
            "right-1.5 top-1.5 rotate-90",
            "bottom-1.5 right-1.5 rotate-180",
            "bottom-1.5 left-1.5 -rotate-90",
          ].map((pos) => (
            <svg key={pos} width="11" height="12" viewBox="0 0 11 12" fill="none" className={cn("pointer-events-none absolute text-primary/60", pos)} aria-hidden>
              <path d="M11 1 L1 1 L1 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ))}
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-amber-700">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4 transition-transform duration-300 group-hover:scale-110", tone)} />}
      </div>
      {countTo != null ? (
        <KpiCount countTo={countTo} format={format} className="mt-2 text-2xl tabular-nums text-neutral-900 display-serif" />
      ) : (
        <div className="mt-2 text-2xl tabular-nums text-neutral-900 display-serif">{value ?? ""}</div>
      )}
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
    <div className={cn("rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg", className)}>
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
