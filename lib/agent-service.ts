import { swarmEnabled } from "./orchestrator";

// Thin HTTP client to the Python LangGraph sidecar. The sidecar is stateless: we
// POST gathered context and get back { results|insights, traces }. Every call
// degrades gracefully - any failure (service down, timeout, non-2xx, bad JSON)
// returns { ok: false } so callers can fall back to the single-call AI path.
// `fetchImpl` is injectable for tests (no network).

export function agentServiceUrl(): string {
  return process.env.AGENT_SERVICE_URL || "http://127.0.0.1:8200";
}

/** True when routes should call the sidecar (feature flag). */
export function agentsEnabled(): boolean {
  return swarmEnabled();
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callAgentService<T = any>(
  path: string,
  body: unknown,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<ServiceResult<T>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `${agentServiceUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const resp = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20000),
    });
    if (!resp.ok) {
      return { ok: false, error: `agent service ${resp.status}` };
    }
    const data = (await resp.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    console.error(`[agent-service ${path}]`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
