import {
  db,
  notesTable,
  projectsTable,
  type Note,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { completeInternalText } from "./internal-ai";
import {
  buildPabloCreationUserPrompt,
  hasProjectInputsChanged,
  parseGeneratedWorkspaceDraft,
  PABLO_CREATION_SYSTEM_PROMPT,
} from "./pablo-creation";

const CREATION_SOURCE_CATEGORIES = ["creation-context", "external-reference"] as const;

type DraftMode = "manual" | "autopilot";

interface DraftSnapshot {
  project: {
    id: number;
    name: string;
    type: string;
    description: string;
    updatedAt: Date;
  };
  materials: Array<{
    title: string;
    category: string;
    content: string;
    updatedAt: Date;
  }>;
  latestAutopilotDraftUpdatedAt: Date | null;
}

export type WorkspaceProjectDraftStatus = "not_found" | "unchanged" | "ready";

export type WorkspaceProjectDraftResult =
  | { status: "not_found" }
  | { status: "unchanged" }
  | { status: "invalid"; provider: string }
  | { status: "generated"; plan: Note; prototype: Note; provider: string };

async function loadDraftSnapshot(userId: string, projectId: number): Promise<DraftSnapshot | null> {
  const [project] = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      type: projectsTable.type,
      description: projectsTable.description,
      updatedAt: projectsTable.updatedAt,
    })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!project) return null;

  const [materials, latestAutopilotDraft] = await Promise.all([
    db
      .select({
        title: notesTable.title,
        category: notesTable.category,
        content: notesTable.content,
        updatedAt: notesTable.updatedAt,
      })
      .from(notesTable)
      .where(and(
        eq(notesTable.userId, userId),
        eq(notesTable.projectId, projectId),
        inArray(notesTable.category, [...CREATION_SOURCE_CATEGORIES]),
      ))
      .orderBy(desc(notesTable.updatedAt))
      .limit(8),
    db
      .select({ updatedAt: notesTable.updatedAt })
      .from(notesTable)
      .where(and(
        eq(notesTable.userId, userId),
        eq(notesTable.projectId, projectId),
        eq(notesTable.category, "creation-autopilot-plan"),
      ))
      .orderBy(desc(notesTable.updatedAt))
      .limit(1),
  ]);

  return {
    project,
    materials,
    latestAutopilotDraftUpdatedAt: latestAutopilotDraft[0]?.updatedAt ?? null,
  };
}

function snapshotHasNewInputs(snapshot: DraftSnapshot): boolean {
  return hasProjectInputsChanged(
    snapshot.project.updatedAt,
    snapshot.materials[0]?.updatedAt ?? null,
    snapshot.latestAutopilotDraftUpdatedAt,
  );
}

/** Checks project ownership and whether new owner-authored input warrants another automatic draft. */
export async function getWorkspaceProjectDraftStatus(
  userId: string,
  projectId: number,
): Promise<WorkspaceProjectDraftStatus> {
  const snapshot = await loadDraftSnapshot(userId, projectId);
  if (!snapshot) return "not_found";
  return snapshotHasNewInputs(snapshot) ? "ready" : "unchanged";
}

/** Shared generator and note persistence for both the manual and scheduled paths. */
export async function generateWorkspaceProjectDraft(
  userId: string,
  projectId: number,
  brief: string,
  mode: DraftMode = "manual",
): Promise<WorkspaceProjectDraftResult> {
  const snapshot = await loadDraftSnapshot(userId, projectId);
  if (!snapshot) return { status: "not_found" };
  if (mode === "autopilot" && !snapshotHasNewInputs(snapshot)) return { status: "unchanged" };

  const completion = await completeInternalText([
    { role: "system", content: PABLO_CREATION_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildPabloCreationUserPrompt({
        name: snapshot.project.name,
        type: snapshot.project.type,
        description: snapshot.project.description,
        brief,
        materials: snapshot.materials,
        task: mode === "autopilot"
          ? "Create one focused, review-only project plan and offline prototype based on the owner's latest project update."
          : undefined,
      }),
    },
  ], { maxTokens: 5_000, json: true, prefer: "gpt" });

  const draft = parseGeneratedWorkspaceDraft(completion.content);
  if (!draft) return { status: "invalid", provider: completion.provider };

  const automated = mode === "autopilot";
  const [plan, prototype] = await db.transaction(async (tx) => {
    const [planNote] = await tx.insert(notesTable).values({
      userId,
      projectId,
      title: automated ? "Auto-draft plan" : "Build plan",
      content: draft.plan,
      category: automated ? "creation-autopilot-plan" : "creation-plan",
    }).returning();
    const [prototypeNote] = await tx.insert(notesTable).values({
      userId,
      projectId,
      title: automated ? "Auto-draft index.html" : "index.html",
      content: draft.prototype,
      category: automated ? "creation-autopilot-prototype" : "creation-prototype",
    }).returning();
    return [planNote, prototypeNote];
  });

  return { status: "generated", plan, prototype, provider: completion.provider };
}