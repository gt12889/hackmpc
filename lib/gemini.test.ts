import { describe, it, expect } from "vitest";
import {
  geminiContentsToOpenAIMessages,
  geminiToolsToOpenAI,
  lowerSchemaTypes,
  openAIToGeminiResp,
} from "./gemini";

describe("geminiContentsToOpenAIMessages", () => {
  it("maps a plain user turn + system instruction", () => {
    const msgs = geminiContentsToOpenAIMessages([{ role: "user", parts: [{ text: "hi" }] }], "be terse");
    expect(msgs[0]).toEqual({ role: "system", content: "be terse" });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });

  it("pairs a functionCall turn with its functionResponse via matching tool_call_id", () => {
    const msgs = geminiContentsToOpenAIMessages([
      { role: "user", parts: [{ text: "spend by category" }] },
      { role: "model", parts: [{ functionCall: { name: "aggregate_spend", args: { group_by: "category" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "aggregate_spend", response: { rows: [] } } }] },
    ]);
    const assistant = msgs.find((m) => m.role === "assistant");
    const tool = msgs.find((m) => m.role === "tool");
    expect(assistant.tool_calls[0].function.name).toBe("aggregate_spend");
    expect(JSON.parse(assistant.tool_calls[0].function.arguments)).toEqual({ group_by: "category" });
    expect(tool.tool_call_id).toBe(assistant.tool_calls[0].id); // ids correlate
  });

  it("maps inlineData to an image_url content part (vision)", () => {
    const msgs = geminiContentsToOpenAIMessages([
      { role: "user", parts: [{ text: "read this" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }] },
    ]);
    const c = msgs[0].content;
    expect(c.find((p: any) => p.type === "image_url").image_url.url).toBe("data:image/png;base64,AAAA");
  });
});

describe("lowerSchemaTypes + geminiToolsToOpenAI", () => {
  it("lowercases JSON-schema type values recursively", () => {
    expect(lowerSchemaTypes({ type: "OBJECT", properties: { x: { type: "STRING" } } })).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
    });
  });

  it("converts gemini functionDeclarations to OpenAI tools", () => {
    const tools = geminiToolsToOpenAI([{ functionDeclarations: [{ name: "f", description: "d", parameters: { type: "OBJECT" } }] }]);
    expect(tools).toEqual([{ type: "function", function: { name: "f", description: "d", parameters: { type: "object" } } }]);
  });
});

describe("openAIToGeminiResp", () => {
  it("exposes .text for a plain completion", () => {
    const r = openAIToGeminiResp({ choices: [{ message: { content: "hello" } }] });
    expect(r.text).toBe("hello");
    expect(r.functionCalls).toBeUndefined();
    expect(r.candidates[0].content.parts[0].text).toBe("hello");
  });

  it("exposes .functionCalls for a tool-call completion", () => {
    const r = openAIToGeminiResp({
      choices: [{ message: { content: null, tool_calls: [{ function: { name: "top_merchants", arguments: '{"by":"spend"}' } }] } }],
    });
    expect(r.functionCalls[0]).toEqual({ name: "top_merchants", args: { by: "spend" } });
    expect(r.candidates[0].content.parts[0].functionCall.name).toBe("top_merchants");
  });
});
