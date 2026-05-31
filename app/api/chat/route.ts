import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatTurn } from "@/lib/agent";
import { memoryEnabled, searchMemory, addMemory } from "@/lib/supermemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_TAGS = ["ask-ai"]; // single-user demo: one container for the chat's memory

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = (body?.message ?? "").toString().slice(0, 2000);
    const history: ChatTurn[] = Array.isArray(body?.history)
      ? body.history
          .filter((t: any) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
          .slice(-12) // bound context
      : [];

    if (!message.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Cross-session memory (Supermemory): recall relevant past turns before
    // answering, then store this turn. Best-effort + key-gated — no key → no-ops.
    const recall = memoryEnabled() ? await searchMemory(message, MEMORY_TAGS, 4) : [];
    const result = await runAgent(history, message, { recall });
    if (memoryEnabled()) void addMemory(`Q: ${message}\nA: ${result.text}`, MEMORY_TAGS);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[/api/chat]", e);
    return NextResponse.json({ error: e?.message || "Agent error" }, { status: 500 });
  }
}
