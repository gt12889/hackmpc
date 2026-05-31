// Supermemory integration — persistent, cross-session memory for the Ask AI chat.
// We store each finished Q&A turn under a per-user container tag and, before each
// new question, semantically recall the most relevant past turns so the assistant
// carries context across sessions ("pick up where you left off").
//
// Everything here is BEST-EFFORT: if no key is set or the API hiccups, calls
// no-op / return [] and the chat works exactly as before. Never throws, never
// blocks the answer for long (short timeouts).

const BASE = "https://api.supermemory.ai/v3";

function key(): string {
  return process.env.SUPERMEMORY_API_KEY || "";
}

export function memoryEnabled(): boolean {
  return !!key();
}

const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${key()}` });

/** Store a memory under one or more container tags. Fire-and-forget friendly. */
export async function addMemory(content: string, containerTags: string[], metadata?: Record<string, unknown>): Promise<void> {
  if (!key() || !content.trim()) return;
  try {
    await fetch(`${BASE}/documents`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ content, containerTags, ...(metadata ? { metadata } : {}) }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // best-effort — losing a memory write must never break the chat
  }
}

/** Semantic recall: top matching past memories (their text) for a query, scoped
 *  to the given container tags. Returns [] on any error / no key. */
export async function searchMemory(q: string, containerTags: string[], limit = 4): Promise<string[]> {
  if (!key() || !q.trim()) return [];
  try {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ q, containerTags, limit, onlyMatchingChunks: true }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: any[] };
    const out: string[] = [];
    for (const r of data.results ?? []) {
      const text = typeof r?.content === "string" && r.content.trim()
        ? r.content.trim()
        : (Array.isArray(r?.chunks) ? r.chunks.map((c: any) => c?.content).filter(Boolean).join(" ") : "");
      if (text) out.push(text);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
