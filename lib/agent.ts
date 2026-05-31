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

/** One step of provenance: the tool the model chose, the whitelisted args it
 *  passed, and a summary of what came back. This is the data-lineage trail the
 *  UI renders so every answer traces back to the rows behind it. */
export type ToolCallTrace = {
  name: string;
  args: any;
  ok: boolean;
  rowCount: number;
  total?: number;
  error?: string;
  /** First few result rows, so the lineage can show the actual numbers behind
   *  the answer (not just a count). Bounded to keep the payload small. */
  sample?: any[];
  /** Result metadata (money flag, group_by, metric, compare labels…) used to
   *  format the sample correctly in the UI. */
  meta?: Record<string, any>;
};

export type AgentResult = {
  text: string;
  viz: VizPayload | null;
  toolCalls: ToolCallTrace[];
  /** Contextual "where to go next" questions, derived from the tool just used and
   *  its top result - a decision-tree of related drill-downs the user can click. */
  followUps: string[];
};

/** Build related follow-up questions from the last successful tool call + its top
 *  row, so each answer branches into sensible next questions (a decision tree). */
function suggestFollowUps(toolCalls: ToolCallTrace[]): string[] {
  const last = [...toolCalls].reverse().find((t) => t.ok);
  if (!last) return [];
  const top = String(last.sample?.[0]?.key ?? "").trim();
  const m = last.meta || {};
  const fu: string[] = [];

  switch (last.name) {
    case "aggregate_spend": {
      switch (m.group_by) {
        case "category":
          if (top) fu.push(`Which merchants drive ${top} spending?`, `Break ${top} down by state`);
          fu.push("Show monthly spending by category");
          break;
        case "state_province":
          if (top) fu.push(`Top categories in ${top}`, `Top merchants in ${top}`);
          fu.push("Compare USA vs Canada by category");
          break;
        case "merchant_norm":
          if (top) fu.push(`Show ${top} spending over time`, `What category is ${top}?`);
          fu.push("Where can we consolidate vendors?");
          break;
        case "transaction_code":
          if (top) fu.push(`What did card ${top} spend on?`);
          fu.push("Show spending by category", "Monthly spending trend");
          break;
        case "month":
          fu.push("Break this down by category", "Top merchants overall");
          break;
        default:
          fu.push("Show the monthly spending trend", "Spending by category");
      }
      break;
    }
    case "time_series":
      fu.push("Break this down by category", "Which month had the highest spending?", "Compare USA vs Canada over time");
      break;
    case "top_merchants":
      if (top) fu.push(`Show ${top} spending over time`, `What category is ${top}?`);
      fu.push("Where can we consolidate vendors?");
      break;
    case "compare_periods":
      if (m.label_a) fu.push(`Show the ${m.label_a} spending trend`);
      fu.push("Which category has the biggest gap?", "Top merchants for each side");
      break;
    case "list_transactions":
      fu.push("Summarize these by category", "Show the monthly trend", "Which merchant appears most?");
      break;
  }
  return [...new Set(fu)].slice(0, 3);
}

/** AI-generated follow-ups: ask the model for 3 fresh, non-repeating drill-downs
 *  grounded in the question + answer + the data just queried. Falls back to the
 *  templated suggestions on any error/quota so the chips never disappear. */
async function generateFollowUps(
  ai: any,
  model: string | undefined,
  userMessage: string,
  answer: string,
  toolCalls: ToolCallTrace[]
): Promise<string[]> {
  const last = [...toolCalls].reverse().find((t) => t.ok);
  const ctx = last
    ? `Tool used: ${last.name}${last.meta?.group_by ? ` by ${last.meta.group_by}` : ""}. Top results: ${(last.sample || [])
        .slice(0, 3)
        .map((r: any) => `${r.key ?? ""}=${r.value ?? ""}`)
        .join(", ")}.`
    : "No data tool was used.";
  const prompt = `A finance manager is exploring a company's card-spend data (dimensions: category, merchant, US state / Canadian province, country, card, month; metrics: total / average / count; views: totals, trends over time, comparisons, top merchants, transaction lists).
They asked: "${userMessage}"
Answer given: "${answer}"
${ctx}
Propose exactly 3 SHORT follow-up questions (each <= 10 words) that drill deeper or branch to a related, NON-REPEATING angle, each answerable from this spend data. Reference concrete categories / merchants / places from the results when useful. Avoid repeating the question already asked.
Return ONLY JSON: {"followUps":["...","...","..."]}`;

  const { resp } = await generateWithFallback(
    ai,
    { contents: [{ role: "user", parts: [{ text: prompt }] }], config: { responseMimeType: "application/json", temperature: 0.8 } },
    { startModel: model }
  );
  const parsed = JSON.parse(resp.text || "{}");
  const arr = Array.isArray(parsed?.followUps) ? parsed.followUps : [];
  const clean = [...new Set(arr.map((s: any) => String(s).trim()).filter(Boolean))].slice(0, 3);
  return clean.length ? clean : suggestFollowUps(toolCalls);
}

