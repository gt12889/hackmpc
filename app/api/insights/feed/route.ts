import { NextResponse } from "next/server";
import { generateFeed, getCachedFeed } from "@/lib/insights-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ feed: getCachedFeed() });
}

export async function POST() {
  const feed = await generateFeed();
  return NextResponse.json({ feed });
}
