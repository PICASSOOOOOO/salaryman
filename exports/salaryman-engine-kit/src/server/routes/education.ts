import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import {
  db,
  classroomsTable,
  classroomMembersTable,
  classroomLessonsTable,
  classroomAssignmentsTable,
  classroomSubmissionsTable,
  organizationsTable,
  orgMembersTable,
  usersTable,
  type Classroom,
  type ClassroomRole,
  type AssignmentCache,
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

// True when any org the user belongs to (owned or active membership) is flagged
// as an education org. Drives the dynamic "Classroom" vs "Conference" label.
async function userInEducationOrg(userId: string): Promise<boolean> {
  const [owned] = await db
    .select({ isEducation: organizationsTable.isEducation })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.ownerUserId, userId), eq(organizationsTable.isEducation, true)));
  if (owned) return true;
  const [member] = await db
    .select({ isEducation: organizationsTable.isEducation })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(
      and(
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active"),
        eq(organizationsTable.isEducation, true),
      ),
    );
  return !!member;
}

// ── GET /api/education/label — dynamic feature label for the live-session /
// classroom area. Education orgs see "Classroom"; everyone else "Conference". ──
router.get("/education/label", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isEducation = await userInEducationOrg(userId);
    res.json({ isEducation, label: isEducation ? "Classroom" : "Conference" });
  } catch (err) {
    console.error("[Education] label error:", err);
    res.json({ isEducation: false, label: "Conference" });
  }
});

// True if the user is an associate of the org (its owner or an active member).
// Joining an org-scoped classroom by code is restricted to org associates so a
// leaked join code can't enroll arbitrary outsiders across orgs.
async function isOrgAssociate(orgId: number, userId: string): Promise<boolean> {
  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (org?.ownerUserId === userId) return true;
  const [om] = await db
    .select({ status: orgMembersTable.status })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)));
  return om?.status === "active";
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
    // Org-scoped classrooms may only be joined by associates of that org, so a
    // leaked join code can't enroll outsiders. (existing != null already covers
    // implicit org admins; this guards plain users with no relationship.)
    if (classroom.orgId != null && !existing && !(await isOrgAssociate(classroom.orgId, userId))) {
      res.status(403).json({ error: "You must be a member of this organization to join its classroom" });
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

    const isTeacher = resolved.role === "teacher";
    const assignmentRows = await db
      .select()
      .from(classroomAssignmentsTable)
      .where(eq(classroomAssignmentsTable.classroomId, id))
      .orderBy(desc(classroomAssignmentsTable.createdAt));
    const assignments = assignmentRows
      .filter((a) => isTeacher || a.published)
      .map((a) => ({
        id: a.id,
        lessonId: a.lessonId,
        title: a.title,
        prompt: a.prompt,
        dueAt: a.dueAt,
        points: a.points,
        published: a.published,
        hasCache: !!a.cache,
        cacheGeneratedAt: a.cacheGeneratedAt,
      }));

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
      assignments,
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
  const { title, content, lessonId, assignmentId, status } = req.body as {
    title?: string; content?: string; lessonId?: number; assignmentId?: number; status?: string;
  };
  const isDraft = status === "draft";
  if (!title || !title.trim() || (!isDraft && (!content || !content.trim()))) {
    res.status(400).json({ error: isDraft ? "Title required" : "Title and content required" });
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
    const values = {
      lessonId: typeof lessonId === "number" ? lessonId : null,
      assignmentId: typeof assignmentId === "number" ? assignmentId : null,
      studentName: displayName,
      title: title.trim().slice(0, 200),
      content: (content ?? "").slice(0, 50000),
      status: isDraft ? "draft" : "submitted",
    };

    // When tied to an assignment, reuse the student's existing draft so editing a
    // draft and turning it in doesn't pile up duplicate rows. A graded row is
    // never overwritten by a new submission.
    if (typeof assignmentId === "number") {
      const [existing] = await db
        .select()
        .from(classroomSubmissionsTable)
        .where(and(
          eq(classroomSubmissionsTable.classroomId, id),
          eq(classroomSubmissionsTable.studentUserId, userId),
          eq(classroomSubmissionsTable.assignmentId, assignmentId),
          inArray(classroomSubmissionsTable.status, ["draft", "submitted"]),
        ))
        .orderBy(desc(classroomSubmissionsTable.createdAt));
      if (existing) {
        const [submission] = await db
          .update(classroomSubmissionsTable)
          .set({ ...values, lessonId: values.lessonId ?? existing.lessonId })
          .where(eq(classroomSubmissionsTable.id, existing.id))
          .returning();
        res.json({ submission });
        return;
      }
    }

    const [submission] = await db
      .insert(classroomSubmissionsTable)
      .values({ classroomId: id, studentUserId: userId, ...values })
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

  const response = await openai.chat.completions.create(
    {
      model: getOpenAiTextModel(),
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You are an expert academic-integrity analyst assessing whether text was AI-generated. You are careful, calibrated, and avoid false certainty. Respond with valid JSON only — no markdown, no commentary.",
        },
        { role: "user", content: userPrompt },
      ],
    },
    { signal: AbortSignal.timeout(45000) },
  );

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