/** Reality primer + live schema facts. Identical each turn (cache-friendly). */
function buildSystemInstruction(): string {
  const cats = getCategories();
  const bounds = getDateBounds();
  const topStates = aggregate("state_province", "sum", {}, 8).rows.map((r) => r.key);
  const cards = aggregate("transaction_code", "count", { include_settlements: true }, 9).rows.map((r) => r.key);

  return `You are the analyst for Brim It, an AI expense-intelligence tool for a small/medium business's company card spending (Canada/USA). A non-technical finance manager is asking questions about the company's card spending.

DATA NOTES - read carefully:
- The data is anonymized company card transactions. There are NO department or employee labels in this data. If asked about "departments" or "employees", explain the data doesn't carry those, and offer the real dimensions instead: spending CATEGORY, CARD (cost-center), MERCHANT, US STATE / CANADIAN PROVINCE, and TIME.
- "Cards" (transaction codes) act as cost-centers. The available cards are: ${cards.join(", ")}. One primary card carries ~98% of volume - note this if a per-card breakdown looks lopsided.
- Money is in CAD. "Card Payments / Settlements" are bank bill-payments to the card, NOT operational spending; they are EXCLUDED by default. Only include them if the user explicitly asks about card payments.
- Data covers ${bounds.min} to ${bounds.max}.

Available spending categories: ${cats.join(", ")}.
Common states/provinces by spending: ${topStates.join(", ")}.

HOW TO ANSWER:
- ALWAYS use the provided tools to get real numbers. NEVER invent or estimate figures. If a tool returns nothing, say so plainly.
- Pick the smallest set of tool calls that answers the question. For follow-ups, reuse the prior filters unless the user changes them (e.g. "now just Texas" = add state=TX to the previous query).
- Quarters: the data spans Aug 2025–Mar 2026. Map "last quarter"/"Q3"/etc. to concrete date_from/date_to ranges and state which months you used.
- After the tool returns, give a SHORT (1-3 sentence) plain-English answer with the key number(s). The UI renders the chart automatically - do not describe the chart or dump every row. Surface the insight (biggest driver, notable change, anomaly).
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
      followUps: [],
    };
  }

  const contents: any[] = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const toolCalls: ToolCallTrace[] = [];
  let lastViz: VizPayload | null = null;
  // Pin the conversation to the first model that serves it. Switching models
  // mid-loop invalidates functionCall thoughtSignatures and Gemini 2.5+ rejects
  // the request (INVALID_ARGUMENT), which would drop the answer + chart.
  let pinnedModel: string | undefined;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const { resp, model } = await generateWithFallback(
      ai,
      {
        contents,
        config: {
          systemInstruction: buildSystemInstruction(),
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }],
          temperature: 0.2,
        },
      },
      { startModel: pinnedModel }
    );
    pinnedModel = model;

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
        const rowCount = Array.isArray(result.data) ? result.data.length : result.data == null ? 0 : 1;
        const sample = Array.isArray(result.data)
          ? result.data.slice(0, 5)
          : result.data != null
          ? [result.data]
          : [];
        toolCalls.push({
          name,
          args,
          ok: result.ok,
          rowCount,
          total: typeof result.meta?.total === "number" ? result.meta.total : undefined,
          error: result.error,
          sample,
          meta: result.meta,
        });
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

    // No tool calls → final answer. Generate fresh, non-repeating follow-ups via
    // the model (templated suggestions as a fallback so chips never vanish).
    const answer = resp.text?.trim() || "I couldn't produce an answer for that.";
    let followUps: string[];
    try {
      followUps = await generateFollowUps(ai, pinnedModel, userMessage, answer, toolCalls);
    } catch {
      followUps = suggestFollowUps(toolCalls);
    }
    return { text: answer, viz: lastViz, toolCalls, followUps };
  }

  return {
    text: "I reached the tool-call limit while working on that. Try narrowing the question.",
    viz: lastViz,
    followUps: suggestFollowUps(toolCalls),
    toolCalls,
  };
}
