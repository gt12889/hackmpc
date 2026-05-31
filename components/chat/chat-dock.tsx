"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Minimize2 } from "lucide-react";
import { ChatPanel } from "./chat-panel";
import { cn } from "@/lib/utils";

/**
 * Bottom-docked "Ask AI" prompt. Collapsed, it's a slim prompt bar pinned to the
 * bottom of the screen. Click it and the chat expands to cover the page (showing
 * the suggested queries via ChatPanel's empty state); a Minimize button reverts
 * it back to the bar. Replaces the old bottom-right floating chat.
 */
export function ChatDock() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  // Collapse whenever the route changes.
  useEffect(() => setExpanded(false), [pathname]);

  // Esc minimizes the expanded chat.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Keep the hero/home route clean.
  if (pathname === "/") return null;

  return (
    <>
      {/* Expanded: chat covers the page */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Backdrop — click to minimize */}
          <button
            type="button"
            aria-label="Minimize chat"
            onClick={() => setExpanded(false)}
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
          />
          {/* Panel */}
          <div className="relative z-10 mx-auto mt-[5.25rem] flex h-[calc(100dvh-6.75rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl shadow-foreground/10 ring-1 ring-border/40 animate-fade-up">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Ask AI</h2>
                <span className="hidden text-[13px] text-muted-foreground sm:inline">Talk to your spend data</span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Minimize chat"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minimize2 className="h-4 w-4" /> Minimize
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel />
            </div>
          </div>
        </div>
      )}

      {/* Collapsed: bottom prompt bar */}
      {!expanded && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              "pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-full border border-border bg-card/90 px-5 py-3 text-left",
              "shadow-lg shadow-foreground/5 ring-1 ring-border/40 backdrop-blur-xl transition-colors hover:border-primary/40 hover:bg-card"
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 truncate text-sm text-muted-foreground">Ask anything about your spend…</span>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Ask AI</span>
          </button>
        </div>
      )}
    </>
  );
}
