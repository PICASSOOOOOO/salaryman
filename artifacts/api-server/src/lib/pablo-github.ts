import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  pabloGithubChangesTable,
  pabloGithubConnectionsTable,
  type PabloGithubChangeStatus,
  type PabloGithubRepository,
} from "@workspace/db";
import {
  decryptSocialCredentials,
  encryptSocialCredentials,
} from "./social-credentials-crypto";
import { githubApiHeaders } from "./github-auth";

const CREDENTIAL_PROVIDER = "github-repositories";
const MAX_REPOSITORIES = 50;
const MAX_CHANGED_FILES = 10;
const MAX_FILE_BYTES = 40_000;
const MAX_TOTAL_BYTES = 160_000;
const MAX_READ_BYTES = 30_000;
const MAX_MULTI_READ_BYTES = 35_000;
const MAX_READ_FILES = 10;

export class PabloGithubError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PabloGithubError";
  }
}

interface GithubRepositoryApi {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  permissions?: { push?: boolean };
}

interface GithubContentApi {
  type: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
}

interface GithubTreeApi {
  sha: string;
  tree: Array<{ path: string; mode: string; type: string; sha: string }>;
  truncated?: boolean;
}

interface ProposedFile {
  path: string;
  oldContent: string | null;
  newContent: string;
  baseFileSha: string | null;
}
interface FileDraft {
  path: string;
  content: string;
  baseContent?: string | null;
}

interface EncryptedChangePayload {
  diff: string;
  files: ProposedFile[];
}

function githubApiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new PabloGithubError("Invalid GitHub API path.");
  }
  return `https://api.github.com${path}`;
}

