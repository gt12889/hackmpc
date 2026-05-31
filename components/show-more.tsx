"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Progressive disclosure: render the first `initial` items, reveal the rest
// behind a "View more" toggle. Keeps pages minimal by default.
export function ShowMore<T>({
  items,
  initial = 5,
  render,
  className,
  noun = "more",
}: {
  items: T[];
  initial?: number;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, initial);
  const hidden = items.length - initial;

  return (
    <>
      <div className={className}>{shown.map((it, i) => render(it, i))}</div>
      {hidden > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-foreground/[0.02] py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          {open ? "Show less" : `View ${hidden} more ${noun}`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </>
  );
}

/** Collapsible section — whole block hidden behind a toggle (for dashboard secondary panels). */
export function ExpandSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card/40 px-5 py-3 text-sm backdrop-blur-md transition-colors hover:border-primary/30"
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-4 animate-fade-up">{children}</div>}
    </div>
  );
}
