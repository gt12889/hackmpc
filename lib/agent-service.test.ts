import { describe, it, expect } from "vitest";
import { callAgentService, agentServiceUrl } from "./agent-service";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("agentServiceUrl", () => {
  it("defaults to localhost:8200 and respects env override", () => {
    const prev = process.env.AGENT_SERVICE_URL;
    delete process.env.AGENT_SERVICE_URL;
    expect(agentServiceUrl()).toBe("http://127.0.0.1:8200");
    process.env.AGENT_SERVICE_URL = "http://agents.internal:9000";
    expect(agentServiceUrl()).toBe("http://agents.internal:9000");
    if (prev === undefined) delete process.env.AGENT_SERVICE_URL;
    else process.env.AGENT_SERVICE_URL = prev;
  });
});

describe("callAgentService", () => {
  it("returns ok:true with parsed data on 200", async () => {
    const fetchImpl = (async (_url: string, init: any) => {
      const sent = JSON.parse(init.body);
      return jsonResponse({ echoed: sent.x, results: [1, 2] });
    }) as unknown as typeof fetch;
    const res = await callAgentService<{ echoed: number; results: number[] }>("/debate", { x: 42 }, { fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.echoed).toBe(42);
      expect(res.data.results).toEqual([1, 2]);
    }
  });

  it("returns ok:false (not throw) when fetch throws (service down)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await callAgentService("/debate", {}, { fetchImpl });
    expect(res.ok).toBe(false);
  });

  it("returns ok:false on a non-2xx response", async () => {
    const fetchImpl = (async () => jsonResponse({ error: "boom" }, 500)) as unknown as typeof fetch;
    const res = await callAgentService("/debate", {}, { fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("500");
  });
});
