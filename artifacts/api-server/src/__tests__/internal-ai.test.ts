import { beforeEach, describe, expect, it, vi } from "vitest";

const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: openaiCreate } } },
}));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: anthropicCreate } },
}));

describe("Replit-managed internal AI fallback", () => {
  beforeEach(() => {
    openaiCreate.mockReset();
    anthropicCreate.mockReset();
  });

  it("uses GPT without any user-owned API key", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    });
    const { completeInternalText } = await import("../lib/internal-ai");
    await expect(completeInternalText([{ role: "user", content: "hi" }])).resolves.toMatchObject({
      content: "hello",
      provider: "gpt",
    });
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("falls back to Claude after an internal GPT failure", async () => {
    openaiCreate.mockRejectedValue(new Error("proxy unavailable"));
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "fallback" }],
      usage: { input_tokens: 3, output_tokens: 2 },
    });
    const { completeInternalText } = await import("../lib/internal-ai");
    await expect(completeInternalText([{ role: "user", content: "hi" }])).resolves.toMatchObject({
      content: "fallback",
      provider: "claude",
    });
  });

  it("asks Claude for strict JSON on command fallback", async () => {
    openaiCreate.mockRejectedValue(new Error("offline"));
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"say":"On it.","action":null}' }],
      usage: { input_tokens: 3, output_tokens: 2 },
    });
    const { completeInternalText } = await import("../lib/internal-ai");
    const result = await completeInternalText(
      [{ role: "system", content: "command" }, { role: "user", content: "tour" }],
      { json: true },
    );
    expect(JSON.parse(result.content)).toEqual({ say: "On it.", action: null });
    expect(anthropicCreate.mock.calls[0][0].system).toContain("valid JSON object");
  });

  it("returns actionable provider failures without leaking credentials", async () => {
    openaiCreate.mockRejectedValue(new Error("Authorization: Bearer top-secret"));
    anthropicCreate.mockRejectedValue(new Error("api_key=another-secret"));
    const { completeInternalText, InternalAiUnavailableError } = await import("../lib/internal-ai");
    const error = await completeInternalText([{ role: "user", content: "hi" }]).catch((err) => err);
    expect(error).toBeInstanceOf(InternalAiUnavailableError);
    expect(error.message).toContain("gpt:");
    expect(error.message).toContain("claude:");
    expect(error.message).not.toContain("top-secret");
    expect(error.message).not.toContain("another-secret");
  });

  it("can probe one provider strictly without invoking fallback", async () => {
    openaiCreate.mockRejectedValue(new Error("proxy down"));
    const { completeInternalText } = await import("../lib/internal-ai");
    await expect(completeInternalText(
      [{ role: "user", content: "ping" }],
      { prefer: "gpt", fallback: false },
    )).rejects.toThrow("gpt:");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("lets Claude select image and finance tools when GPT is unavailable", async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Checking both." },
        { type: "tool_use", id: "tool-image", name: "generate_image", input: { prompt: "a skyline" } },
        { type: "tool_use", id: "tool-finance", name: "get_business_financials", input: {} },
      ],
      usage: { input_tokens: 9, output_tokens: 4 },
    });
    const { selectClaudeTools } = await import("../lib/internal-ai");
    const result = await selectClaudeTools(
      [{ role: "user", content: "Show a skyline and check my books" }],
      [
        { name: "generate_image", description: "Generate an image", inputSchema: { type: "object" } },
        { name: "get_business_financials", description: "Read the books", inputSchema: { type: "object" } },
      ],
    );
    expect(result.toolCalls).toEqual([
      { id: "tool-image", name: "generate_image", arguments: '{"prompt":"a skyline"}' },
      { id: "tool-finance", name: "get_business_financials", arguments: "{}" },
    ]);
    expect(anthropicCreate.mock.calls[0][0].tools).toHaveLength(2);
  });
});