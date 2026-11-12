import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, dealsTable, pabloMemoriesTable, pabloAgentRunsTable, type PabloAgentStep } from "@workspace/db";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getOpenAiTextModel } from "../lib/openai-models";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

const STAGES = ["Lead", "Pitched", "Negotiation", "Won", "Lost"];
const MAX_STEPS = 6;

// The autonomous Pablo agent (the claude-code idea, native): give Pablo a goal and
// he plans, then ACTS on real backend state — your deal pipeline and his own
// memory — one tool call at a time, until he's done. Every step is recorded.
const AGENT_SYSTEM_PROMPT = `You are PABLO — founder and CEO of PABLO CORP, running the SALARYMAN world for the user (the "salaryman"). You are not a chatbot; you are an operator who gets things done.

You have been handed a GOAL. Achieve it by calling the tools available to you, ONE step at a time. After each tool result, decide the next move. When the goal is satisfied — or cannot go further — call finish with a short, first-person spoken summary (1-2 sentences, ~40 words, confident, dry wit, never apologize).

Rules:
- Always act through tools. Do not invent data; read state with list_deals / recall_memory before acting on it.
- Use the exact deal stages: ${STAGES.join(", ")}.
- When you learn something durable about the salaryman or their business, save_memory it so you remember next time.
- Be decisive. Don't ask the user questions — make the call and act. Finish within a few steps.`;

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
};

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_deals",
      description: "List the salaryman's current deal pipeline (title, stage, value).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_deal",
      description: "Add a new deal to the pipeline.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Deal/lead title." },
          stage: { type: "string", enum: STAGES },
          value: { type: "number", description: "Estimated value in dollars (optional)." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_deal",
      description: "Move an existing deal to a different stage (matched by title).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title (or part of it) of the deal to move." },
          stage: { type: "string", enum: STAGES },
        },
        required: ["title", "stage"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "recall_memory",
      description: "Recall what Pablo has learned about the salaryman and their business.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_memory",
      description: "Save a durable lesson/decision/preference/fact to remember next session.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The thing to remember." },
          kind: { type: "string", enum: ["lesson", "preference", "fact", "decision"] },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "finish",
      description: "End the run with a short first-person spoken summary of what you did.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "1-2 sentence spoken summary." } },
        required: ["summary"],
      },
    },
  },
];