// ── Assignments ──────────────────────────────────────────────────────────────

// Load an assignment scoped to a classroom, or null.
async function loadAssignment(classroomId: number, assignmentId: number) {
  const [a] = await db
    .select()
    .from(classroomAssignmentsTable)
    .where(and(eq(classroomAssignmentsTable.id, assignmentId), eq(classroomAssignmentsTable.classroomId, classroomId)));
  return a ?? null;
}

// Generate a cached, data-driven homework set from a lesson/prompt via the LLM.
async function generateAssignmentCache(title: string, prompt: string, lessonBody: string): Promise<AssignmentCache> {
  const source = `${lessonBody ? `LESSON MATERIAL:\n${lessonBody.slice(0, 8000)}\n\n` : ""}ASSIGNMENT TITLE: ${title}\nASSIGNMENT PROMPT: ${prompt.slice(0, 4000)}`;
  const userPrompt = `Create a short practice/homework set for students based on the material below.

${source}

Return ONLY valid JSON (no markdown fences) shaped exactly like:
{
  "summary": string (1-2 sentence study summary of what to focus on),
  "questions": [
    { "kind": "mcq", "q": string, "choices": string[4], "answer": string (must equal one choice) },
    { "kind": "short", "q": string, "answer": string (model answer) },
    { "kind": "essay", "q": string }
  ]
}
Produce 5-8 questions mixing the kinds. Keep them grounded in the material.`;

  const response = await openai.chat.completions.create(
    {
      model: getOpenAiTextModel(),
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: "You are a teacher's assistant generating fair, well-scoped practice questions. Respond with valid JSON only — no markdown, no commentary." },
        { role: "user", content: userPrompt },
      ],
    },
    { signal: AbortSignal.timeout(45000) },
  );

  const raw = (response.choices[0]?.message?.content ?? "{}").trim();
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: Partial<AssignmentCache> = {};
  try { parsed = JSON.parse(cleaned) as Partial<AssignmentCache>; } catch { parsed = {}; }
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter((q): q is AssignmentCache["questions"][number] => !!q && typeof q.q === "string")
        .slice(0, 12)
        .map((q): AssignmentCache["questions"][number] => ({
          kind: q.kind === "mcq" || q.kind === "essay" ? q.kind : "short",
          q: String(q.q).slice(0, 1000),
          choices: Array.isArray(q.choices) ? q.choices.filter((c): c is string => typeof c === "string").slice(0, 6) : undefined,
          answer: typeof q.answer === "string" ? q.answer.slice(0, 2000) : undefined,
        }))
    : [];
  return { summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : undefined, questions };
}

// ── POST /api/education/classrooms/:id/assignments — create (teacher) ──
router.post("/education/classrooms/:id/assignments", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const { title, prompt, lessonId, dueAt, points, published } = req.body as {
    title?: string; prompt?: string; lessonId?: number; dueAt?: string; points?: number; published?: boolean;
  };
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Assignment title required" });
    return;
  }
  let due: Date | null = null;
  if (dueAt) { const d = new Date(dueAt); if (!Number.isNaN(d.getTime())) due = d; }
  try {
    const [assignment] = await db
      .insert(classroomAssignmentsTable)
      .values({
        classroomId: classroom.id,
        authorUserId: userId,
        lessonId: typeof lessonId === "number" ? lessonId : null,
        title: title.trim().slice(0, 200),
        prompt: (prompt ?? "").slice(0, 8000) || null,
        dueAt: due,
        points: typeof points === "number" && points >= 0 ? Math.min(Math.round(points), 100000) : 100,
        published: published !== false,
      })
      .returning();
    res.json({ assignment });
  } catch (err) {
    console.error("[Education] assignment create error:", err);
    res.status(500).json({ error: "Failed to create assignment" });
  }
});

