import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  classroomsTable,
  classroomMembersTable,
  classroomLessonsTable,
  classroomSubmissionsTable,
  organizationsTable,
  orgMembersTable,
  usersTable,
  type Classroom,
  type ClassroomRole,
} from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req.user as { id: string } | undefined)?.id;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

// Org roles that resolve to classroom "teacher" implicitly (org admins).
const ORG_ADMIN_ROLES = new Set(["owner", "ceo", "executive"]);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeJoinCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

async function deriveName(userId: string): Promise<string> {
  try {
    const [u] = await db
      .select({ username: usersTable.username, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u) return "MEMBER";
    if (u.username) return u.username;
    const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    if (u.email) return u.email.split("@")[0];
  } catch {
    /* fall through */
  }
  return "MEMBER";
}

// Resolve a user's role within a classroom. Returns null when the user has no
// relationship to the classroom. The creator and org owners/admins resolve to
// "teacher" even without an explicit member row.
async function resolveRole(
  classroom: Classroom,
  userId: string,
): Promise<{ role: ClassroomRole; isMember: boolean } | null> {
  if (classroom.ownerUserId === userId) return { role: "teacher", isMember: true };

  const [member] = await db
    .select()
    .from(classroomMembersTable)
    .where(and(eq(classroomMembersTable.classroomId, classroom.id), eq(classroomMembersTable.userId, userId)));

  // Org admins of the classroom's org are always teachers.
  let isOrgAdmin = false;
  if (classroom.orgId != null) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, classroom.orgId));
    if (org?.ownerUserId === userId) {
      isOrgAdmin = true;
    } else {
      const [om] = await db
        .select({ role: orgMembersTable.role, status: orgMembersTable.status })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, classroom.orgId), eq(orgMembersTable.userId, userId)));
      if (om && om.status === "active" && ORG_ADMIN_ROLES.has(om.role)) isOrgAdmin = true;
    }
  }

  if (member) {
    const role: ClassroomRole = member.role === "teacher" || isOrgAdmin ? "teacher" : "student";
    return { role, isMember: true };
  }
  if (isOrgAdmin) return { role: "teacher", isMember: false };
  return null;
}

async function loadClassroom(id: number): Promise<Classroom | null> {
  const [c] = await db.select().from(classroomsTable).where(eq(classroomsTable.id, id));
  return c ?? null;
}

// Live-lesson signaling gate: a user may join a classroom's live room only if
// they have a relationship to it (member, owner, or org admin). Returns the
// resolved role so the WS layer can decide host vs. viewer if needed.
export async function resolveClassroomLiveAccess(
  classroomId: number,
  userId: string,
): Promise<ClassroomRole | null> {
  const classroom = await loadClassroom(classroomId);
  if (!classroom) return null;
  const resolved = await resolveRole(classroom, userId);
  return resolved?.role ?? null;
}

// The active org the user belongs to (used to scope classroom org access).
async function activeOrgId(userId: string): Promise<number | null> {
  const [owned] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId));
  if (owned) return owned.id;
  const [m] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return m?.orgId ?? null;
}

// ── GET /api/education/classrooms — classrooms the user owns or has joined ──
router.get("/education/classrooms", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const memberRows = await db
      .select({ classroomId: classroomMembersTable.classroomId, role: classroomMembersTable.role })
      .from(classroomMembersTable)
      .where(eq(classroomMembersTable.userId, userId));
    const memberIds = memberRows.map((m) => m.classroomId);

    const owned = await db.select().from(classroomsTable).where(eq(classroomsTable.ownerUserId, userId));
    const joined = memberIds.length
      ? await db.select().from(classroomsTable).where(inArray(classroomsTable.id, memberIds))
      : [];

    const byId = new Map<number, Classroom>();
    for (const c of [...owned, ...joined]) byId.set(c.id, c);

    const ordered = Array.from(byId.values()).sort((a, b) => b.id - a.id);
    const classrooms = await Promise.all(
      ordered.map(async (c) => {
        // resolveRole honors implicit org-admin teachers, not just member rows.
        const resolved = await resolveRole(c, userId);
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          joinCode: c.joinCode,
          ownerUserId: c.ownerUserId,
          liveActive: c.liveActive,
          myRole: resolved?.role ?? "student",
          isOwner: c.ownerUserId === userId,
          createdAt: c.createdAt,
        };
      }),
    );

    res.json({ classrooms });
  } catch (err) {
    console.error("[Education] list error:", err);
    res.status(500).json({ error: "Failed to load classrooms" });
  }
});

