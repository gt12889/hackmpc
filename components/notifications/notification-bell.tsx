"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type Notif = {
  id: number; severity: string; title: string; body: string | null;
  read: number; call_status: string | null; called_at: string | null; created_at: string;
};

const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-slate-400",
};

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore transient errors */ }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function markAll() {
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: 1 })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      /* optimistic; the next poll reconciles if the request failed */
    }
  }

  async function markOne(n: Notif) {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    try {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
    } catch {
      /* optimistic; the next poll reconciles */
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[12px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Alerts</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No alerts yet.</div>}
            {items.map((n) => (
              <a
                key={n.id}
                href="/compliance"
                onClick={() => markOne(n)}
                className={cn("block border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-secondary/50", !n.read && "bg-primary/5")}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[n.severity] ?? "bg-slate-400")} />
                  <span className="truncate text-xs font-medium text-foreground">{n.title}</span>
                </div>
                {n.body && <p className="mt-0.5 pl-4 text-[13px] text-muted-foreground">{n.body}</p>}
                {n.call_status === "called" && (
                  <p className="mt-0.5 flex items-center gap-1 pl-4 text-[12px] text-emerald-600">
                    <Phone className="h-3 w-3" /> Called you{n.called_at ? ` at ${new Date(n.called_at).toLocaleTimeString()}` : ""}
                  </p>
                )}
                {n.call_status === "skipped" && <p className="mt-0.5 pl-4 text-[12px] text-muted-foreground">In-app only (call cap reached)</p>}
                {n.call_status === "failed" && <p className="mt-0.5 pl-4 text-[12px] text-red-500">Call failed</p>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