// ── DELETE /api/education/classrooms/:id/assignments/:assignmentId — (teacher) ──
router.delete("/education/classrooms/:id/assignments/:assignmentId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isInteger(assignmentId)) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }
  try {
    await db
      .delete(classroomAssignmentsTable)
      .where(and(eq(classroomAssignmentsTable.id, assignmentId), eq(classroomAssignmentsTable.classroomId, classroom.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Education] assignment delete error:", err);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
});

// ── GET /api/education/classrooms/:id/assignments/:assignmentId — detail + cache ──
router.get("/education/classrooms/:id/assignments/:assignmentId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isInteger(id) || !Number.isInteger(assignmentId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const classroom = await loadClassroom(id);
    if (!classroom) { res.status(404).json({ error: "Classroom not found" }); return; }
    const resolved = await resolveRole(classroom, userId);
    if (!resolved) { res.status(403).json({ error: "Not a member of this classroom" }); return; }
    const a = await loadAssignment(id, assignmentId);
    if (!a) { res.status(404).json({ error: "Assignment not found" }); return; }
    const isTeacher = resolved.role === "teacher";
    if (!a.published && !isTeacher) { res.status(403).json({ error: "Assignment not available" }); return; }

    // Students never receive answer keys for the practice cache.
    const cache: AssignmentCache | null = a.cache
      ? isTeacher
        ? a.cache
        : { summary: a.cache.summary, questions: a.cache.questions.map(({ answer, ...rest }) => rest) }
      : null;

    // Include the requesting student's own submission for this assignment (so the
    // client can resume a draft); teachers get all submissions for it.
    const subs = await db
      .select()
      .from(classroomSubmissionsTable)
      .where(isTeacher
        ? and(eq(classroomSubmissionsTable.classroomId, id), eq(classroomSubmissionsTable.assignmentId, assignmentId))
        : and(eq(classroomSubmissionsTable.classroomId, id), eq(classroomSubmissionsTable.assignmentId, assignmentId), eq(classroomSubmissionsTable.studentUserId, userId)))
      .orderBy(desc(classroomSubmissionsTable.createdAt));

    res.json({
      assignment: {
        id: a.id, lessonId: a.lessonId, title: a.title, prompt: a.prompt,
        dueAt: a.dueAt, points: a.points, published: a.published,
        cache, cacheGeneratedAt: a.cacheGeneratedAt,
      },
      submissions: subs,
    });
  } catch (err) {
    console.error("[Education] assignment detail error:", err);
    res.status(500).json({ error: "Failed to load assignment" });
  }
});

// ── POST /api/education/classrooms/:id/assignments/:assignmentId/generate — AI cache (teacher) ──
router.post("/education/classrooms/:id/assignments/:assignmentId/generate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isInteger(assignmentId)) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }
  try {
    const a = await loadAssignment(classroom.id, assignmentId);
    if (!a) { res.status(404).json({ error: "Assignment not found" }); return; }
    let lessonBody = "";
    if (a.lessonId != null) {
      const [lesson] = await db.select().from(classroomLessonsTable).where(eq(classroomLessonsTable.id, a.lessonId));
      lessonBody = lesson?.body ?? "";
    }
    const cache = await generateAssignmentCache(a.title, a.prompt ?? "", lessonBody);
    const [updated] = await db
      .update(classroomAssignmentsTable)
      .set({ cache, cacheGeneratedAt: new Date() })
      .where(eq(classroomAssignmentsTable.id, assignmentId))
      .returning();
    res.json({ assignment: { id: updated.id, cache: updated.cache, cacheGeneratedAt: updated.cacheGeneratedAt } });
  } catch (err) {
    console.error("[Education] assignment generate error:", err);
    res.status(500).json({ error: "Homework generator temporarily unavailable" });
  }
});

