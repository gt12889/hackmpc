import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

// Shared Gemini client + automatic model fallback. Google's free tier meters
// quota PER MODEL, so if the primary model is rate-limited (429), we transparently
// retry the same request against the next free model. This keeps every AI feature
// working as long as ANY free model has quota left.

const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Google's free tier meters quota PER MODEL PER DAY, so each entry is an
// independent quota pool — the more (real, tool-capable) models we list, the
// longer the app keeps working once any one model is daily-exhausted. We span
// model generations (2.x + 3.x flash) because newer generations get their own
// fresh quota buckets. Override the whole chain with GEMINI_MODELS (comma-sep).
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

export function hasApiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

/** True when the error means "this model can't serve right now — try another":
 *  quota exhaustion (429) OR the model being unavailable/retired for this key
 *  (404 NOT_FOUND). Anything else is a real bug and should surface immediately. */
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

/**
 * generateContent with model fallback. Pass everything except `model`; we inject
 * each model from the chain in turn, advancing only on quota (429) errors.
 * Returns the response and the model that served it.
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">
): Promise<{ resp: any; model: string }> {
  let lastErr: any;
  for (const model of MODEL_CHAIN) {
    try {
      const resp = await ai.models.generateContent({ ...params, model });
      return { resp, model };
    } catch (e) {
      if (shouldTryNextModel(e)) {
        lastErr = e;
        continue; // quota'd or unavailable — try the next free model
      }
      throw e; // genuine error (bad request, etc.) — surface immediately
    }
  }
  throw lastErr ?? new Error("All Gemini models exhausted");
}
