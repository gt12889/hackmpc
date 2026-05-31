"use client";

import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";

const EVENT = "brim:api-error";

/** Pop the global "API credits ran out" modal from anywhere on the client. */
export function notifyApiError() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// A minimal, theme-matched modal shown when an AI/API call fails. Message is fixed
// ("API credits ran out") per design. Dismiss via the button, backdrop, or Escape.
export function ApiErrorModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-neutral-950/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="animate-fade-up relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-2xl ring-1 ring-black/5">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">API credits ran out</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          The AI service has hit its usage limit. Please try again later.
        </p>
        <button
          onClick={() => setOpen(false)}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
