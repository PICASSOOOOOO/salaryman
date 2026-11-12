import { Router, type IRouter, type Request } from "express";
import {
  db,
  agentProjectsTable,
  agentProjectLogsTable,
  botsTable,
  AGENT_PROJECT_STATUSES,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";

const router: IRouter = Router();

function requireAuth(req: Request, res: any): string | null {
  if (!(req as any).isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req as any).user?.id ?? null;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

function parseId(req: Request, res: any): number | null {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  return id;
}

type Status = (typeof AGENT_PROJECT_STATUSES)[number];
function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (AGENT_PROJECT_STATUSES as readonly string[]).includes(v);
}

// GET /api/agent-projects — list the user's build projects (+ recent logs)
router.get("/agent-projects", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const projects = await db
      .select()
      .from(agentProjectsTable)
      .where(eq(agentProjectsTable.userId, userId))
      .orderBy(desc(agentProjectsTable.updatedAt));

    const ids = projects.map((p) => p.id);
    const logs = ids.length
      ? await db
          .select()
          .from(agentProjectLogsTable)
          .where(inArray(agentProjectLogsTable.projectId, ids))
          .orderBy(desc(agentProjectLogsTable.createdAt))
      : [];
    const logsByProject: Record<number, typeof logs> = {};
    for (const l of logs) {
      (logsByProject[l.projectId] ||= []).push(l);
    }
    res.json({
      projects: projects.map((p) => ({ ...p, logs: (logsByProject[p.id] ?? []).slice(0, 8) })),
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST /api/agent-projects — create a venture. Office is required by design.
router.post("/agent-projects", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { name, goal, officeLabel, assignedBotId } = req.body ?? {};
  if (!name?.trim()) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  if (!officeLabel?.trim()) {
    res.status(400).json({ error: "Every venture needs an office or property" });
    return;
  }
  try {
    let botId: number | null = null;
    if (assignedBotId != null) {
      const [bot] = await db
        .select({ id: botsTable.id })
        .from(botsTable)
        .where(and(eq(botsTable.id, Number(assignedBotId)), eq(botsTable.ownerId, userId)));
      if (bot) botId = bot.id;
    }
    const [project] = await db
      .insert(agentProjectsTable)
      .values({
        userId,
        name: name.trim(),
        goal: (goal ?? "").trim(),
        officeLabel: officeLabel.trim(),
        requiresOffice: true,
        assignedBotId: botId,
        status: "planning",
      })
      .returning();
    await db.insert(agentProjectLogsTable).values({
      projectId: project.id,
      kind: "system",
      message: `Venture founded at ${project.officeLabel}.`,
    });
    res.status(201).json({ project: { ...project, logs: [] } });
  } catch (e) {
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PUT /api/agent-projects/:id — update status / progress / assignment / goal
router.put("/agent-projects/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseId(req, res);
  if (id === null) return;
  const { name, goal, status, progressPct, officeLabel, assignedBotId } = req.body ?? {};
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (goal !== undefined) updates.goal = String(goal).trim();
    if (officeLabel !== undefined) updates.officeLabel = String(officeLabel).trim();
    if (status !== undefined && isStatus(status)) updates.status = status;
    if (progressPct !== undefined) {
      updates.progressPct = Math.max(0, Math.min(100, Math.round(Number(progressPct))));
    }
    if (assignedBotId !== undefined) {
      if (assignedBotId === null) {
        updates.assignedBotId = null;
      } else {
        const [bot] = await db
          .select({ id: botsTable.id })
          .from(botsTable)
          .where(and(eq(botsTable.id, Number(assignedBotId)), eq(botsTable.ownerId, userId)));
        updates.assignedBotId = bot ? bot.id : null;
      }
    }
    const [project] = await db
      .update(agentProjectsTable)
      .set(updates)
      .where(and(eq(agentProjectsTable.id, id), eq(agentProjectsTable.userId, userId)))
      .returning();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project });
  } catch (e) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

// POST /api/agent-projects/:id/log — append a progress log entry
router.post("/agent-projects/:id/log", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseId(req, res);
  if (id === null) return;
  const { message, kind } = req.body ?? {};
  if (!message?.trim()) {
    res.status(400).json({ error: "Message required" });
    return;
  }
  try {
    const [project] = await db
      .select({ id: agentProjectsTable.id })
      .from(agentProjectsTable)
      .where(and(eq(agentProjectsTable.id, id), eq(agentProjectsTable.userId, userId)));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [log] = await db
      .insert(agentProjectLogsTable)
      .values({
        projectId: id,
        kind: kind === "milestone" ? "milestone" : "update",
        message: String(message).trim(),
      })
      .returning();
    await db
      .update(agentProjectsTable)
      .set({ updatedAt: new Date() })
      .where(eq(agentProjectsTable.id, id));
    res.status(201).json({ log });
  } catch (e) {
    res.status(500).json({ error: "Failed to add log" });
  }
});

// DELETE /api/agent-projects/:id
router.delete("/agent-projects/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseId(req, res);
  if (id === null) return;
  try {
    await db
      .delete(agentProjectsTable)
      .where(and(eq(agentProjectsTable.id, id), eq(agentProjectsTable.userId, userId)));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// POST /api/agent-projects/briefing — Pablo reviews all ventures and writes a spoken status report
router.post("/agent-projects/briefing", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const projects = await db
      .select()
      .from(agentProjectsTable)
      .where(eq(agentProjectsTable.userId, userId))
      .orderBy(desc(agentProjectsTable.updatedAt));

    const botIds = projects.map((p) => p.assignedBotId).filter((b): b is number => b != null);
    const bots = botIds.length
      ? await db.select({ id: botsTable.id, name: botsTable.name }).from(botsTable).where(inArray(botsTable.id, botIds))
      : [];
    const botName = (id: number | null) => (id == null ? "no agent assigned" : bots.find((b) => b.id === id)?.name ?? "an agent");

    const playerName = (req as any).user?.name || (req as any).user?.playerName || "boss";

    if (projects.length === 0) {
      const briefing = `Status report for ${playerName}. The deck is quiet. You have no ventures running yet. Found one, give it an office, and put an agent on it — then I'll have something worth reporting.`;
      res.json({ briefing, projectCount: 0 });
      return;
    }

    const ledger = projects
      .map(
        (p) =>
          `- "${p.name}" — goal: ${p.goal || "(unspecified)"}; status: ${p.status}; progress: ${p.progressPct}%; office: ${p.officeLabel || "NONE"}; agent: ${botName(p.assignedBotId)}`,
      )
      .join("\n");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content:
          "You are PABLO, the cigar-chewing AI mogul who runs the Command Deck in the game SALARYMAN. " +
          "You speak in short, punchy, confident sentences — like a mob boss who also happens to be a venture capitalist. " +
          "You are delivering a SPOKEN status briefing that will be read aloud by a voice engine, so write it to be spoken: no markdown, no bullet points, no headers, no emojis. " +
          "Give a tight verbal report: open by addressing the boss, summarize the portfolio (how many ventures, overall momentum), call out the standout and the laggard, mention any venture missing an agent or stalled, then close with one concrete next move. Keep it under 160 words.",
      },
      {
        role: "user",
        content: `Boss name: ${playerName}\nHere are my ventures on the deck:\n${ledger}\n\nGive me the spoken briefing.`,
      },
    ];

    let briefing = "";
    try {
      const completion = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        messages,
        max_completion_tokens: 700,
      });
      briefing = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (e) {
      briefing = "";
    }

    if (!briefing) {
      const live = projects.filter((p) => p.status === "live").length;
      const building = projects.filter((p) => p.status === "building").length;
      briefing = `Status report for ${playerName}. You're running ${projects.length} ventures — ${live} live, ${building} in build. Keep the agents working and the rent paid. We push.`;
    }

    const top = projects[0];
    await db.insert(agentProjectLogsTable).values({
      projectId: top.id,
      kind: "pablo",
      message: briefing,
    });
    await db
      .update(agentProjectsTable)
      .set({ lastBriefing: briefing, lastBriefingAt: new Date() })
      .where(and(eq(agentProjectsTable.userId, userId), eq(agentProjectsTable.id, top.id)));

    res.json({ briefing, projectCount: projects.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate briefing" });
  }
});

export default router;
