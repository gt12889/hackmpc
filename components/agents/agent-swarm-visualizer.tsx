"use client";

import { useEffect, useState } from "react";
import {
  FileText, Gavel, CircleCheck, CircleX, Scale, Search, Layers,
  ShieldAlert, BarChart3, Lightbulb, ListOrdered, Sparkles, Check, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Demo visualization of a swarm run. The real reasoning happens server-side, so
// this is an illustrative, timer-driven animation of each graph's topology:
// input → parallel agents → synthesizer → output. Not a literal trace — it just
// shows what's running for a clean demo. Driven by `running`: while true it walks
// input→parallel→synth and holds; when it flips false the run completes.

export type SwarmFeature = "approval-debate" | "fraud-investigator" | "compliance-swarm" | "insights-swarm";

type NodeDef = { label: string; icon: any };
type GraphDef = { input: NodeDef; parallel: NodeDef[]; synth: NodeDef; output: NodeDef };

const GRAPHS: Record<SwarmFeature, GraphDef> = {
  "approval-debate": {
    input: { label: "Pending request", icon: FileText },
    parallel: [
      { label: "Prosecutor", icon: CircleX },
      { label: "Defender", icon: CircleCheck },
    ],
    synth: { label: "Judge", icon: Gavel },
    output: { label: "Verdict", icon: CircleCheck },
  },
  "fraud-investigator": {
    input: { label: "Fraud suspects", icon: Search },
    parallel: [
      { label: "Investigator", icon: Search },
      { label: "Investigator", icon: Search },
      { label: "Investigator", icon: Search },
    ],
    synth: { label: "Aggregate", icon: Layers },
    output: { label: "Case files", icon: FileText },
  },
  "compliance-swarm": {
    input: { label: "Open violations", icon: ShieldAlert },
    parallel: [
      { label: "Reviewer · ducking", icon: ShieldAlert },
      { label: "Reviewer · restricted", icon: ShieldAlert },
      { label: "Reviewer · cross-border", icon: ShieldAlert },
    ],
    synth: { label: "Challenger", icon: Scale },
    output: { label: "Adjusted severities", icon: CircleCheck },
  },
  "insights-swarm": {
    input: { label: "Spend signals", icon: BarChart3 },
    parallel: [
      { label: "Savings", icon: Lightbulb },
      { label: "Risk", icon: ShieldAlert },
      { label: "Forecast", icon: BarChart3 },
      { label: "Coverage", icon: FileText },
    ],
    synth: { label: "Ranker", icon: ListOrdered },
    output: { label: "Ranked insights", icon: Sparkles },
  },
};

const TITLES: Record<SwarmFeature, string> = {
  "approval-debate": "Approval debate",
  "fraud-investigator": "Fraud investigator swarm",
  "compliance-swarm": "Compliance reviewer swarm",
  "insights-swarm": "Insights multi-lens sweep",
};

// stage: 0 input · 1 parallel · 2 synth · 3 done
type NodeState = "idle" | "running" | "done";

function nodeState(stageOfNode: number, stage: number): NodeState {
  if (stage < stageOfNode) return "idle";
  if (stage === stageOfNode) return "running";
  return "done";
}

function NodeCard({ def, state, parallel }: { def: NodeDef; state: NodeState; parallel?: boolean }) {
  const Icon = def.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-300",
        parallel ? "w-full" : "min-w-[120px]",
        state === "idle" && "border-border/50 bg-card/40 opacity-45",
        state === "running" && "border-primary/60 bg-primary/10 scale-[1.03] shadow-sm shadow-primary/20",
        state === "done" && "border-primary/30 bg-primary/5"
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          state === "running" ? "bg-primary/20 text-primary" : state === "done" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
        )}
      >
        {state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "done" ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      </span>
      <span className={cn("truncate text-[13px] font-medium", state === "idle" ? "text-muted-foreground" : "text-neutral-900")}>
        {def.label}
      </span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative mx-1 hidden h-px min-w-[28px] flex-1 self-center overflow-hidden bg-border/60 sm:block">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity",
          active ? "animate-[agentflow_1s_linear_infinite] opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}

export function AgentSwarmVisualizer({
  feature,
  running,
  runKey = 0,
}: {
  feature: SwarmFeature;
  running: boolean;
  runKey?: number;
}) {
  const g = GRAPHS[feature];
  const [stage, setStage] = useState(3);

  useEffect(() => {
    if (!running) {
      setStage(3); // done
      return;
    }
    setStage(0);
    const t1 = setTimeout(() => setStage(1), 500);
    const t2 = setTimeout(() => setStage(2), 1150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [running, runKey]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className={cn("h-4 w-4 text-primary", running && "animate-pulse")} />
        <span className="text-sm font-semibold">{TITLES[feature]}</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
          {running ? "running…" : stage === 3 ? "complete" : "idle"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {/* input */}
        <div className="flex sm:items-center">
          <NodeCard def={g.input} state={nodeState(0, stage)} />
        </div>
        <Connector active={stage >= 1} />

        {/* parallel agents */}
        <div className="flex flex-col justify-center gap-1.5 sm:min-w-[160px]">
          {g.parallel.map((n, i) => (
            <NodeCard key={i} def={n} state={nodeState(1, stage)} parallel />
          ))}
        </div>
        <Connector active={stage >= 2} />

        {/* synthesizer */}
        <div className="flex sm:items-center">
          <NodeCard def={g.synth} state={nodeState(2, stage)} />
        </div>
        <Connector active={stage >= 3} />

        {/* output */}
        <div className="flex sm:items-center">
          <NodeCard def={g.output} state={stage >= 3 ? "done" : "idle"} />
        </div>
      </div>
    </div>
  );
}
