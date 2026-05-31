"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlertSettings() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/settings/alerts");
      const d = await res.json();
      setEnabled(d.enabled);
      setConfigured(d.configured);
    } catch {
      /* leave defaults; controls stay disabled until a successful load */
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const d = await res.json();
      if (res.ok) setEnabled(d.enabled);
      else setMsg("Couldn't update the setting.");
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function testCall() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notifications/test-call", { method: "POST" });
      const d = await res.json();
      setMsg(res.ok ? "Test call placed — your phone should ring." : `Test call failed: ${d.error ?? "unknown"}`);
    } catch {
      setMsg("Test call failed: could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        {enabled ? <Phone className="h-4 w-4 text-emerald-600" /> : <PhoneOff className="h-4 w-4 text-muted-foreground" />}
        Phone alerts
      </span>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={busy || !configured}
        className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-emerald-500" : "bg-secondary", (busy || !configured) && "opacity-50")}
        aria-label="Toggle phone alerts"
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", enabled ? "left-[1.125rem]" : "left-0.5")} />
      </button>
      <button
        onClick={testCall}
        disabled={busy || !configured}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />} Test call
      </button>
      {!configured && <span className="text-xs text-amber-600">Set ElevenLabs vars in .env.local to enable.</span>}
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
