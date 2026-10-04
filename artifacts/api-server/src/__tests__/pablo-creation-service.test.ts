import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, notesTable, projectsTable, usersTable } from "@workspace/db";

vi.mock("../lib/internal-ai", () => ({
  completeInternalText: vi.fn(),
}));

import { completeInternalText } from "../lib/internal-ai";
import {
  generateWorkspaceProjectDraft,
  getWorkspaceProjectDraftStatus,
} from "../lib/pablo-creation-service";

const prototype = `<!doctype html><html><head><title>Offline prototype</title></head>
<body><main><h1>Project draft</h1><button id="go">Continue</button>
<p id="state">Ready</p></main><script>
document.querySelector("#go").onclick = () => { document.querySelector("#state").textContent = "Updated"; };
</script></body></html>`;
const plan = "First milestone: make the core interaction work. Then review the layout and revise it with owner feedback.";

describe("workspace project draft service", () => {
  const email = `pablo-creation-${randomUUID()}@example.test`;
  let userId = "";
  let projectId = 0;

  beforeAll(async () => {
    const [user] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id });
    userId = user.id;
    const [project] = await db.insert(projectsTable).values({
      userId,
      name: "Private draft test",
      type: "general",
      description: "A local-first project.",
    }).returning({ id: projectsTable.id });
    projectId = project.id;
    vi.mocked(completeInternalText).mockResolvedValue({
      content: JSON.stringify({ plan, prototype }),
      provider: "gpt",
    });
  });

  afterAll(async () => {
    if (projectId) await db.delete(notesTable).where(eq(notesTable.projectId, projectId));
    if (projectId) await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
    if (userId) await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it("saves validated automatic drafts and waits for a later owner input update", async () => {
    const first = await generateWorkspaceProjectDraft(userId, projectId, "Draft the first iteration.", "autopilot");
    expect(first.status).toBe("generated");
    expect(await getWorkspaceProjectDraftStatus(userId, projectId)).toBe("unchanged");

    const [contextNote] = await db.insert(notesTable).values({
      userId,
      projectId,
      title: "Next iteration",
      content: "Add a simple progress view.",
      category: "creation-context",
      updatedAt: new Date(Date.now() + 60_000),
    }).returning({ id: notesTable.id });

    expect(await getWorkspaceProjectDraftStatus(userId, projectId)).toBe("ready");
    const second = await generateWorkspaceProjectDraft(userId, projectId, "Apply the latest update.", "autopilot");
    expect(second.status).toBe("generated");
    expect(completeInternalText).toHaveBeenCalledTimes(2);

    const saved = await db.select({
      category: notesTable.category,
      title: notesTable.title,
    }).from(notesTable).where(and(
      eq(notesTable.userId, userId),
      eq(notesTable.projectId, projectId),
    ));
    expect(saved.filter((note) => note.category === "creation-autopilot-plan")).toHaveLength(2);
    expect(saved.filter((note) => note.category === "creation-autopilot-prototype")).toHaveLength(2);
    expect(saved.some((note) => note.category === "creation-context" && note.title === "Next iteration")).toBe(true);
    expect(contextNote.id).toBeGreaterThan(0);
  });

  it("does not reveal or draft a project owned by another user", async () => {
    expect(await getWorkspaceProjectDraftStatus(`${userId}-other`, projectId)).toBe("not_found");
    expect(await generateWorkspaceProjectDraft(`${userId}-other`, projectId, "Try", "autopilot")).toEqual({
      status: "not_found",
    });
  });
});