import { Router, type IRouter } from "express";
import { checkProviderHealth } from "../lib/ai-router";
import { getOpenAiTextModel } from "../lib/openai-models";

const router: IRouter = Router();

const AGENT_DEFINITIONS = [
  {
    id: "cortex-1",
    codeName: "CORTEX-1",
    plainName: "Code Expert",
    specialty: "Deep reasoning, code analysis, and architecture",
    plainSpecialty: "Code help and technical analysis",
    description: "Handles complex coding challenges, architectural decisions, and deep technical analysis. Built for problems that require careful multi-step reasoning.",
    plainDescription: "Your go-to for coding problems and technical deep-dives.",
    provider: "claude" as const,
    model: "claude-sonnet-4-6",
    status: "unknown" as "online" | "offline" | "unknown",
    requestTypes: ["code", "analysis"],
  },
  {
    id: "swift-3",
    codeName: "SWIFT-3",
    plainName: "Quick Assistant",
    specialty: "Fast chat, Q&A, translations, and creative content",
    plainSpecialty: "Quick answers and general chat",
    description: "Optimized for speed and general intelligence. Handles conversational queries, translations, quick Q&A, and creative writing at maximum velocity.",
    plainDescription: "Fast answers for general questions, chat, and creative tasks.",
    provider: "gpt" as const,
    model: getOpenAiTextModel(),
    status: "unknown" as "online" | "offline" | "unknown",
    requestTypes: ["chat", "general", "creative"],
  },
  {
    id: "claw-7",
    codeName: "CLAW-7",
    plainName: "OpenClaw Gateway",
    specialty: "Open-source AI gateway — multi-provider mesh routing",
    plainSpecialty: "Routes through multiple AI providers via OpenClaw",
    description: "Open-source gateway that routes through OpenClaw's multi-provider mesh — DeepSeek, Gemini, Mistral, and local models. When active, takes priority with triple-fallback to CORTEX-1 and SWIFT-3.",
    plainDescription: "An open-source AI gateway that can connect to many different AI providers at once.",
    provider: "openclaw" as const,
    model: "openclaw-gateway",
    status: "unknown" as "online" | "offline" | "unknown",
    requestTypes: ["code", "chat", "analysis", "creative", "general"],
  },
];

router.get("/ai-agents/team", async (_req, res) => {
  try {
    const health = await checkProviderHealth();

    const agents = AGENT_DEFINITIONS.map(agent => ({
      ...agent,
      status: (
        agent.provider === "claude" ? health.claude :
        agent.provider === "openclaw" ? health.openclaw :
        health.gpt
      ) ? "online" : "offline",
    }));

    res.json({ agents });
  } catch (err) {
    console.error("Error fetching agent team:", err);
    const agents = AGENT_DEFINITIONS.map(agent => ({ ...agent, status: "unknown" }));
    res.json({ agents });
  }
});

router.get("/ai-agents/health", async (_req, res) => {
  try {
    const health = await checkProviderHealth();
    res.json({ health });
  } catch (err) {
    console.error("Health check error:", err);
    res.json({ health: { claude: false, gpt: false, openclaw: false } });
  }
});

export default router;
