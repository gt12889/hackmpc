"use client";

import { useCountUp } from "@/lib/use-count-up";
import { useInView } from "@/lib/use-in-view";

export type KpiFormat = "cad" | "cadFull" | "pct" | "int";

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

/** Client leaf: counts up to `countTo` when scrolled into view. Kept separate so
 *  KpiCard can stay a server component (and still receive icon-function props). */
export function KpiCount({ countTo, format = "int", className }: { countTo: number; format?: KpiFormat; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const animated = useCountUp(countTo, { enabled: inView });
  return <div ref={ref} className={className}>{formatKpi(animated, format)}</div>;
}
