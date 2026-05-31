import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Frosted pill section label with a primary status dot (sphinx-style, Brim palette). */
export function SectionBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-foreground/[0.06] px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur-md",
        className
      )}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
      {children}
    </span>
  );
}