// ── POST /api/education/classrooms/:id/submissions/:submissionId/grade — (teacher) ──
router.post("/education/classrooms/:id/submissions/:submissionId/grade", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const classroom = await requireTeacher(req, res, userId);
  if (!classroom) return;
  const submissionId = Number(req.params.submissionId);
  if (!Number.isInteger(submissionId)) {
    res.status(400).json({ error: "Invalid submission id" });
    return;
  }
  const { grade, feedback } = req.body as { grade?: number; feedback?: string };
  if (grade != null && (typeof grade !== "number" || grade < 0)) {
    res.status(400).json({ error: "grade must be a non-negative number" });
    return;
  }
  try {
    const [updated] = await db
      .update(classroomSubmissionsTable)
      .set({
        grade: grade != null ? Math.min(Math.round(grade), 100000) : null,
        feedback: (feedback ?? "").slice(0, 8000) || null,
        status: "graded",
        gradedAt: new Date(),
        gradedByUserId: userId,
      })
      .where(and(eq(classroomSubmissionsTable.id, submissionId), eq(classroomSubmissionsTable.classroomId, classroom.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Submission not found" }); return; }
    res.json({ submission: updated });
  } catch (err) {
    console.error("[Education] grade error:", err);
    res.status(500).json({ error: "Failed to grade submission" });
  }
});

// ── POST /api/education/translate — translate lesson/assignment text (any member) ──
const LANG_NAMES: Record<string, string> = {
  en: "English", vi: "Vietnamese", ja: "Japanese", ko: "Korean",
  zh: "Chinese (Simplified)", es: "Spanish", fr: "French", pt: "Portuguese",
};

router.post("/education/translate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { text, target } = req.body as { text?: string; target?: string };
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Text required" });
    return;
  }
  const targetName = LANG_NAMES[String(target ?? "en")] ?? "English";
  try {
    const response = await openai.chat.completions.create(
      {
        model: getOpenAiTextModel(),
        max_completion_tokens: 2000,
        messages: [
          { role: "system", content: `You are a translator. Translate the user's text into ${targetName}. Preserve meaning, tone, and line breaks. Output ONLY the translation with no quotes, labels, or commentary.` },
          { role: "user", content: text.slice(0, 8000) },
        ],
      },
      { signal: AbortSignal.timeout(30000) },
    );
    const translated = (response.choices[0]?.message?.content ?? "").trim();
    res.json({ translated, target: String(target ?? "en") });
  } catch (err) {
    console.error("[Education] translate error:", err);
    res.status(500).json({ error: "Translation temporarily unavailable" });
  }
});

// ── POST /api/education/translate/free — no-meter conversation translation ──
// This is deliberately separate from the LLM-backed lesson translator above.
// Gemma Translator's reference runtime is a locally operated LiteRT service;
// SALARYMAN's hosted free path uses the public MyMemory service instead of
// pretending that the Gemma model is running in this API process.
const FREE_TRANSLATION_LANGS = new Set([
  "en", "vi", "es", "ja", "zh", "ko", "fr", "pt", "de", "ar", "hi", "id", "th", "ru", "it",
]);

router.post("/education/translate/free", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const body = req.body as { text?: unknown; source?: unknown; target?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const source = typeof body.source === "string" ? body.source : "";
  const target = typeof body.target === "string" ? body.target : "";
  if (!text || text.length > 1600) {
    res.status(400).json({ error: "Text must be between 1 and 1600 characters" });
    return;
  }
  if (!FREE_TRANSLATION_LANGS.has(source) || !FREE_TRANSLATION_LANGS.has(target)) {
    res.status(400).json({ error: "Unsupported language pair" });
    return;
  }
  if (source === target) {
    res.json({ translated: text, source, target, provider: "identity" });
    return;
  }
  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${source}|${target}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      res.status(502).json({ error: "Free translation provider unavailable" });
      return;
    }
    const payload = await response.json() as {
      responseData?: { translatedText?: unknown };
      responseStatus?: number;
    };
    const translated = typeof payload.responseData?.translatedText === "string"
      ? payload.responseData.translatedText.trim()
      : "";
    if (!translated || payload.responseStatus === 403) {
      res.status(502).json({ error: "Free translation provider unavailable" });
      return;
    }
    res.json({ translated, source, target, provider: "mymemory" });
  } catch (err) {
    console.warn("[Education] free translate error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Free translation provider unavailable" });
  }
});

export default router;
