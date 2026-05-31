import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import OpenAI from "openai";

// Shared LLM layer. Primary = Google Gemini with per-model fallback (the free tier
// meters quota PER MODEL, so we retry the same request down a chain of free models
// on 429/404). If the WHOLE Gemini chain fails (or there's no Gemini key), we fall
// back to OpenAI, translating the request and returning a Gemini-SHAPED response so
// every caller (text passes, vision OCR, and the agent's function-calling loop)
// works unchanged. Everything stays graceful: no key on either side → callers see a
// thrown error / null and degrade to their rule-based baseline.

const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Google's free tier meters quota PER MODEL PER DAY, so each entry is an
// independent quota pool - the more (real, tool-capable) models we list, the
// longer the app keeps working once any one model is daily-exhausted.
export const MODEL_CHAIN: string[] = (process.env.GEMINI_MODELS
  ? process.env.GEMINI_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
  : [
      PRIMARY,
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ]
).filter((m, i, arr) => arr.indexOf(m) === i); // de-dupe, preserve order

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function hasApiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** True when ANY provider is configured (Gemini or OpenAI). Use this for feature gates. */
export function hasLLM(): boolean {
  return hasApiKey() || hasOpenAIKey();
}

export function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!_openai) _openai = new OpenAI({ apiKey });
  return _openai;
}

/** True when the error means "this model can't serve right now - try another". */
function shouldTryNextModel(e: any): boolean {
  const msg = `${e?.message ?? e}`;
  const code = e?.status ?? e?.code;
  return (
    code === 429 ||
    code === 404 ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes('"code":429') ||
    msg.includes("429") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("is not found") ||
    msg.includes("not supported for generateContent")
  );
}

// ---------------- OpenAI translation (Gemini-shaped in / out) ----------------

function safeJson(s: string): any {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

/** Recursively lowercase JSON-Schema `type` values (Gemini's Type enum is UPPERCASE
 *  like "OBJECT"/"STRING"; OpenAI/JSON-Schema want "object"/"string"). */
export function lowerSchemaTypes(schema: any): any {
  if (Array.isArray(schema)) return schema.map(lowerSchemaTypes);
  if (schema && typeof schema === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      out[k] = k === "type" && typeof v === "string" ? (v as string).toLowerCase() : lowerSchemaTypes(v);
    }
    return out;
  }
  return schema;
}

/** Gemini `config.tools[].functionDeclarations` → OpenAI `tools`. */
export function geminiToolsToOpenAI(tools: any): any[] | undefined {
  const out: any[] = [];
  for (const t of tools ?? []) {
    for (const fd of t.functionDeclarations ?? []) {
      out.push({ type: "function", function: { name: fd.name, description: fd.description, parameters: lowerSchemaTypes(fd.parameters) } });
    }
  }
  return out.length ? out : undefined;
}

/** Gemini `contents` (+ systemInstruction) → OpenAI chat messages. Handles text,
 *  inlineData (vision), and functionCall/functionResponse turns (tool loop). */
export function geminiContentsToOpenAIMessages(contents: any, systemInstruction?: string): any[] {
  const arr = Array.isArray(contents) ? contents : [contents];
  const msgs: any[] = [];
  if (systemInstruction) msgs.push({ role: "system", content: systemInstruction });
  let seq = 0;
  const pending: { id: string; name: string }[] = []; // open tool_calls awaiting a response

  for (const turn of arr) {
    const role = turn?.role === "model" ? "assistant" : "user";
    const parts: any[] = turn?.parts ?? [];
    const fcs = parts.filter((p) => p.functionCall);
    const frs = parts.filter((p) => p.functionResponse);
    const texts = parts.filter((p) => typeof p.text === "string").map((p) => p.text);
    const imgs = parts.filter((p) => p.inlineData);

    if (fcs.length) {
      const tool_calls = fcs.map((p) => {
        const id = `call_${seq++}`;
        pending.push({ id, name: p.functionCall.name });
        return { id, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } };
      });
      msgs.push({ role: "assistant", content: texts.join("\n") || null, tool_calls });
      continue;
    }
    if (frs.length) {
      for (const p of frs) {
        const i = pending.findIndex((x) => x.name === p.functionResponse.name);
        const id = i >= 0 ? pending.splice(i, 1)[0].id : `call_${seq++}`;
        msgs.push({ role: "tool", tool_call_id: id, content: JSON.stringify(p.functionResponse.response ?? {}) });
      }
      continue;
    }
    if (imgs.length) {
      msgs.push({
        role,
        content: [
          ...texts.map((t) => ({ type: "text", text: t })),
          ...imgs.map((p) => ({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } })),
        ],
      });
    } else {
      msgs.push({ role, content: texts.join("\n") });
    }
  }
  return msgs;
}

