import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: "primary" | "warning" | "destructive" | "muted";
}) {
  const tone = {
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[accent || "primary"];

  return (
    <div className="group rounded-2xl border border-border/60 bg-card/50 p-5 ring-1 ring-inset ring-white/[0.02] backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-card/70">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4 transition-transform duration-300 group-hover:scale-110", tone)} />}
      </div>
      <div className="mt-2 text-2xl tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
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
          <h3 className="text-sm">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
