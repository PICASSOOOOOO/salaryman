import { Router, type IRouter } from "express";
import { checkProviderHealth } from "../lib/ai-router";

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
    model: "gpt-4o",
    status: "unknown" as "online" | "offline" | "unknown",
    requestTypes: ["chat", "general", "creative"],
  },
];

router.get("/ai-agents/team", async (_req, res) => {
  try {
    const health = await checkProviderHealth();

    const agents = AGENT_DEFINITIONS.map(agent => ({
      ...agent,
      status: (agent.provider === "claude" ? health.claude : health.gpt) ? "online" : "offline",
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
    res.json({ health: { claude: false, gpt: false } });
  }
});

export default router;
