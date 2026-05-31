"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartRenderer } from "./chart-renderer";
import { ThinkingPreview } from "./thinking-preview";
import { Lineage } from "./lineage";
import type { VizPayload, ToolCallTrace } from "@/lib/agent";
import { cn } from "@/lib/utils";

type Msg = {
  role: "user" | "model";
  text: string;
  viz?: VizPayload | null;
  tools?: ToolCallTrace[];
};

const SUGGESTIONS = [
  "What did we spend on permits by state?",
  "Show monthly fuel spend as a trend",
  "Top 10 merchants by spend",
  "Compare USA vs Canada spend by category",
  "Which card spent the most on maintenance?",
];

export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setMessages((m) => [...m, { role: "model", text: data.text, viz: data.viz, tools: data.toolCalls }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "model", text: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className={cn("flex-1 space-y-6 overflow-y-auto py-6", compact ? "px-4" : "px-8")}>
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Ask anything about company spend</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plain-English questions across categories, merchants, states, cards and time. Follow-ups keep context.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={i} msg={m} />
        ))}

        {loading && <ThinkingPreview />}
      </div>

      <div className={cn("border-t border-border bg-background/80 py-4 backdrop-blur", compact ? "px-4" : "px-8")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className={cn("mx-auto flex items-center gap-2", compact ? "max-w-none" : "max-w-3xl")}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about permits, fuel, states, cards, trends…"
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Message({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("mx-auto flex max-w-3xl gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-secondary" : "bg-primary/15 ring-1 ring-primary/30"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-primary" />}
      </div>
      <div className={cn("min-w-0 flex-1 space-y-3", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "prose prose-sm prose-invert max-w-none rounded-xl px-4 py-2.5 text-sm",
            isUser ? "bg-secondary" : "border border-border bg-card"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
        </div>

        {msg.tools && msg.tools.length > 0 && <Lineage tools={msg.tools} />}

        {msg.viz && (
          <div className="w-full rounded-xl border border-border bg-card p-4">
            <ChartRenderer viz={msg.viz} />
          </div>
        )}
      </div>
    </div>
  );
}