// ── POST /api/education/classrooms — create a classroom (caller = teacher) ──
router.post("/education/classrooms", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Classroom name required" });
    return;
  }
  try {
    const orgId = await activeOrgId(userId);
    const displayName = await deriveName(userId);

    // Generate a unique join code with a few retries on collision.
    let created: Classroom | null = null;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const joinCode = makeJoinCode();
      try {
        const [row] = await db
          .insert(classroomsTable)
          .values({
            name: name.trim().slice(0, 120),
            description: (description ?? "").slice(0, 2000) || null,
            joinCode,
            ownerUserId: userId,
            orgId: orgId ?? null,
          })
          .returning();
        created = row;
      } catch (e) {
        if (attempt === 5) throw e;
      }
    }
    if (!created) {
      res.status(500).json({ error: "Failed to create classroom" });
      return;
    }

    await db
      .insert(classroomMembersTable)
      .values({ classroomId: created.id, userId, role: "teacher", displayName })
      .onConflictDoNothing();

    res.json({ classroom: { ...created, myRole: "teacher", isOwner: true } });
  } catch (err) {
    console.error("[Education] create error:", err);
    res.status(500).json({ error: "Failed to create classroom" });
  }
});

// ── POST /api/education/classrooms/join — join by code (as student) ──
router.post("/education/classrooms/join", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "Join code required" });
    return;
  }
  try {
    const normalized = code.trim().toUpperCase();
    const [classroom] = await db.select().from(classroomsTable).where(eq(classroomsTable.joinCode, normalized));
    if (!classroom) {
      res.status(404).json({ error: "No classroom with that code" });
      return;
    }
    const existing = await resolveRole(classroom, userId);
    if (existing?.isMember) {
      res.json({ classroom: { id: classroom.id, name: classroom.name }, role: existing.role, alreadyMember: true });
      return;
    }
    // Implicit org-admin teachers keep their teacher role when joining by code.
    const role: ClassroomRole = existing?.role === "teacher" ? "teacher" : "student";
    const displayName = await deriveName(userId);
    await db
      .insert(classroomMembersTable)
      .values({ classroomId: classroom.id, userId, role, displayName })
      .onConflictDoNothing();
    res.json({ classroom: { id: classroom.id, name: classroom.name }, role });
  } catch (err) {
    console.error("[Education] join error:", err);
    res.status(500).json({ error: "Failed to join classroom" });
  }
});

// ── GET /api/education/classrooms/:id — classroom detail + my role ──
router.get("/education/classrooms/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid classroom id" });
    return;
  }
  try {
    const classroom = await loadClassroom(id);
    if (!classroom) {
      res.status(404).json({ error: "Classroom not found" });
      return;
    }
    const resolved = await resolveRole(classroom, userId);
    if (!resolved) {
      res.status(403).json({ error: "Not a member of this classroom" });
      return;
    }
    const members = await db
      .select()
      .from(classroomMembersTable)
      .where(eq(classroomMembersTable.classroomId, id))
      .orderBy(classroomMembersTable.joinedAt);
    const lessons = await db
      .select()
      .from(classroomLessonsTable)
      .where(eq(classroomLessonsTable.classroomId, id))
      .orderBy(desc(classroomLessonsTable.createdAt));

    res.json({
      classroom: {
        id: classroom.id,
        name: classroom.name,
        description: classroom.description,
        joinCode: classroom.joinCode,
        ownerUserId: classroom.ownerUserId,
        liveActive: classroom.liveActive,
        liveStartedAt: classroom.liveStartedAt,
        liveRoom: `class-${classroom.id}`,
      },
      myRole: resolved.role,
      isOwner: classroom.ownerUserId === userId,
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        displayName: m.displayName,
        joinedAt: m.joinedAt,
      })),
      lessons,
    });
  } catch (err) {
    console.error("[Education] detail error:", err);
    res.status(500).json({ error: "Failed to load classroom" });
  }
});

