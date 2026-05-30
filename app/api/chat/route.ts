import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatTurn } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const result = await runAgent(history, message);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[/api/chat]", e);
    return NextResponse.json({ error: e?.message || "Agent error" }, { status: 500 });
  }
}
