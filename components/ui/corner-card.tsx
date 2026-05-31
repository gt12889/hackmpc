import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Bracket({ className }: { className?: string }) {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" className={cn("absolute text-primary/70", className)} aria-hidden>
      <path d="M11 1 L1 1 L1 12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Card with sphinx-style corner brackets. `dotted` adds a subtle dot grid; `accent` adds a top primary border. */
export function CornerCard({
  children,
  className,
  dotted = false,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  dotted?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border/60 bg-card/50 p-5 backdrop-blur-md",
        accent && "border-t-2 border-t-primary/50",
        dotted && "bg-[radial-gradient(circle,_hsl(var(--foreground)/0.06)_1px,_transparent_1px)] bg-[length:18px_18px]",
        className
      )}
    >
      <Bracket className="left-1.5 top-1.5" />
      <Bracket className="right-1.5 top-1.5 rotate-90" />
      <Bracket className="bottom-1.5 right-1.5 rotate-180" />
      <Bracket className="bottom-1.5 left-1.5 -rotate-90" />
      {children}
    </div>
  );
}
