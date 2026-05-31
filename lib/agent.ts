import { getClient, generateWithFallback, hasApiKey as hasKey } from "./gemini";
import { FUNCTION_DECLARATIONS, runTool, type ToolResult } from "./tools";
import { getCategories, getDateBounds, aggregate } from "./queries";

const MAX_ITERS = 5;

export type ChatTurn = { role: "user" | "model"; text: string };

export type VizPayload = {
  tool: string;
  suggested_viz: ToolResult["suggested_viz"];
  data: any;
  meta?: Record<string, any>;
  title?: string;
};

export type AgentResult = {
  text: string;
  viz: VizPayload | null;
  toolCalls: { name: string; args: any }[];
};

/** Reality primer + live schema facts. Identical each turn (cache-friendly). */
function buildSystemInstruction(): string {
  const cats = getCategories();
  const bounds = getDateBounds();
  const topStates = aggregate("state_province", "sum", {}, 8).rows.map((r) => r.key);
  const cards = aggregate("transaction_code", "count", { include_settlements: true }, 9).rows.map((r) => r.key);

  return `You are the analyst for Brim It, an AI expense-intelligence tool for a small/medium business's company card spending (Canada/USA). A non-technical finance manager is asking questions about the company's card spend.

DATA NOTES — read carefully:
- The data is anonymized company card transactions. There are NO department or employee labels in this data. If asked about "departments" or "employees", explain the data doesn't carry those, and offer the real dimensions instead: spend CATEGORY, CARD (cost-center), MERCHANT, US STATE / CANADIAN PROVINCE, and TIME.
- "Cards" (transaction codes) act as cost-centers. The available cards are: ${cards.join(", ")}. One primary card carries ~98% of volume — note this if a per-card breakdown looks lopsided.
- Money is in CAD. "Card Payments / Settlements" are bank bill-payments to the card, NOT operational spend; they are EXCLUDED by default. Only include them if the user explicitly asks about card payments.
- Data covers ${bounds.min} to ${bounds.max}.

Available spend categories: ${cats.join(", ")}.
Common states/provinces by spend: ${topStates.join(", ")}.

HOW TO ANSWER:
- ALWAYS use the provided tools to get real numbers. NEVER invent or estimate figures. If a tool returns nothing, say so plainly.
- Pick the smallest set of tool calls that answers the question. For follow-ups, reuse the prior filters unless the user changes them (e.g. "now just Texas" = add state=TX to the previous query).
- Quarters: the data spans Aug 2025–Mar 2026. Map "last quarter"/"Q3"/etc. to concrete date_from/date_to ranges and state which months you used.
- After the tool returns, give a SHORT (1-3 sentence) plain-English answer with the key number(s). The UI renders the chart automatically — do not describe the chart or dump every row. Surface the insight (biggest driver, notable change, anomaly).
- Be specific with money: format as CAD. Round sensibly in prose (e.g. "$696K on fuel").`;
}

export function hasApiKey(): boolean {
  return hasKey();
}

export async function runAgent(history: ChatTurn[], userMessage: string): Promise<AgentResult> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ No Gemini API key configured. Add `GEMINI_API_KEY=...` to `.env.local` and restart the dev server to enable conversational analytics.",
      viz: null,
      toolCalls: [],
    };
  }

  const contents: any[] = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const toolCalls: { name: string; args: any }[] = [];
  let lastViz: VizPayload | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const { resp } = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction: buildSystemInstruction(),
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }],
        temperature: 0.2,
      },
    });

    const calls = resp.functionCalls;
    const modelContent = resp.candidates?.[0]?.content;

    if (calls && calls.length > 0) {
      // Echo the model's function-call turn, then answer each call.
      contents.push(modelContent ?? { role: "model", parts: calls.map((c: any) => ({ functionCall: c })) });
      const responseParts: any[] = [];
      for (const call of calls) {
        const name = call.name as string;
        const args = (call.args as any) ?? {};
        const result = runTool(name, args);
        toolCalls.push({ name, args });
        if (result.ok) {
          lastViz = { tool: name, suggested_viz: result.suggested_viz, data: result.data, meta: result.meta };
        }
        responseParts.push({
          functionResponse: {
            name,
            response: result.ok
              ? { result: result.data, meta: result.meta }
              : { error: result.error },
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue; // let the model read the results and either call more tools or answer
    }

    // No tool calls → final answer.
    return { text: resp.text?.trim() || "I couldn't produce an answer for that.", viz: lastViz, toolCalls };
  }

  return {
    text: "I reached the tool-call limit while working on that. Try narrowing the question.",
    viz: lastViz,
    toolCalls,
  };
}
