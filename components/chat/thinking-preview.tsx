"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Loading "illusion" shown while Gemini is thinking: a staged, asymptotic progress
// bar (never quite reaches 100% until the real answer lands) plus skeleton-shimmer
// placeholders that preview the incoming text + chart.
function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted/70", className)} style={style}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  );
}

const STAGES = [
  [0, "Parsing your question"],
  [26, "Querying the ledger"],
  [50, "Aggregating spending"],
  [72, "Composing the answer"],
  [88, "Rendering chart"],
] as const;

const BARS = [40, 70, 55, 90, 48, 76, 62, 84];

export function ThinkingPreview() {
  // Ease toward ~95% and hold - the perception of progress without ever "finishing"
  // before the response actually arrives (the row unmounts when it does).
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const id = setInterval(
      () => setPct((p) => Math.min(95, p + Math.max(0.4, (96 - p) * 0.07))),
      110
    );
    return () => clearInterval(id);
  }, []);
  const stage = [...STAGES].reverse().find(([t]) => pct >= t)?.[1] ?? STAGES[0][1];

  return (
    <div className="mx-auto flex max-w-3xl gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
        <Sparkles className="h-4 w-4 animate-pulse text-primary" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {/* Stage label + progress-bar illusion + skeleton answer lines */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {stage}…
            </span>
            <span className="tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-primary to-[#00c1d5] transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Shimmer className="h-3 w-[92%]" />
            <Shimmer className="h-3 w-[78%]" />
            <Shimmer className="h-3 w-[58%]" />
          </div>
        </div>

        {/* Skeleton chart preview */}
        <div className="w-full rounded-xl border border-border bg-card p-4">
          <Shimmer className="mb-3 h-3 w-32" />
          <div className="flex h-28 items-end gap-2">
            {BARS.map((h, i) => (
              <Shimmer key={i} className="flex-1 rounded-b-none rounded-t-md" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
