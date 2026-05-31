"use client";

import useSWR from "swr";
import { Sparkles, Gavel, ShieldAlert, Search, Lightbulb, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/kpi-card";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const FEATURE_META: Record<string, { label: string; icon: any }> = {
  "approval-debate": { label: "Approval debate", icon: Gavel },
  "fraud-investigator": { label: "Fraud investigator", icon: Search },
  "compliance-swarm": { label: "Compliance review", icon: ShieldAlert },
  "insights-swarm": { label: "Insights sweep", icon: Lightbulb },
};

function relativeTime(iso: string): string {
  // agent_runs.created_at is UTC "YYYY-MM-DD HH:MM:SS"
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function AgentActivity() {
  const { data, mutate, isLoading } = useSWR("/api/agents", fetcher, { refreshInterval: 5000 });
  const runs: any[] = data?.runs ?? [];

  // group by feature, preserving newest-first order
  const groups = new Map<string, any[]>();
  for (const r of runs) {
    if (!groups.has(r.feature)) groups.set(r.feature, []);
    groups.get(r.feature)!.push(r);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Agent activity"
        description="Every role-agent run across the Brim Agents swarm — debate, investigation, review, and sweep — newest first."
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{runs.length} recent run{runs.length === 1 ? "" : "s"}</span>
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} /> Refresh
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Sparkles className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-neutral-900">No agent runs yet</p>
            <p className="text-xs text-muted-foreground">
              Trigger a debate, fraud investigation, compliance scan, or insights sweep — the agents will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {[...groups.entries()].map(([feature, items]) => {
              const meta = FEATURE_META[feature] ?? { label: feature, icon: Sparkles };
              const Icon = meta.icon;
              return (
                <div key={feature}>
                  <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-neutral-600">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {meta.label}
                    <span className="text-muted-foreground">· {items.length}</span>
                  </div>
                  <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                    {items.map((r) => (
                      <div key={r.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                        <span
                          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.ok ? "bg-primary" : "bg-destructive")}
                          title={r.ok ? "ok" : "failed"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-neutral-900">{r.role}</span>
                            {r.subject_key && <span className="text-xs text-muted-foreground">#{r.subject_key}</span>}
                            {r.model && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.model}</span>}
                            <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(r.created_at)}</span>
                          </div>
                          {r.summary && <p className="mt-0.5 truncate text-[13px] text-neutral-600">{r.summary}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
