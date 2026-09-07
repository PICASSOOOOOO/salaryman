export type InternalAiProvider = "gpt" | "claude";
import { getOpenAiTextModel } from "./openai-models";
import {
  isAstraRequested,
  isAstraVerified,
  markAstraUnverified,
  markAstraVerified,
  OPENAI_ASTRA_MODEL,
} from "./openai-models";
export type InternalMessage = { role: "system" | "user" | "assistant"; content: string };
export type InternalToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export type InternalToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export class InternalAiUnavailableError extends Error {
  constructor(
    public readonly failures: Array<{ provider: InternalAiProvider; detail: string }>,
  ) {
    super(`Internal AI unavailable (${failures.map((f) => `${f.provider}: ${f.detail}`).join("; ")})`);
    this.name = "InternalAiUnavailableError";
  }
}

function safeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(authorization\s*:\s*bearer)\s+\S+/gi, "$1 [redacted]")
    .replace(/(bearer)\s+\S+/gi, "$1 [redacted]")
    .replace(/(api[_ -]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 240);
}

async function verifyAstra(): Promise<boolean> {
  if (!isAstraRequested()) return false;
  if (isAstraVerified()) return true;

  const { openai } = await import("@workspace/integrations-openai-ai-server");
  try {
    const result = await Promise.race([
      openai.chat.completions.create({
        model: OPENAI_ASTRA_MODEL,
        max_completion_tokens: 8,
        messages: [
          { role: "system", content: "Provider readiness probe. Reply with OK only." },
          { role: "user", content: "ping" },
        ],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Astra readiness timeout")), 5_000)),
    ]);
    const content = result.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("Astra readiness returned no content");
    markAstraVerified();
    return true;
  } catch (error) {
    markAstraUnverified();
    console.warn("[internal-ai] Astra readiness failed; using verified GPT fallback:", safeError(error));
    return false;
  }
}

/** Returns Astra only after the provider-only probe has passed. */
export async function getInternalOpenAiModel(): Promise<string> {
  await verifyAstra();
  return getOpenAiTextModel();
}

export async function completeInternalText(
  messages: InternalMessage[],
  options: { maxTokens?: number; json?: boolean; prefer?: InternalAiProvider; fallback?: boolean } = {},
): Promise<{ content: string; provider: InternalAiProvider; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const maxTokens = options.maxTokens ?? 600;
  const preferred = options.prefer ?? "gpt";
  const order: InternalAiProvider[] = options.fallback === false
    ? [preferred]
    : preferred === "claude" ? ["claude", "gpt"] : ["gpt", "claude"];
  const failures: Array<{ provider: InternalAiProvider; detail: string }> = [];

  for (const provider of order) {
    try {
      if (provider === "gpt") {
        const { openai } = await import("@workspace/integrations-openai-ai-server");
        const result = await openai.chat.completions.create({
          model: await getInternalOpenAiModel(),
          messages,
          max_completion_tokens: maxTokens,
          ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
        });
        const content = result.choices[0]?.message?.content?.trim();
        if (!content) throw new Error("empty response");
        return {
          content,
          provider,
          usage: result.usage
            ? { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens }
            : undefined,
        };
      }

      const { anthropic } = await import("@workspace/integrations-anthropic-ai");
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: options.json
          ? `${system}\n\nReturn one valid JSON object only, with no markdown fence or surrounding prose.`
          : system,
        messages: turns,
      });
      const content = result.content
        .filter((block): block is Extract<(typeof result.content)[number], { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      if (!content) throw new Error("empty response");
      return {
        content,
        provider,
        usage: result.usage
          ? { prompt_tokens: result.usage.input_tokens, completion_tokens: result.usage.output_tokens }
          : undefined,
      };
    } catch (err) {
      failures.push({ provider, detail: safeError(err) });
    }
  }

  throw new InternalAiUnavailableError(failures);
}

export async function selectClaudeTools(
  messages: InternalMessage[],
  tools: InternalToolDefinition[],
  maxTokens = 600,
): Promise<{
  content: string;
  toolCalls: InternalToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}> {
  const { anthropic } = await import("@workspace/integrations-anthropic-ai");
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const turns = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: turns,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object" as const, ...tool.inputSchema },
    })),
    tool_choice: { type: "auto" },
  });
  return {
    content: result.content
      .filter((block): block is Extract<(typeof result.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim(),
    toolCalls: result.content
      .filter((block): block is Extract<(typeof result.content)[number], { type: "tool_use" }> => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) })),
    usage: result.usage
      ? { prompt_tokens: result.usage.input_tokens, completion_tokens: result.usage.output_tokens }
      : undefined,
  };
}

export async function probeInternalProvider(provider: InternalAiProvider): Promise<void> {
  await completeInternalText(
    [
      { role: "system", content: "Health check. Reply with OK only." },
      { role: "user", content: "ping" },
    ],
    { maxTokens: provider === "gpt" ? 256 : 10, prefer: provider, fallback: false },
  ).then((result) => {
    if (result.provider !== provider) throw new Error(`${provider} probe returned the wrong provider`);
  });
}