async function githubApi<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(githubApiUrl(path), {
    ...init,
    headers: {
      ...githubApiHeaders(accessToken),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new PabloGithubError("GitHub authorization expired or was revoked. Reconnect the repository account.", 409);
    if (status === 403) throw new PabloGithubError("GitHub denied this operation. Check the selected repository's access and permissions.", 403);
    if (status === 404) throw new PabloGithubError("The GitHub resource was not found or is no longer accessible.", 404);
    throw new PabloGithubError(`GitHub returned ${status}. No repository code was executed.`, 502);
  }
  return await response.json() as T;
}

function tokenForConnection(
  userId: string,
  connection: typeof pabloGithubConnectionsTable.$inferSelect,
): string {
  const decrypted = decryptSocialCredentials(
    JSON.parse(connection.encryptedCredentials) as Record<string, string>,
    userId,
    CREDENTIAL_PROVIDER,
  );
  const token = decrypted.credentials.accessToken;
  if (!token) throw new PabloGithubError("The saved GitHub connection has no access token. Reconnect it.", 409);
  return token;
}

export async function saveGithubRepositoryConnection(params: {
  userId: string;
  githubUserId: string;
  githubLogin: string;
  accessToken: string;
}): Promise<void> {
  const [existing] = await db.select().from(pabloGithubConnectionsTable)
    .where(eq(pabloGithubConnectionsTable.userId, params.userId)).limit(1);
  const selectedRepositories = existing?.githubUserId === params.githubUserId
    ? existing.selectedRepositories
    : [];
  const encryptedCredentials = JSON.stringify(encryptSocialCredentials(
    { accessToken: params.accessToken },
    params.userId,
    CREDENTIAL_PROVIDER,
  ));
  await db.insert(pabloGithubConnectionsTable).values({
    userId: params.userId,
    githubUserId: params.githubUserId,
    githubLogin: params.githubLogin,
    encryptedCredentials,
    selectedRepositories,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: pabloGithubConnectionsTable.userId,
    set: {
      githubUserId: params.githubUserId,
      githubLogin: params.githubLogin,
      encryptedCredentials,
      selectedRepositories,
      updatedAt: new Date(),
    },
  });
}

export async function getGithubRepositoryStatus(
  userId: string,
  configured: boolean,
) {
  const [connection] = await db.select({
    githubLogin: pabloGithubConnectionsTable.githubLogin,
    selectedRepositories: pabloGithubConnectionsTable.selectedRepositories,
  }).from(pabloGithubConnectionsTable)
    .where(eq(pabloGithubConnectionsTable.userId, userId)).limit(1);
  return {
    configured,
    connected: Boolean(connection),
    login: connection?.githubLogin ?? null,
    selectedRepositories: connection?.selectedRepositories ?? [],
  };
}

async function getConnection(userId: string) {
  const [connection] = await db.select().from(pabloGithubConnectionsTable)
    .where(eq(pabloGithubConnectionsTable.userId, userId)).limit(1);
  if (!connection) throw new PabloGithubError("Connect GitHub repository access first at /my-apps/connections.", 409);
  return connection;
}

async function fetchAvailableRepositories(accessToken: string): Promise<GithubRepositoryApi[]> {
  const collected: GithubRepositoryApi[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const repositories = await githubApi<GithubRepositoryApi[]>(
      accessToken,
      `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=updated`,
    );
    if (!Array.isArray(repositories)) break;
    collected.push(...repositories);
    if (repositories.length < 100) break;
  }
  return collected.filter((repo) =>
    Number.isSafeInteger(repo.id) &&
    typeof repo.full_name === "string" &&
    typeof repo.default_branch === "string" &&
    repo.permissions?.push === true,
  );
}

function repositorySummary(repo: GithubRepositoryApi): PabloGithubRepository {
  return {
    id: String(repo.id),
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private === true,
  };
}

export async function listGithubRepositoriesForUser(userId: string) {
  const connection = await getConnection(userId);
  const token = tokenForConnection(userId, connection);
  const available = await fetchAvailableRepositories(token);
  const selectedIds = new Set(connection.selectedRepositories.map((repo) => repo.id));
  return {
    items: available.map((repo) => ({
      ...repositorySummary(repo),
      selected: selectedIds.has(String(repo.id)),
    })),
    selectedRepositories: connection.selectedRepositories,
  };
}

export async function updateGithubRepositorySelection(
  userId: string,
  repositoryIds: string[],
) {
  if (repositoryIds.length > MAX_REPOSITORIES || new Set(repositoryIds).size !== repositoryIds.length) {
    throw new PabloGithubError(`Select no more than ${MAX_REPOSITORIES} unique repositories.`);
  }
  if (repositoryIds.some((id) => !/^\d{1,20}$/.test(id))) {
    throw new PabloGithubError("Repository identifiers must be numeric.");
  }
  const connection = await getConnection(userId);
  const token = tokenForConnection(userId, connection);
  const available = await fetchAvailableRepositories(token);
  const byId = new Map(available.map((repo) => [String(repo.id), repo]));
  if (repositoryIds.some((id) => !byId.has(id))) {
    throw new PabloGithubError("A selected repository is no longer accessible with write permission. Refresh the list and choose again.", 400);
  }
  const selectedRepositories = repositoryIds
    .map((id) => byId.get(id)!)
    .map(repositorySummary);
  await db.update(pabloGithubConnectionsTable)
    .set({ selectedRepositories, updatedAt: new Date() })
    .where(eq(pabloGithubConnectionsTable.userId, userId));
  return {
    items: available.map((repo) => ({
      ...repositorySummary(repo),
      selected: repositoryIds.includes(String(repo.id)),
    })),
    selectedRepositories,
  };
}

export async function disconnectGithubRepositories(userId: string): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(pabloGithubConnectionsTable)
      .where(eq(pabloGithubConnectionsTable.userId, userId))
      .returning({ userId: pabloGithubConnectionsTable.userId });
    await tx.update(pabloGithubChangesTable).set({
      status: "rejected",
      updatedAt: new Date(),
    }).where(and(
      eq(pabloGithubChangesTable.userId, userId),
      eq(pabloGithubChangesTable.status, "pending"),
    ));
    return Boolean(deleted);
  });
  return result;
}

