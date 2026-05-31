// Named compliance "context presets" — a single multiplier on rule thresholds
// that shifts how strict the scan is, without editing individual rules. Lower
// multiplier = lower thresholds = MORE sensitive (catches more); higher = relaxed.
// This is the "AI understands context" lever: pick the situation, re-scan.

export type ComplianceContext = { id: string; label: string; description: string; multiplier: number };

export const COMPLIANCE_CONTEXTS: ComplianceContext[] = [
  { id: "normal", label: "Normal", description: "Standard policy thresholds.", multiplier: 1 },
  { id: "quarter_end", label: "Quarter-end close", description: "Tighter scrutiny near period close — thresholds 30% lower, catches more.", multiplier: 0.7 },
  { id: "audit", label: "Audit mode", description: "Maximum sensitivity — thresholds halved.", multiplier: 0.5 },
  { id: "travel_season", label: "High-travel season", description: "Relax thresholds 40% to cut expected-travel noise.", multiplier: 1.4 },
];

export function contextById(id?: string | null): ComplianceContext {
  return COMPLIANCE_CONTEXTS.find((c) => c.id === id) ?? COMPLIANCE_CONTEXTS[0];
}

export function contextMultiplier(id?: string | null): number {
  return contextById(id).multiplier;
}
