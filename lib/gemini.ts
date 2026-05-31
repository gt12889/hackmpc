import { GoogleGenAI } from "@google/genai";

// Shared Gemini client + automatic model fallback. Google's free tier meters
// quota PER MODEL, so if the primary model is rate-limited (429), we transparently
// retry the same request against the next free model. This keeps every AI feature
// working as long as ANY free model has quota left.

const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Order: primary → lighter/cheaper flash variants (each has its own free quota).
export const MODEL_CHAIN: string[] = [
  ...new Set([
    PRIMARY,
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
  ]),
];

export function hasApiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function isQuotaError(e: any): boolean {
  const msg = `${e?.message ?? e}`;
  return msg.includes("RESOURCE_EXHAUSTED") || msg.includes('"code":429') || msg.includes("429");
}

/**
 * generateContent with model fallback. Pass everything except `model`; we inject
 * each model from the chain in turn, advancing only on quota (429) errors.
 * Returns the response and the model that served it.
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  params: Record<string, any>
): Promise<{ resp: any; model: string }> {
  let lastErr: any;
  for (const model of MODEL_CHAIN) {
    try {
      const resp = await ai.models.generateContent({ ...params, model });
      return { resp, model };
    } catch (e) {
      if (isQuotaError(e)) {
        lastErr = e;
        continue; // try the next free model
      }
      throw e; // non-quota error — surface immediately
    }
  }
  throw lastErr ?? new Error("All Gemini models exhausted");
}