function selectedRepository(
  connection: typeof pabloGithubConnectionsTable.$inferSelect,
  repositoryId: unknown,
): PabloGithubRepository {
  const id = typeof repositoryId === "string" || typeof repositoryId === "number"
    ? String(repositoryId)
    : "";
  const repo = connection.selectedRepositories.find((item) => item.id === id);
  if (!repo) throw new PabloGithubError("Pablo can access only repositories you selected in My Apps → Connections.", 403);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.fullName)) {
    throw new PabloGithubError("The saved repository reference is invalid.", 409);
  }
  return repo;
}

function safeRepoPath(raw: unknown): string {
  if (typeof raw !== "string") throw new PabloGithubError("A repository file path is required.");
  const path = raw.trim();
  const parts = path.split("/");
  if (
    !path || path.length > 240 || path.startsWith("/") || path.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..") ||
    /(?:^|\/)\.github\/workflows(?:\/|$)/i.test(path)
  ) {
    throw new PabloGithubError("That path is not allowed. Repository workflow files are excluded from Pablo changes.");
  }
  return path;
}

function decodeTextContent(file: GithubContentApi): string {
  if (file.type !== "file" || file.encoding !== "base64" || file.size > MAX_FILE_BYTES) {
    throw new PabloGithubError("Only small text files can be reviewed by Pablo.");
  }
  const text = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
  if (text.includes("\0") || Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
    throw new PabloGithubError("Binary or oversized files are not supported.");
  }
  return text;
}

function contentPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function trustedPullRequestUrl(value: unknown): string {
  if (typeof value !== "string") throw new PabloGithubError("GitHub did not return a pull request URL.", 502);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") throw new Error("untrusted host");
    return url.toString();
  } catch {
    throw new PabloGithubError("GitHub returned an invalid pull request URL.", 502);
  }
}

async function getSelectedRepositoryApi(
  userId: string,
  repositoryId: unknown,
) {
  const connection = await getConnection(userId);
  const token = tokenForConnection(userId, connection);
  const selected = selectedRepository(connection, repositoryId);
  const repo = await githubApi<GithubRepositoryApi>(
    token,
    `/repos/${selected.fullName}`,
  );
  if (String(repo.id) !== selected.id || repo.permissions?.push !== true) {
    throw new PabloGithubError("This selected repository no longer grants write access. Update the selection before continuing.", 403);
  }
  return { connection, token, selected, repo };
}

async function readSelectedGithubFile(
  token: string,
  selected: PabloGithubRepository,
  defaultBranch: string,
  path: string,
) {
  let file: GithubContentApi;
  try {
    file = await githubApi<GithubContentApi>(
      token,
      `/repos/${selected.fullName}/contents/${contentPath(path)}?ref=${encodeURIComponent(defaultBranch)}`,
    );
  } catch (error) {
    if (error instanceof PabloGithubError && error.status === 404) {
      throw new PabloGithubError("That file was not found in the selected repository's default branch.", 404);
    }
    throw error;
  }
  const content = decodeTextContent(file);
  if (Buffer.byteLength(content, "utf8") > MAX_READ_BYTES) {
    throw new PabloGithubError("This file is too large to send to Pablo. Ask about a smaller file.");
  }
  return {
    repository: selected.fullName,
    path,
    content,
    untrustedContent: true,
  };
}

export async function readGithubRepositoryFile(
  userId: string,
  repositoryId: unknown,
  rawPath: unknown,
) {
  const path = safeRepoPath(rawPath);
  const { token, selected, repo } = await getSelectedRepositoryApi(userId, repositoryId);
  return readSelectedGithubFile(token, selected, repo.default_branch, path);
}

