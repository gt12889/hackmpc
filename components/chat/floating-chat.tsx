"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessagesSquare, X } from "lucide-react";
import { ChatPanel } from "./chat-panel";
import { cn } from "@/lib/utils";

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[min(560px,calc(100dvh-8rem))] w-[min(420px,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl shadow-foreground/10 ring-1 ring-border/40 backdrop-blur-xl animate-fade-up">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-sm">Ask AI</h2>
              <p className="text-[13px] text-muted-foreground">Talk to your spend data</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel compact />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        className={cn(
          "flex items-center justify-center gap-2.5 rounded-full bg-primary text-primary-foreground ring-4 ring-primary/20 transition-all hover:scale-[1.03] hover:bg-primary/95 hover:shadow-2xl hover:shadow-primary/45 active:scale-[0.98]",
          open
            ? "h-16 w-16 shadow-xl shadow-primary/35"
            : "h-auto px-6 py-4 shadow-xl shadow-primary/40"
        )}
      >
        {open ? (
          <X className="h-7 w-7" />
        ) : (
          <>
            <MessagesSquare className="h-7 w-7 shrink-0" />
            <span className="pr-0.5 text-base font-semibold tracking-tight">Ask AI</span>
          </>
        )}
      </button>
    </div>
  );
}