/** OpenAI completion → a minimal Gemini-shaped response (`.text`, `.functionCalls`,
 *  `.candidates[0].content`) so existing callers don't change. */
export function openAIToGeminiResp(completion: any): any {
  const msg = completion?.choices?.[0]?.message;
  const text: string = msg?.content ?? "";
  const calls = (msg?.tool_calls ?? []).map((tc: any) => ({ name: tc.function.name, args: safeJson(tc.function.arguments) }));
  const parts = calls.length ? calls.map((c: any) => ({ functionCall: c })) : [{ text }];
  return {
    text,
    functionCalls: calls.length ? calls : undefined,
    candidates: [{ content: { role: "model", parts } }],
  };
}

async function generateWithOpenAI(params: Omit<GenerateContentParameters, "model">): Promise<{ resp: any; model: string }> {
  const client = getOpenAI();
  if (!client) throw new Error("No OpenAI key");
  const cfg: any = (params as any).config ?? {};
  const tools = cfg.tools ? geminiToolsToOpenAI(cfg.tools) : undefined;
  const req: any = {
    model: OPENAI_MODEL,
    messages: geminiContentsToOpenAIMessages((params as any).contents, cfg.systemInstruction),
  };
  if (typeof cfg.temperature === "number") req.temperature = cfg.temperature;
  if (tools) req.tools = tools;
  const completion = await client.chat.completions.create(req);
  return { resp: openAIToGeminiResp(completion), model: `openai:${OPENAI_MODEL}` };
}

/**
 * Generate with provider fallback. Tries the Gemini model chain first; if the whole
 * chain fails (quota/unavailable) or hits a hard error, falls back to OpenAI when an
 * OpenAI key is set. `ai` may be null (no Gemini key) → goes straight to OpenAI.
 * Returns the response and the model that served it (`openai:<model>` when OpenAI did).
 */
export async function generateWithFallback(
  ai: GoogleGenAI | null,
  params: Omit<GenerateContentParameters, "model">,
  opts: { startModel?: string } = {}
): Promise<{ resp: any; model: string }> {
  // Once a multi-turn loop has switched to OpenAI, stay there (the pinned "model"
  // is "openai:..."); also go straight to OpenAI when there's no Gemini client.
  if (opts.startModel?.startsWith("openai") || !ai) {
    if (hasOpenAIKey()) return generateWithOpenAI(params);
    if (!ai) throw new Error("No LLM provider configured");
  }

  // Pin the caller's model first so a tool loop stays on one model (Gemini 2.5+
  // rejects a history whose functionCall thought_signature came from another model).
  const startGemini = opts.startModel && !opts.startModel.startsWith("openai") ? opts.startModel : undefined;
  const chain = startGemini ? [startGemini, ...MODEL_CHAIN.filter((m) => m !== startGemini)] : MODEL_CHAIN;

  let lastErr: any;
  for (const model of chain) {
    try {
      const resp = await ai!.models.generateContent({ ...params, model });
      return { resp, model };
    } catch (e) {
      if (shouldTryNextModel(e)) {
        lastErr = e;
        continue; // quota'd / unavailable → next Gemini model
      }
      // Hard Gemini error → last-resort OpenAI before surfacing.
      if (hasOpenAIKey()) {
        try {
          return await generateWithOpenAI(params);
        } catch {
          throw e;
        }
      }
      throw e;
    }
  }
  // Whole Gemini chain exhausted → OpenAI if available.
  if (hasOpenAIKey()) return generateWithOpenAI(params);
  throw lastErr ?? new Error("All Gemini models exhausted");
}