export async function readGithubRepositoryFiles(
  userId: string,
  repositoryId: unknown,
  rawPaths: unknown,
) {
  if (!Array.isArray(rawPaths) || rawPaths.length < 1 || rawPaths.length > MAX_READ_FILES) {
    throw new PabloGithubError(`Read between 1 and ${MAX_READ_FILES} repository files at a time.`);
  }
  const paths = rawPaths.map(safeRepoPath);
  if (new Set(paths).size !== paths.length) {
    throw new PabloGithubError("The requested file list contains duplicates.");
  }
  const { token, selected, repo } = await getSelectedRepositoryApi(userId, repositoryId);
  const files = await Promise.all(paths.map((path) =>
    readSelectedGithubFile(token, selected, repo.default_branch, path),
  ));
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0);
  if (totalBytes > MAX_MULTI_READ_BYTES) {
    throw new PabloGithubError("The requested files are too large to send to Pablo together. Read fewer or smaller files.");
  }
  return {
    repository: selected.fullName,
    files: files.map(({ path, content }) => ({ path, content })),
    untrustedContent: true,
  };
}

function buildWholeFileDiff(path: string, oldContent: string | null, newContent: string): string {
  const oldLines = oldContent === null ? [] : oldContent.replace(/\r\n/g, "\n").split("\n");
  const newLines = newContent.replace(/\r\n/g, "\n").split("\n");
  const oldLabel = oldContent === null ? "/dev/null" : `a/${path}`;
  const head = `diff --git a/${path} b/${path}\n--- ${oldLabel}\n+++ b/${path}\n@@ -1,${oldLines.length} +1,${newLines.length} @@`;
  return [
    head,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

function validateProposalFiles(value: unknown): FileDraft[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CHANGED_FILES) {
    throw new PabloGithubError(`A proposal must include 1 to ${MAX_CHANGED_FILES} files.`);
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const files = value.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const path = safeRepoPath(record.path);
    const content = typeof record.content === "string" ? record.content : "";
    const baseContent = typeof record.baseContent === "string" || record.baseContent === null
      ? record.baseContent
      : undefined;
    const bytes = Buffer.byteLength(content, "utf8");
    if (!content || bytes > MAX_FILE_BYTES) throw new PabloGithubError(`${path} is empty or exceeds the file size limit.`);
    if (seen.has(path)) throw new PabloGithubError(`The proposal contains ${path} more than once.`);
    seen.add(path);
    totalBytes += bytes;
    return { path, content, baseContent };
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new PabloGithubError("The proposed changes exceed the total size limit.");
  return files;
}

export async function proposeGithubRepositoryChange(
  userId: string,
  input: Record<string, unknown>,
) {
  const { token, selected, repo } = await getSelectedRepositoryApi(userId, input.repositoryId);
  const title = typeof input.title === "string" ? input.title.trim().replace(/[\r\n]+/g, " ").slice(0, 200) : "";
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 8000) : "";
  if (!title) throw new PabloGithubError("Add a short title for the proposed change.");
  const files = validateProposalFiles(input.files);
  const ref = await githubApi<{ object?: { sha?: string } }>(
    token,
    `/repos/${selected.fullName}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`,
  );
  const baseSha = ref.object?.sha;
  if (!baseSha) throw new PabloGithubError("Could not read the default branch head.", 502);

  const proposedFiles: ProposedFile[] = [];
  const diffs: string[] = [];
  for (const file of files) {
    let oldContent: string | null = null;
    let baseFileSha: string | null = null;
    try {
      const existing = await githubApi<GithubContentApi>(
        token,
        `/repos/${selected.fullName}/contents/${contentPath(file.path)}?ref=${encodeURIComponent(repo.default_branch)}`,
      );
      oldContent = decodeTextContent(existing);
      if (file.baseContent !== oldContent) {
        throw new PabloGithubError(`Read ${file.path} before proposing edits, then include its exact current contents as baseContent.`);
      }
      baseFileSha = existing.sha;
    } catch (error) {
      if (!(error instanceof PabloGithubError && error.status === 404)) throw error;
      if (file.baseContent !== undefined && file.baseContent !== null) {
        throw new PabloGithubError(`${file.path} is new, so its baseContent must be null.`);
      }
    }
    proposedFiles.push({
      path: file.path,
      oldContent,
      newContent: file.content,
      baseFileSha,
    });
    diffs.push(buildWholeFileDiff(file.path, oldContent, file.content));
  }
  const diff = diffs.join("\n\n");
  const id = randomUUID();
  const diffHash = createHash("sha256").update(JSON.stringify({
    repositoryId: selected.id,
    baseSha,
    baseBranch: repo.default_branch,
    title,
    description,
    files: proposedFiles,
  })).digest("hex");
  const encryptedPayload = JSON.stringify(encryptSocialCredentials(
    { payload: JSON.stringify({ diff, files: proposedFiles } satisfies EncryptedChangePayload) },
    userId,
    `github-change:${id}`,
  ));
  const [change] = await db.insert(pabloGithubChangesTable).values({
    id,
    userId,
    repositoryId: selected.id,
    repositoryFullName: selected.fullName,
    baseBranch: repo.default_branch,
    baseSha,
    title,
    description,
    diffHash,
    encryptedPayload,
    status: "pending",
  }).returning();
  if (!change) throw new PabloGithubError("The review proposal could not be saved.", 500);
  return {
    message: `Prepared a diff for ${selected.fullName}. Nothing has been written to GitHub. Review and approve the exact diff at /my-apps/connections?githubChange=${change.id}.`,
    navigateTo: `/my-apps/connections?githubChange=${change.id}`,
    change: publicChange(change),
    diff,
  };
}

function changePayload(
  userId: string,
  change: typeof pabloGithubChangesTable.$inferSelect,
): EncryptedChangePayload {
  let stored: Record<string, string>;
  try {
    stored = JSON.parse(change.encryptedPayload) as Record<string, string>;
  } catch {
    throw new PabloGithubError("The saved diff could not be decoded.", 500);
  }
  const decrypted = decryptSocialCredentials(stored, userId, `github-change:${change.id}`);
  const raw = decrypted.credentials.payload;
  if (!raw) throw new PabloGithubError("The saved diff is missing.", 500);
  const payload = JSON.parse(raw) as EncryptedChangePayload;
  if (!payload || typeof payload.diff !== "string" || !Array.isArray(payload.files)) {
    throw new PabloGithubError("The saved diff has an invalid format.", 500);
  }
  return payload;
}

function publicChange(change: typeof pabloGithubChangesTable.$inferSelect) {
  return {
    id: change.id,
    repositoryFullName: change.repositoryFullName,
    title: change.title,
    description: change.description,
    status: change.status as PabloGithubChangeStatus,
    diffHash: change.diffHash,
    branchName: change.branchName,
    pullRequestUrl: change.pullRequestUrl,
    createdAt: change.createdAt,
  };
}

export async function listGithubRepositoryChanges(userId: string) {
  const rows = await db.select().from(pabloGithubChangesTable)
    .where(eq(pabloGithubChangesTable.userId, userId))
    .orderBy(desc(pabloGithubChangesTable.createdAt))
    .limit(50);
  return { items: rows.map(publicChange) };
}

export async function getGithubRepositoryChange(userId: string, id: string) {
  const [change] = await db.select().from(pabloGithubChangesTable).where(and(
    eq(pabloGithubChangesTable.id, id),
    eq(pabloGithubChangesTable.userId, userId),
  )).limit(1);
  if (!change) throw new PabloGithubError("Change not found.", 404);
  return { change: publicChange(change), diff: changePayload(userId, change).diff };
}

export async function rejectGithubRepositoryChange(userId: string, id: string) {
  const [change] = await db.update(pabloGithubChangesTable).set({
    status: "rejected",
    updatedAt: new Date(),
  }).where(and(
    eq(pabloGithubChangesTable.id, id),
    eq(pabloGithubChangesTable.userId, userId),
    eq(pabloGithubChangesTable.status, "pending"),
  )).returning();
  if (!change) throw new PabloGithubError("That proposal was not found or is no longer pending.", 409);
  return { change: publicChange(change) };
}

async function getFileModes(
  token: string,
  repositoryFullName: string,
  baseSha: string,
  files: ProposedFile[],
): Promise<Map<string, string>> {
  const commit = await githubApi<{ tree?: { sha?: string } }>(
    token,
    `/repos/${repositoryFullName}/git/commits/${baseSha}`,
  );
  const treeSha = commit.tree?.sha;
  if (!treeSha) throw new PabloGithubError("Could not read the base tree for this change.", 502);
  const tree = await githubApi<GithubTreeApi>(
    token,
    `/repos/${repositoryFullName}/git/trees/${treeSha}?recursive=1`,
  );
  if (tree.truncated) {
    throw new PabloGithubError("This repository's file tree is too large to verify safe file modes. No changes were written.", 409);
  }
  const entries = new Map(tree.tree.map((entry) => [entry.path, entry]));
  const modes = new Map<string, string>();
  for (const file of files) {
    const entry = entries.get(file.path);
    if (entry && entry.type !== "blob") {
      throw new PabloGithubError(`${file.path} is not a regular file and cannot be changed by Pablo.`);
    }
    const mode = entry?.mode ?? "100644";
    if (mode !== "100644" && mode !== "100755") {
      throw new PabloGithubError(`${file.path} uses an unsupported file mode. No changes were written.`);
    }
    modes.set(file.path, mode);
  }
  return modes;
}

export async function approveGithubRepositoryChange(
  userId: string,
  id: string,
  approvedDiffHash: string,
) {
  const [change] = await db.select().from(pabloGithubChangesTable).where(and(
    eq(pabloGithubChangesTable.id, id),
    eq(pabloGithubChangesTable.userId, userId),
  )).limit(1);
  if (!change) throw new PabloGithubError("Change not found.", 404);
  if (change.status !== "pending") throw new PabloGithubError("This proposal is no longer pending.", 409);
  if (approvedDiffHash !== change.diffHash) throw new PabloGithubError("The approved diff no longer matches the saved proposal.", 400);

  const payload = changePayload(userId, change);
  const recomputedHash = createHash("sha256").update(JSON.stringify({
    repositoryId: change.repositoryId,
    baseSha: change.baseSha,
    baseBranch: change.baseBranch,
    title: change.title,
    description: change.description,
    files: payload.files,
  })).digest("hex");
  if (recomputedHash !== change.diffHash) throw new PabloGithubError("The saved diff failed its integrity check.", 409);

  const { token, selected, repo } = await getSelectedRepositoryApi(userId, change.repositoryId);
  if (selected.fullName !== change.repositoryFullName || repo.default_branch !== change.baseBranch) {
    throw new PabloGithubError("The repository or default branch changed. Prepare and review a new diff.", 409);
  }
  const currentRef = await githubApi<{ object?: { sha?: string } }>(
    token,
    `/repos/${selected.fullName}/git/ref/heads/${encodeURIComponent(change.baseBranch)}`,
  );
  if (currentRef.object?.sha !== change.baseSha) {
    throw new PabloGithubError("The default branch changed after this diff was prepared. Prepare and review a new diff.", 409);
  }

  const branchName = `pablo/ai-change-${change.id.replace(/-/g, "")}`;
  const branchPath = `/repos/${selected.fullName}/git/ref/heads/${encodeURIComponent(branchName)}`;
  const existingBranch = await githubApi<{ object?: { sha?: string } } | null>(
    token,
    branchPath,
    { method: "GET" },
  ).catch((error) => {
    if (error instanceof PabloGithubError && error.status === 404) return null;
    throw error;
  });
  if (existingBranch) {
    const owner = selected.fullName.split("/")[0];
    const existingPulls = await githubApi<Array<{ html_url: string }>>(
      token,
      `/repos/${selected.fullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&per_page=10`,
    );
    if (existingPulls[0]?.html_url) {
      const pullRequestUrl = trustedPullRequestUrl(existingPulls[0].html_url);
      const [updated] = await db.update(pabloGithubChangesTable).set({
        status: "opened",
        branchName,
        pullRequestUrl,
        updatedAt: new Date(),
      }).where(and(
        eq(pabloGithubChangesTable.id, change.id),
        eq(pabloGithubChangesTable.userId, userId),
        eq(pabloGithubChangesTable.status, "pending"),
      )).returning();
      if (updated) return { change: publicChange(updated) };
      throw new PabloGithubError("The draft pull request exists, but the local proposal status changed.", 409);
    }
    const [alreadyOpened] = await db.update(pabloGithubChangesTable).set({
      status: "failed",
      branchName,
      updatedAt: new Date(),
    }).where(and(
      eq(pabloGithubChangesTable.id, change.id),
      eq(pabloGithubChangesTable.userId, userId),
      eq(pabloGithubChangesTable.status, "pending"),
    )).returning();
    if (!alreadyOpened) throw new PabloGithubError("The proposal changed while it was being approved.", 409);
    throw new PabloGithubError("A branch with this change ID already exists. The previous request may have completed partially; inspect GitHub before making another proposal.", 409);
  }

  const modes = await getFileModes(token, selected.fullName, change.baseSha, payload.files);
  const commit = await githubApi<{ tree?: { sha?: string } }>(
    token,
    `/repos/${selected.fullName}/git/commits/${change.baseSha}`,
  );
  const baseTree = commit.tree?.sha;
  if (!baseTree) throw new PabloGithubError("Could not read the default branch tree.", 502);
  const tree = await githubApi<{ sha?: string }>(
    token,
    `/repos/${selected.fullName}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTree,
        tree: payload.files.map((file) => ({
          path: file.path,
          mode: modes.get(file.path) ?? "100644",
          type: "blob",
          content: file.newContent,
        })),
      }),
    },
  );
  if (!tree.sha) throw new PabloGithubError("GitHub did not return the proposed tree.", 502);
  const newCommit = await githubApi<{ sha?: string }>(
    token,
    `/repos/${selected.fullName}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: change.title,
        tree: tree.sha,
        parents: [change.baseSha],
      }),
    },
  );
  if (!newCommit.sha) throw new PabloGithubError("GitHub did not return the new commit.", 502);
  await githubApi(token, `/repos/${selected.fullName}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: newCommit.sha }),
  });

  let pullRequest: { html_url: string } | undefined;
  const owner = selected.fullName.split("/")[0];
  const existingPulls = await githubApi<Array<{ html_url: string }>>(
    token,
    `/repos/${selected.fullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&per_page=10`,
  );
  pullRequest = existingPulls[0];
  if (!pullRequest) {
    pullRequest = await githubApi<{ html_url: string }>(
      token,
      `/repos/${selected.fullName}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: change.title,
          body: change.description,
          head: branchName,
          base: change.baseBranch,
          draft: true,
        }),
      },
    );
  }
  const pullRequestUrl = trustedPullRequestUrl(pullRequest.html_url);

  const [updated] = await db.update(pabloGithubChangesTable).set({
    status: "opened",
    branchName,
    pullRequestUrl,
    updatedAt: new Date(),
  }).where(and(
    eq(pabloGithubChangesTable.id, change.id),
    eq(pabloGithubChangesTable.userId, userId),
    eq(pabloGithubChangesTable.status, "pending"),
  )).returning();
  if (!updated) throw new PabloGithubError("The draft pull request was opened, but the local status could not be updated. Check the returned GitHub link.", 500);
  return { change: publicChange(updated) };
}
