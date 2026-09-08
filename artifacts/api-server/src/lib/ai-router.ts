import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import WebSocket from "ws";
import { getOpenAiTextModel, OPENAI_FALLBACK_TEXT_MODEL } from "./openai-models";

export type RequestType = "code" | "chat" | "analysis" | "creative" | "general";
export type ModelProvider = "claude" | "gpt" | "openclaw";

export interface RouterResult {
  provider: ModelProvider;
  model: string;
  agentName: string;
  agentShort: string;
  requestType: RequestType;
}

const OPENCLAW_WS_URL = "ws://127.0.0.1:18789";

// Bounded retry helper — wraps a single provider attempt so a transient error
// gets one retry with a short back-off before the cascade falls to the next
// provider. Keeps the overall cascade identical (Openclaw → Claude → GPT);
// this is purely additive resilience, not a rewrite.
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number,
  label: string
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(
          `[ai-router] ${label} attempt ${attempt + 1} failed, retrying in ${delayMs}ms…`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "salaryman-gateway";

let openclawAlive = false;
let lastOpenclawCheck = 0;
const OPENCLAW_CHECK_INTERVAL = 30_000;

async function isOpenclawAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastOpenclawCheck < OPENCLAW_CHECK_INTERVAL) return openclawAlive;
  lastOpenclawCheck = now;

  return new Promise((resolve) => {
    const ws = new WebSocket(OPENCLAW_WS_URL);
    const timer = setTimeout(() => {
      ws.terminate();
      openclawAlive = false;
      resolve(false);
    }, 2000);

    ws.on("open", () => {
      clearTimeout(timer);
      openclawAlive = true;
      ws.close();
      resolve(true);
    });

    ws.on("error", () => {
      clearTimeout(timer);
      openclawAlive = false;
      resolve(false);
    });
  });
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
        model: getOpenAiTextModel(),
        agentName: "SWIFT-3",
        agentShort: "SWIFT-3",
        requestType: type,
      };
    case "creative":
      return {
        provider: "gpt",
        model: getOpenAiTextModel(),
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

async function tryOpenclawStream(
  userMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OPENCLAW_WS_URL);
    let connected = false;
    let responded = false;

    const timer = setTimeout(() => {
      if (!responded) {
        ws.terminate();
        reject(new Error("OpenClaw gateway timeout"));
      }
    }, 30_000);

    ws.on("error", (err) => {
      clearTimeout(timer);
      if (!responded) {
        responded = true;
        reject(err);
      }
    });

    ws.on("close", () => {
      clearTimeout(timer);
      if (!responded) {
        responded = true;
        resolve();
      }
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === "connect.challenge" && !connected) {
          ws.send(JSON.stringify({
            type: "req",
            id: "connect-1",
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: "salaryman-api", version: "1.0.0", platform: "node", mode: "operator" },
              role: "operator",
              auth: { token: OPENCLAW_TOKEN },
            },
          }));
          return;
        }

        if (msg.type === "res" && msg.id === "connect-1") {
          connected = true;
          const lastUser = userMessages.filter(m => m.role === "user").pop()?.content ?? "";
          ws.send(JSON.stringify({
            type: "req",
            id: "chat-1",
            method: "agent.message",
            params: {
              text: lastUser,
              systemPrompt,
              sessionId: "salaryman-" + Date.now(),
            },
          }));
          return;
        }

        if (msg.event === "agent.text" || msg.event === "agent.delta") {
          const text = msg.payload?.text || msg.payload?.delta || "";
          if (text) onChunk({ content: text });
        }

        if (msg.event === "agent.done" || (msg.type === "res" && msg.id === "chat-1")) {
          responded = true;
          clearTimeout(timer);
          onChunk({ done: true });
          ws.close();
          resolve();
        }
      } catch {}
    });
  });
}

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
    } else if (options.preferProvider === "openclaw") {
      route.model = "openclaw-gateway";
      route.agentName = "CLAW-7";
      route.agentShort = "CLAW-7";
    } else {
      route.model = getOpenAiTextModel();
      route.agentName = "SWIFT-3";
      route.agentShort = "SWIFT-3";
    }
  }

  const maxTokens = options.maxTokens ?? 8192;

  const openclawUp = await isOpenclawAvailable();
  if (openclawUp && route.provider !== "openclaw") {
    route.provider = "openclaw";
    route.model = "openclaw-gateway";
    route.agentName = "CLAW-7";
    route.agentShort = "CLAW-7";
  }

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

    const createStream = (model: string) => openai.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: gptMessages,
      stream: true,
    });

    let model = getOpenAiTextModel();
    let stream;
    try {
      stream = await createStream(model);
    } catch (error) {
      if (model === OPENAI_FALLBACK_TEXT_MODEL) throw error;
      console.warn(`[ai-router] ${model} unavailable; falling back to ${OPENAI_FALLBACK_TEXT_MODEL}`);
      model = OPENAI_FALLBACK_TEXT_MODEL;
      route.model = model;
      route.agentName = "SWIFT-3";
      route.agentShort = "SWIFT-3";
      onChunk({ agent: route });
      stream = await createStream(model);
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) onChunk({ content });
    }
    onChunk({ done: true });
  };

  // Each provider gets one retry (500ms delay) before cascading to the next.
  // This absorbs transient hiccups without blocking the user for long.
  const RETRY_COUNT = 1;
  const RETRY_DELAY_MS = 500;

  if (route.provider === "openclaw") {
    try {
      await withRetry(
        () => tryOpenclawStream(userMessages, systemPrompt, maxTokens, onChunk),
        RETRY_COUNT, RETRY_DELAY_MS, "OpenClaw"
      );
    } catch (err) {
      console.error("OpenClaw gateway failed (after retry), falling back to Claude:", err);
      route.provider = "claude";
      route.model = "claude-sonnet-4-6";
      route.agentName = "CORTEX-1";
      route.agentShort = "CORTEX-1";
      onChunk({ agent: route });
      try {
        await withRetry(tryClaudeStream, RETRY_COUNT, RETRY_DELAY_MS, "Claude");
      } catch (claudeErr) {
        console.error("Claude also failed (after retry), falling back to GPT:", claudeErr);
        route.provider = "gpt";
        route.model = getOpenAiTextModel();
        route.agentName = "SWIFT-3";
        route.agentShort = "SWIFT-3";
        onChunk({ agent: route });
        try {
          await withRetry(tryGptStream, RETRY_COUNT, RETRY_DELAY_MS, "GPT");
        } catch (gptErr) {
          console.error("All providers failed (after retries):", gptErr);
          onChunk({ error: "All AI services are temporarily unavailable. Please try again in a moment." });
        }
      }
    }
  } else if (route.provider === "claude") {
    try {
      await withRetry(tryClaudeStream, RETRY_COUNT, RETRY_DELAY_MS, "Claude");
    } catch (err) {
      console.error("Claude failed (after retry), falling back to GPT:", err);
      route.provider = "gpt";
      route.model = getOpenAiTextModel();
      route.agentName = "SWIFT-3";
      route.agentShort = "SWIFT-3";
      onChunk({ agent: route });
      try {
        await withRetry(tryGptStream, RETRY_COUNT, RETRY_DELAY_MS, "GPT");
      } catch (fallbackErr) {
        console.error("GPT fallback also failed (after retry):", fallbackErr);
        onChunk({ error: "All AI services are temporarily unavailable. Please try again in a moment." });
      }
    }
  } else {
    try {
      await withRetry(tryGptStream, RETRY_COUNT, RETRY_DELAY_MS, "GPT");
    } catch (err) {
      console.error("GPT failed (after retry), falling back to Claude:", err);
      route.provider = "claude";
      route.model = "claude-sonnet-4-6";
      route.agentName = "CORTEX-1";
      route.agentShort = "CORTEX-1";
      onChunk({ agent: route });
      try {
        await withRetry(tryClaudeStream, RETRY_COUNT, RETRY_DELAY_MS, "Claude");
      } catch (fallbackErr) {
        console.error("Claude fallback also failed (after retry):", fallbackErr);
        onChunk({ error: "All AI services are temporarily unavailable. Please try again in a moment." });
      }
    }
  }
}

export async function checkProviderHealth(): Promise<{
  claude: boolean;
  gpt: boolean;
  openclaw: boolean;
}> {
  const results = { claude: false, gpt: false, openclaw: false };

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
          model: getOpenAiTextModel(),
          max_completion_tokens: 64,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        });
        results.gpt = !!completion.choices[0]?.message?.content;
      } catch {
        results.gpt = false;
      }
    })(),
    (async () => {
      results.openclaw = await isOpenclawAvailable();
    })(),
  ]);

  return results;
}
