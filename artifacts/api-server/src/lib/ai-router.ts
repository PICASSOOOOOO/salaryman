import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";

export type RequestType = "code" | "chat" | "analysis" | "creative" | "general";
export type ModelProvider = "claude" | "gpt";

export interface RouterResult {
  provider: ModelProvider;
  model: string;
  agentName: string;
  agentShort: string;
  requestType: RequestType;
}

function classifyRequest(text: string): RequestType {
  const lower = text.toLowerCase();

  const codePatterns = [
    /\b(code|function|class|algorithm|debug|refactor|implement|typescript|javascript|python|java|sql|api|endpoint|bug|error|stack|loop|array|object|async|await|promise|regex|git|deploy|database|schema|query)\b/,
    /```/, /def |fn |let |const |var |import |export |return |public |private /,
  ];
  for (const p of codePatterns) {
    if (p.test(lower)) return "code";
  }

  const analysisPatterns = [
    /\b(analyze|architecture|design|pattern|trade.?off|system|scalab|complex|optim|performance|bottleneck|approach|strategy|compare|evaluat|assess|review|audit)\b/,
  ];
  for (const p of analysisPatterns) {
    if (p.test(lower)) return "analysis";
  }

  const chatPatterns = [
    /\b(translate|translation|hello|hi |hey |what is|tell me|explain|describe|what does|how do|summary|quick|fast)\b/,
  ];
  for (const p of chatPatterns) {
    if (p.test(lower)) return "chat";
  }

  const creativePatterns = [
    /\b(write|create|draft|generate|compose|story|email|message|presentation|slide|pitch|proposal|creative|copy|content)\b/,
  ];
  for (const p of creativePatterns) {
    if (p.test(lower)) return "creative";
  }

  return "general";
}

function selectModel(type: RequestType): RouterResult {
  switch (type) {
    case "code":
    case "analysis":
      return {
        provider: "claude",
        model: "claude-sonnet-4-6",
        agentName: "CORTEX-1",
        agentShort: "CORTEX-1",
        requestType: type,
      };
    case "chat":
    case "general":
    default:
      return {
        provider: "gpt",
        model: "gpt-4o",
        agentName: "SWIFT-3",
        agentShort: "SWIFT-3",
        requestType: type,
      };
    case "creative":
      return {
        provider: "gpt",
        model: "gpt-4o",
        agentName: "SWIFT-3",
        agentShort: "SWIFT-3",
        requestType: type,
      };
  }
}

export function routeRequest(userText: string): RouterResult {
  const type = classifyRequest(userText);
  return selectModel(type);
}

type StreamChunk = { content?: string; done?: boolean; error?: string; agent?: RouterResult };

export async function streamWithRouter(
  userMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  systemPrompt: string,
  options: { maxTokens?: number; preferProvider?: ModelProvider } = {},
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  const lastUserMsg = userMessages.filter(m => m.role === "user").pop()?.content ?? "";
  const route = routeRequest(lastUserMsg);

  if (options.preferProvider) {
    route.provider = options.preferProvider;
    if (options.preferProvider === "claude") {
      route.model = "claude-sonnet-4-6";
      route.agentName = "CORTEX-1";
      route.agentShort = "CORTEX-1";
    } else {
      route.model = "gpt-4o";
      route.agentName = "SWIFT-3";
      route.agentShort = "SWIFT-3";
    }
  }

  const maxTokens = options.maxTokens ?? 8192;

  onChunk({ agent: route });

  const tryClaudeStream = async () => {
    const claudeMessages = userMessages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: claudeMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onChunk({ content: event.delta.text });
      }
    }
    onChunk({ done: true });
  };

  const tryGptStream = async () => {
    const gptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter(m => m.role !== "system").map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: maxTokens,
      messages: gptMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) onChunk({ content });
    }
    onChunk({ done: true });
  };

  if (route.provider === "claude") {
    try {
      await tryClaudeStream();
    } catch (err) {
      console.error("Claude failed, falling back to GPT:", err);
      route.provider = "gpt";
      route.model = "gpt-4o";
      route.agentName = "SWIFT-3";
      route.agentShort = "SWIFT-3";
      onChunk({ agent: route });
      try {
        await tryGptStream();
      } catch (fallbackErr) {
        console.error("GPT fallback also failed:", fallbackErr);
        onChunk({ error: "All AI services are temporarily unavailable. Please try again in a moment." });
      }
    }
  } else {
    try {
      await tryGptStream();
    } catch (err) {
      console.error("GPT failed, falling back to Claude:", err);
      route.provider = "claude";
      route.model = "claude-sonnet-4-6";
      route.agentName = "CORTEX-1";
      route.agentShort = "CORTEX-1";
      onChunk({ agent: route });
      try {
        await tryClaudeStream();
      } catch (fallbackErr) {
        console.error("Claude fallback also failed:", fallbackErr);
        onChunk({ error: "All AI services are temporarily unavailable. Please try again in a moment." });
      }
    }
  }
}

export async function checkProviderHealth(): Promise<{
  claude: boolean;
  gpt: boolean;
}> {
  const results = { claude: false, gpt: false };

  await Promise.allSettled([
    (async () => {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
        });
        results.claude = msg.content.length > 0;
      } catch {
        results.claude = false;
      }
    })(),
    (async () => {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          max_completion_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        });
        results.gpt = !!completion.choices[0]?.message?.content;
      } catch {
        results.gpt = false;
      }
    })(),
  ]);

  return results;
}
