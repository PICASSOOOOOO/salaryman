import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pabloGithubChangesTable,
  pabloGithubConnectionsTable,
  usersTable,
} from "@workspace/db";
import githubRepositoriesRouter from "../routes/github-repositories";
import { readGithubRepositoryFile, proposeGithubRepositoryChange } from "../lib/pablo-github";

const USER_A = { id: `github-repo-user-a-${randomUUID()}`, email: `repo-a-${randomUUID()}@example.test` };
const USER_B = { id: `github-repo-user-b-${randomUUID()}`, email: `repo-b-${randomUUID()}@example.test` };
const USER_IDS = [USER_A.id, USER_B.id];
const REPO_A = { id: "101", fullName: "user-a/private-repo", defaultBranch: "main", private: true };
const REPO_B = { id: "202", fullName: "user-b/other-repo", defaultBranch: "trunk", private: true };
const CHANGE_A_ID = randomUUID();
const CHANGE_B_ID = randomUUID();
const CHANGE_A_HASH = "a".repeat(64);
const CHANGE_B_HASH = "b".repeat(64);
const authState = { authenticated: false, userId: USER_A.id };
let app: Express;

function mockGithubRepositoriesByToken() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const authorization = new Headers(init?.headers).get("Authorization");
    const repositories = authorization === "Bearer user-a-token"
      ? [{ id: 101, full_name: REPO_A.fullName, default_branch: REPO_A.defaultBranch, private: true, permissions: { push: true } }]
      : authorization === "Bearer user-b-token"
        ? [{ id: 202, full_name: REPO_B.fullName, default_branch: REPO_B.defaultBranch, private: true, permissions: { push: true } }]
        : [];
    return new Response(JSON.stringify(repositories), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

async function seedConnectionsAndChanges() {
  await db.delete(pabloGithubChangesTable).where(inArray(pabloGithubChangesTable.userId, USER_IDS));
  await db.delete(pabloGithubConnectionsTable).where(inArray(pabloGithubConnectionsTable.userId, USER_IDS));
  await db.insert(pabloGithubConnectionsTable).values([
    {
      userId: USER_A.id,
      githubUserId: "github-user-a",
      githubLogin: "user-a",
      encryptedCredentials: JSON.stringify({ accessToken: "user-a-token" }),
      selectedRepositories: [REPO_A],
    },
    {
      userId: USER_B.id,
      githubUserId: "github-user-b",
      githubLogin: "user-b",
      encryptedCredentials: JSON.stringify({ accessToken: "user-b-token" }),
      selectedRepositories: [REPO_B],
    },
  ]);
  await db.insert(pabloGithubChangesTable).values([
    {
      id: CHANGE_A_ID,
      userId: USER_A.id,
      repositoryId: REPO_A.id,
      repositoryFullName: REPO_A.fullName,
      baseBranch: REPO_A.defaultBranch,
      baseSha: "a".repeat(40),
      title: "User A change",
      description: "",
      diffHash: CHANGE_A_HASH,
      encryptedPayload: "{}",
      status: "pending",
    },
    {
      id: CHANGE_B_ID,
      userId: USER_B.id,
      repositoryId: REPO_B.id,
      repositoryFullName: REPO_B.fullName,
      baseBranch: REPO_B.defaultBranch,
      baseSha: "b".repeat(40),
      title: "User B change",
      description: "",
      diffHash: CHANGE_B_HASH,
      encryptedPayload: "{}",
      status: "pending",
    },
  ]);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authenticated;
    (req as unknown as { user: { id: string } }).user = { id: authState.userId };
    next();
  });
  app.use("/api", githubRepositoriesRouter);
  await db.insert(usersTable).values([
    { id: USER_A.id, email: USER_A.email },
    { id: USER_B.id, email: USER_B.email },
  ]).onConflictDoNothing();
  await seedConnectionsAndChanges();
});

beforeEach(async () => {
  authState.authenticated = true;
  authState.userId = USER_A.id;
  vi.restoreAllMocks();
  await seedConnectionsAndChanges();
});

afterAll(async () => {
  authState.authenticated = false;
  vi.restoreAllMocks();
  await db.delete(pabloGithubChangesTable).where(inArray(pabloGithubChangesTable.userId, USER_IDS));
  await db.delete(pabloGithubConnectionsTable).where(inArray(pabloGithubConnectionsTable.userId, USER_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, USER_IDS));
});