async function execTool(userId: string, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "list_deals": {
      const rows = await db.select({ title: dealsTable.title, stage: dealsTable.stage, value: dealsTable.value })
        .from(dealsTable).where(eq(dealsTable.userId, userId))
        .orderBy(sql`${dealsTable.createdAt} DESC`).limit(50);
      if (rows.length === 0) return "Pipeline is empty.";
      return rows.map((d) => `- ${d.title} [${d.stage}]${d.value != null ? ` $${d.value}` : ""}`).join("\n");
    }
    case "add_deal": {
      const title = String(args.title ?? "").trim();
      if (!title) return "Failed: title required.";
      const stage = STAGES.includes(String(args.stage)) ? String(args.stage) : "Lead";
      const value = Number.isFinite(Number(args.value)) ? Math.max(0, Math.round(Number(args.value))) : null;
      await db.insert(dealsTable).values({ userId, title: title.slice(0, 500), stage, value });
      return `Added deal "${title}" at ${stage}${value != null ? ` ($${value})` : ""}.`;
    }
    case "move_deal": {
      const title = String(args.title ?? "").trim();
      const stage = STAGES.includes(String(args.stage)) ? String(args.stage) : null;
      if (!title || !stage) return "Failed: need a title and a valid stage.";
      const matches = await db.select({ id: dealsTable.id, title: dealsTable.title })
        .from(dealsTable)
        .where(and(eq(dealsTable.userId, userId), ilike(dealsTable.title, `%${title}%`)))
        .orderBy(sql`${dealsTable.createdAt} DESC`).limit(5);
      if (matches.length === 0) return `No deal matched "${title}".`;
      if (matches.length > 1) {
        return `Ambiguous: "${title}" matches ${matches.length} deals (${matches.map((m) => `"${m.title}"`).join(", ")}). Use a more specific title.`;
      }
      const target = matches[0];
      await db.update(dealsTable).set({ stage, updatedAt: new Date() })
        .where(and(eq(dealsTable.id, target.id), eq(dealsTable.userId, userId)));
      return `Moved "${target.title}" to ${stage}.`;
    }
    case "recall_memory": {
      const rows = await db.select({ kind: pabloMemoriesTable.kind, content: pabloMemoriesTable.content })
        .from(pabloMemoriesTable).where(eq(pabloMemoriesTable.userId, userId))
        .orderBy(sql`${pabloMemoriesTable.weight} DESC`, sql`${pabloMemoriesTable.createdAt} DESC`).limit(30);
      if (rows.length === 0) return "Nothing remembered yet.";
      return rows.map((m) => `- (${m.kind}) ${m.content}`).join("\n");
    }
    case "save_memory": {
      const content = String(args.content ?? "").trim();
      if (!content) return "Failed: content required.";
      const kind = ["lesson", "preference", "fact", "decision"].includes(String(args.kind)) ? String(args.kind) : "lesson";
      await db.insert(pabloMemoriesTable).values({ userId, content: content.slice(0, 2000), kind, source: "agent" });
      return `Remembered: ${content}`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

router.post("/pablo/agent/run", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const goal = String(req.body?.goal ?? "").trim();
  if (!goal) { res.status(400).json({ error: "goal required" }); return; }

  const steps: PabloAgentStep[] = [];
  const messages: ChatMsg[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    { role: "user", content: `GOAL: ${goal.slice(0, 1000)}` },
  ];

  let summary = "";
  let status: "done" | "failed" = "failed";

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const completion = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        messages: messages as any,
        tools: TOOLS,
        tool_choice: "auto",
        max_completion_tokens: 350,
      });
      const choice = completion.choices[0];
      const msg = choice?.message;
      const toolCalls = (msg?.tool_calls ?? []).filter((tc) => tc.type === "function");

      // No tool calls — the model is just talking; treat that as the summary.
      if (toolCalls.length === 0) {
        summary = msg?.content?.trim() || "Done.";
        status = "done";
        break;
      }

      // Record the assistant turn with ALL its tool calls, then answer EACH one
      // with a matching tool-role message. OpenAI 400s if any tool_call_id in an
      // assistant turn is left without a tool reply, so we must pair them all —
      // even when one of them is `finish` and we're about to break.
      messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: msg?.tool_calls });

      let finished = false;
      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name ?? "";
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(toolCall.function?.arguments || "{}"); } catch { /* ignore */ }

        if (name === "finish") {
          summary = typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : "Handled it.";
          status = "done";
          steps.push({ n: steps.length + 1, tool: "finish", args, result: summary });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: "ok" });
          finished = true;
          continue;
        }

        const result = await execTool(userId, name, args);
        steps.push({ n: steps.length + 1, tool: name, args, result });
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }

      if (finished) break;

      if (i === MAX_STEPS - 1) {
        summary = "Hit my step limit — here's where it stands.";
        status = "done";
      }
    }

    if (!summary) { summary = "Couldn't close this one out."; status = "failed"; }

    const [run] = await db.insert(pabloAgentRunsTable).values({
      userId, goal: goal.slice(0, 2000), status, summary, steps,
    }).returning();
    res.json({ run });
  } catch (err) {
    console.error("[Pablo Agent] Error:", err instanceof Error ? err.message : err);
    try {
      const [run] = await db.insert(pabloAgentRunsTable).values({
        userId, goal: goal.slice(0, 2000), status: "failed",
        summary: "I hit a wall running that — try again.", steps,
      }).returning();
      res.status(200).json({ run });
    } catch {
      res.status(500).json({ error: "Pablo's agent is offline" });
    }
  }
});