// Helper: load classroom + require teacher role, else respond and return null.
async function requireTeacher(
  req: Request,
  res: Response,
  userId: string,
): Promise<Classroom | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid classroom id" });
    return null;
  }
  const classroom = await loadClassroom(id);
  if (!classroom) {
    res.status(404).json({ error: "Classroom not found" });
    return null;
  }
  const resolved = await resolveRole(classroom, userId);
  if (!resolved) {
    res.status(403).json({ error: "Not a member of this classroom" });
    return null;
  }
  if (resolved.role !== "teacher") {
    res.status(403).json({ error: "Teacher access required" });
    return null;
  }
  return classroom;
}

// ── POST /api/education/classrooms/:id/members/:userId/role — promote/demote ──
router.post("/education/classrooms/:id/members/:userId/role", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const targetUserId = String(req.params.userId);
  const { role } = req.body as { role?: string };
  if (role !== "teacher" && role !== "student") {
    res.status(400).json({ error: "role must be teacher or student" });
    return;
  }
  if (targetUserId === classroom.ownerUserId) {
    res.status(400).json({ error: "The classroom owner is always a teacher" });
    return;
  }
  try {
    const result = await db
      .update(classroomMembersTable)
      .set({ role })
      .where(and(eq(classroomMembersTable.classroomId, classroom.id), eq(classroomMembersTable.userId, targetUserId)))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json({ ok: true, userId: targetUserId, role });
  } catch (err) {
    console.error("[Education] role error:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// ── POST /api/education/classrooms/:id/lessons — create lesson (teacher) ──
router.post("/education/classrooms/:id/lessons", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const { title, body, resourceUrl } = req.body as { title?: string; body?: string; resourceUrl?: string };
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Lesson title required" });
    return;
  }
  try {
    const [lesson] = await db
      .insert(classroomLessonsTable)
      .values({
        classroomId: classroom.id,
        authorUserId: userId,
        title: title.trim().slice(0, 200),
        body: (body ?? "").slice(0, 20000) || null,
        resourceUrl: (resourceUrl ?? "").slice(0, 1000) || null,
      })
      .returning();
    res.json({ lesson });
  } catch (err) {
    console.error("[Education] lesson create error:", err);
    res.status(500).json({ error: "Failed to create lesson" });
  }
});

// ── DELETE /api/education/classrooms/:id/lessons/:lessonId — (teacher) ──
router.delete("/education/classrooms/:id/lessons/:lessonId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const lessonId = Number(req.params.lessonId);
  if (!Number.isInteger(lessonId)) {
    res.status(400).json({ error: "Invalid lesson id" });
    return;
  }
  try {
    await db
      .delete(classroomLessonsTable)
      .where(and(eq(classroomLessonsTable.id, lessonId), eq(classroomLessonsTable.classroomId, classroom.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Education] lesson delete error:", err);
    res.status(500).json({ error: "Failed to delete lesson" });
  }
});

// ── POST /api/education/classrooms/:id/submissions — submit work (any member) ──
router.post("/education/classrooms/:id/submissions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid classroom id" });
    return;
  }
  const { title, content, lessonId } = req.body as { title?: string; content?: string; lessonId?: number };
  if (!title || !title.trim() || !content || !content.trim()) {
    res.status(400).json({ error: "Title and content required" });
    return;
  }
  try {
    const classroom = await loadClassroom(id);
    if (!classroom) {
      res.status(404).json({ error: "Classroom not found" });
      return;
    }
    const resolved = await resolveRole(classroom, userId);
    if (!resolved) {
      res.status(403).json({ error: "Not a member of this classroom" });
      return;
    }
    const displayName = await deriveName(userId);
    const [submission] = await db
      .insert(classroomSubmissionsTable)
      .values({
        classroomId: id,
        lessonId: typeof lessonId === "number" ? lessonId : null,
        studentUserId: userId,
        studentName: displayName,
        title: title.trim().slice(0, 200),
        content: content.slice(0, 50000),
      })
      .returning();
    res.json({ submission });
  } catch (err) {
    console.error("[Education] submission create error:", err);
    res.status(500).json({ error: "Failed to submit work" });
  }
});

