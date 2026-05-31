"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function AlertSettings() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/settings/alerts");
      const d = await res.json();
      setEnabled(!!d.enabled);
      setConfigured(!!d.configured);
    } catch {
      /* leave defaults; controls stay disabled until a successful load */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function onToggle(checked: boolean) {
    const prev = enabled;
    setEnabled(checked);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      const d = await res.json();
      if (res.ok) {
        setEnabled(!!d.enabled);
        setConfigured(!!d.configured);
        toast.success(d.enabled ? "Phone alerts turned on" : "Phone alerts turned off");
      } else {
        setEnabled(prev);
        toast.error("Couldn't update phone alert setting");
      }
    } catch {
      setEnabled(prev);
      toast.error("Couldn't reach the server");
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
      if (res.ok) {
        setMsg("Test call placed — your phone should ring shortly.");
        toast.success("Test call placed");
      } else {
        const err = d.error ?? "unknown error";
        setMsg(`Test call failed: ${err}`);
        toast.error(`Test call failed: ${err}`);
      }
    } catch {
      setMsg("Test call failed: could not reach the server.");
      toast.error("Test call failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 py-1 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          {enabled ? <Phone className="h-4 w-4 text-primary" /> : <PhoneOff className="h-4 w-4 text-muted-foreground" />}
          Phone alerts
        </span>

        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={busy}
            className="data-[state=checked]:bg-primary"
            aria-label="Toggle phone alerts"
          />
          <span className="text-sm text-neutral-600">{enabled ? "On" : "Off"}</span>
        </div>

        <button
          type="button"
          onClick={testCall}
          disabled={busy || !configured}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
          Test call
        </button>
      </div>

      <p className="max-w-lg text-xs text-muted-foreground">
        Call on high or critical violations after a scan.
      </p>

      {!configured && (
        <p className="max-w-lg text-xs text-amber-700">
          Set ElevenLabs vars and <code className="rounded bg-amber-500/10 px-1">ALERT_PHONE_NUMBER</code> in{" "}
          <code className="rounded bg-amber-500/10 px-1">.env.local</code> for test calls.
        </p>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