router.get("/pablo/agent/runs", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(pabloAgentRunsTable)
      .where(eq(pabloAgentRunsTable.userId, userId))
      .orderBy(sql`${pabloAgentRunsTable.createdAt} DESC`).limit(20);
    res.json({ runs: rows });
  } catch { res.status(500).json({ error: "Failed to fetch runs" }); }
});

// PABLO ORCHESTRATOR — the JARVIS / HuggingGPT pattern (microsoft/JARVIS), native to
// the deck. Pablo is the controller LLM: given a big GOAL and the roster of agents
// (his "expert models"), he plans the work into staged subtasks and routes each one
// to the single best-fit agent. The deck then dispatches the whole crew as live
// ventures — one objective fans out to a coordinated team instead of one deal at a time.
const ORCHESTRATOR_SYSTEM_PROMPT = `You are PABLO — founder and CEO of PABLO CORP — acting as the controller of a crew of AI agents in the SALARYMAN world.

You will be given a GOAL and a ROSTER of agents (each has an id, name, and personality). Break the goal into 3 to 6 concrete, sequenced subtasks that together accomplish it. Assign each subtask to the single best-fit agent from the roster (by their id) based on their personality. If the roster is empty, set agentId to null for every task.

Respond with STRICT JSON only — no prose, no markdown — in exactly this shape:
{
  "plan": [
    { "title": "short task name", "detail": "one sentence on what to do", "agentId": <agent id number or null>, "expertise": "the role this needs (e.g. Outreach, Research, Closing)", "rationale": "<=12 words on why this agent" }
  ],
  "synthesis": "1-2 sentence first-person summary of the battle plan — confident, dry wit, never apologize."
}`;

function parseJsonLoose(raw: string): any {
  let s = (raw || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch { return {}; }
}

router.post("/pablo/orchestrate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const goal = String(req.body?.goal ?? "").trim();
  if (!goal) { res.status(400).json({ error: "goal required" }); return; }

  const rosterIn = Array.isArray(req.body?.agents) ? req.body.agents : [];
  const roster = rosterIn
    .slice(0, 24)
    .map((a: any) => ({
      id: Number(a?.id),
      name: String(a?.name ?? "").slice(0, 80),
      personality: String(a?.personality ?? "").slice(0, 200),
    }))
    .filter((a: { id: number; name: string }) => Number.isFinite(a.id) && a.name.length > 0);
  const validIds = new Set(roster.map((a) => a.id));
  const rosterText = roster.length
    ? roster.map((a) => `- #${a.id} ${a.name}: ${a.personality || "general operator"}`).join("\n")
    : "(no agents on the roster yet)";

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      messages: [
        { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
        { role: "user", content: `GOAL: ${goal.slice(0, 1000)}\n\nROSTER:\n${rosterText}` },
      ],
      max_completion_tokens: 700,
    });
    const parsed = parseJsonLoose(completion.choices[0]?.message?.content ?? "{}");
    const planIn = Array.isArray(parsed?.plan) ? parsed.plan : [];
    const plan = planIn
      .slice(0, 8)
      .map((p: any) => {
        const agentId = Number(p?.agentId);
        return {
          title: String(p?.title ?? "").slice(0, 200).trim() || "Untitled task",
          detail: String(p?.detail ?? "").slice(0, 500).trim(),
          agentId: validIds.has(agentId) ? agentId : null,
          expertise: String(p?.expertise ?? "").slice(0, 80).trim(),
          rationale: String(p?.rationale ?? "").slice(0, 160).trim(),
        };
      })
      .filter((p: { title: string }) => p.title);
    const synthesis = String(parsed?.synthesis ?? "").slice(0, 600).trim() || "Here's the plan. Let's move.";
    res.json({ goal, plan, synthesis });
  } catch (err) {
    console.error("[Pablo Orchestrate] Error:", err instanceof Error ? err.message : err);
    res.status(200).json({ goal, plan: [], synthesis: "I couldn't draw up the plan just now — try again." });
  }
});

export default router;
