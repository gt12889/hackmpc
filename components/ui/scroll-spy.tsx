"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ScrollSpyItem = {
  id: string;
  title: string;
  tag?: string;        // small uppercase label under the body
  body?: ReactNode;    // text revealed when the item is active
  panel: ReactNode;    // right-side content that crossfades in
};

/** sphinx-style feature accordion: a clickable left list (active item expands its body)
 *  paired with a sticky right card that crossfades to the active item's panel. */
export function ScrollSpyAccordion({ items, className }: { items: ScrollSpyItem[]; className?: string }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  return (
    <div className={cn("grid gap-6 lg:grid-cols-2", className)}>
      {/* Left: clickable accordion list */}
      <div className="divide-y divide-border/60">
        {items.map((it) => {
          const open = it.id === active;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setActive(it.id)}
              aria-expanded={open}
              className="block w-full py-4 text-left"
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-primary transition-opacity", open ? "opacity-100" : "opacity-0")} />
                <span className={cn("text-sm font-medium transition-colors", open ? "text-foreground" : "text-muted-foreground")}>
                  {it.title}
                </span>
              </div>
              {it.body && (
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out motion-reduce:transition-none",
                    open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden pl-[18px] text-sm text-muted-foreground">
                    {it.body}
                    {it.tag && (
                      <span className="mt-2 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {it.tag}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Right: sticky crossfading panel */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="relative min-h-[320px] overflow-hidden rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-md">
          {items.map((it) => (
            <div
              key={it.id}
              aria-hidden={it.id !== active}
              className={cn(
                "transition-opacity duration-500 ease-out motion-reduce:transition-none",
                it.id === active ? "opacity-100" : "pointer-events-none absolute inset-4 opacity-0"
              )}
            >
              {it.panel}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