describe("GitHub repository access routes", () => {
  it("requires a signed-in session", async () => {
    authState.authenticated = false;
    const response = await request(app).get("/api/github-repositories/changes");
    expect(response.status).toBe(401);
  });

  it("rejects malformed change IDs before querying the database", async () => {
    authState.authenticated = true;
    const response = await request(app).get("/api/github-repositories/changes/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid change identifier.");
  });

  it("lists each signed-in user's own GitHub repositories", async () => {
    mockGithubRepositoriesByToken();

    const userAResponse = await request(app).get("/api/github-repositories/repos");
    expect(userAResponse.status).toBe(200);
    expect(userAResponse.body.items.map((repo: { id: string }) => repo.id)).toEqual([REPO_A.id]);

    authState.userId = USER_B.id;
    const userBResponse = await request(app).get("/api/github-repositories/repos");
    expect(userBResponse.status).toBe(200);
    expect(userBResponse.body.items.map((repo: { id: string }) => repo.id)).toEqual([REPO_B.id]);
  });

  it("does not let a user select or read another user's repository", async () => {
    const fetchSpy = mockGithubRepositoriesByToken();
    authState.userId = USER_B.id;

    const selection = await request(app)
      .put("/api/github-repositories/selection")
      .send({ repositoryIds: [REPO_A.id] });
    expect(selection.status).toBe(400);

    await expect(readGithubRepositoryFile(USER_B.id, REPO_A.id, "README.md"))
      .rejects.toMatchObject({ status: 403 });
    await expect(proposeGithubRepositoryChange(USER_B.id, {
      repositoryId: REPO_A.id,
      title: "Unauthorized change",
      files: [{ path: "README.md", content: "not allowed" }],
    })).rejects.toMatchObject({ status: 403 });

    const [userBConnection] = await db.select().from(pabloGithubConnectionsTable)
      .where(eq(pabloGithubConnectionsTable.userId, USER_B.id));
    expect(userBConnection?.selectedRepositories).toEqual([REPO_B]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("limits change lists, details, approvals, and rejections to the proposal owner", async () => {
    const userAList = await request(app).get("/api/github-repositories/changes");
    expect(userAList.status).toBe(200);
    expect(userAList.body.items.map((change: { repositoryFullName: string }) => change.repositoryFullName))
      .toEqual([REPO_A.fullName]);

    authState.userId = USER_B.id;
    const userBList = await request(app).get("/api/github-repositories/changes");
    expect(userBList.status).toBe(200);
    expect(userBList.body.items.map((change: { repositoryFullName: string }) => change.repositoryFullName))
      .toEqual([REPO_B.fullName]);

    const foreignDetail = await request(app).get(`/api/github-repositories/changes/${CHANGE_A_ID}`);
    expect(foreignDetail.status).toBe(404);
    expect(foreignDetail.body).toEqual({ error: "Change not found." });

    const foreignApproval = await request(app)
      .post(`/api/github-repositories/changes/${CHANGE_A_ID}/approve`)
      .send({ diffHash: CHANGE_A_HASH });
    expect(foreignApproval.status).toBe(404);
    expect(foreignApproval.body).toEqual({ error: "Change not found." });

    const foreignRejection = await request(app)
      .post(`/api/github-repositories/changes/${CHANGE_A_ID}/reject`);
    expect(foreignRejection.status).toBe(409);
    expect(foreignRejection.body).toEqual({ error: "That proposal was not found or is no longer pending." });

    const [userAChange] = await db.select().from(pabloGithubChangesTable)
      .where(and(
        eq(pabloGithubChangesTable.id, CHANGE_A_ID),
        eq(pabloGithubChangesTable.userId, USER_A.id),
      ));
    expect(userAChange?.status).toBe("pending");
  });

  it("disconnects only the signed-in user's repository connection", async () => {
    authState.userId = USER_B.id;
    const response = await request(app).post("/api/github-repositories/disconnect");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disconnected: true });

    const [userAConnection] = await db.select().from(pabloGithubConnectionsTable)
      .where(eq(pabloGithubConnectionsTable.userId, USER_A.id));
    const [userBConnection] = await db.select().from(pabloGithubConnectionsTable)
      .where(eq(pabloGithubConnectionsTable.userId, USER_B.id));
    expect(userAConnection?.githubLogin).toBe("user-a");
    expect(userBConnection).toBeUndefined();
  });
});