// ── GET /api/education/classrooms/:id/submissions — teacher: all; student: own ──
router.get("/education/classrooms/:id/submissions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid classroom id" });
    return;
  }
  try {
    const classroom = await loadClassroom(id);
    if (!classroom) {
      res.status(404).json({ error: "Classroom not found" });
      return;
    }
    const resolved = await resolveRole(classroom, userId);
    if (!resolved) {
      res.status(403).json({ error: "Not a member of this classroom" });
      return;
    }
    const where = resolved.role === "teacher"
      ? eq(classroomSubmissionsTable.classroomId, id)
      : and(eq(classroomSubmissionsTable.classroomId, id), eq(classroomSubmissionsTable.studentUserId, userId));
    const submissions = await db
      .select()
      .from(classroomSubmissionsTable)
      .where(where)
      .orderBy(desc(classroomSubmissionsTable.createdAt));
    res.json({ submissions });
  } catch (err) {
    console.error("[Education] submissions list error:", err);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

interface CheckResult {
  aiLikelihood: number;
  reasoning: string;
  flaggedPassages: string[];
}

async function runWrittenWordCheck(text: string): Promise<CheckResult> {
  const userPrompt = `Analyze the following student-submitted text for the likelihood that it was written by AI rather than a human. Consider perplexity, burstiness, generic phrasing, lack of personal voice, and over-uniform structure. This is an ASSISTIVE signal, not proof.

TEXT TO ANALYZE:
"""
${text.slice(0, 12000)}
"""

Return ONLY valid JSON (no markdown fences) with exactly these fields:
{
  "aiLikelihood": number (0-100, where 100 = almost certainly AI-written),
  "reasoning": string (2-4 sentences explaining the score),
  "flaggedPassages": string[] (up to 5 short verbatim excerpts that read as AI-generated; empty array if none)
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are an expert academic-integrity analyst assessing whether text was AI-generated. You are careful, calibrated, and avoid false certainty. Respond with valid JSON only — no markdown, no commentary.",
      },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? "{}").trim();
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: Partial<CheckResult> = {};
  try {
    parsed = JSON.parse(cleaned) as Partial<CheckResult>;
  } catch {
    parsed = { reasoning: cleaned };
  }
  let score = typeof parsed.aiLikelihood === "number" ? Math.round(parsed.aiLikelihood) : 0;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return {
    aiLikelihood: score,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning returned.",
    flaggedPassages: Array.isArray(parsed.flaggedPassages)
      ? parsed.flaggedPassages.filter((p): p is string => typeof p === "string").slice(0, 5)
      : [],
  };
}

// ── POST /api/education/classrooms/:id/check — teacher-only AI checker ──
router.post("/education/classrooms/:id/check", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const { text, submissionId } = req.body as { text?: string; submissionId?: number };
  if (!text || typeof text !== "string" || text.trim().length < 20) {
    res.status(400).json({ error: "Provide at least 20 characters of text to analyze" });
    return;
  }
  try {
    const result = await runWrittenWordCheck(text);

    // Optionally persist the result against a submission in this classroom.
    if (typeof submissionId === "number") {
      await db
        .update(classroomSubmissionsTable)
        .set({
          aiScore: result.aiLikelihood,
          aiReasoning: result.reasoning,
          aiFlagged: result.flaggedPassages,
          checkedAt: new Date(),
          checkedByUserId: userId,
        })
        .where(and(eq(classroomSubmissionsTable.id, submissionId), eq(classroomSubmissionsTable.classroomId, classroom.id)));
    }

    res.json({ result, note: "Assistive signal only — not definitive proof of AI authorship." });
  } catch (err) {
    console.error("[Education] check error:", err);
    res.status(500).json({ error: "Checker temporarily unavailable" });
  }
});

// ── POST /api/education/classrooms/:id/live/start — teacher hosts live lesson ──
router.post("/education/classrooms/:id/live/start", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  try {
    await db
      .update(classroomsTable)
      .set({ liveActive: true, liveStartedAt: new Date() })
      .where(eq(classroomsTable.id, classroom.id));
    res.json({ ok: true, liveRoom: `class-${classroom.id}` });
  } catch (err) {
    console.error("[Education] live start error:", err);
    res.status(500).json({ error: "Failed to start live lesson" });
  }
});

// ── POST /api/education/classrooms/:id/live/stop — teacher ends live lesson ──
router.post("/education/classrooms/:id/live/stop", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  try {
    await db
      .update(classroomsTable)
      .set({ liveActive: false, liveStartedAt: null })
      .where(eq(classroomsTable.id, classroom.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Education] live stop error:", err);
    res.status(500).json({ error: "Failed to stop live lesson" });
  }
});

export default router;
