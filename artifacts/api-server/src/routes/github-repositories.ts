import { Router, type Request, type Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  ApproveGithubRepositoryChangeBody,
  UpdateGithubRepositorySelectionBody,
} from "@workspace/api-zod";
import {
  buildGithubAuthUrl,
  exchangeGithubCode,
  fetchGithubProfile,
  GITHUB_REPOSITORY_SCOPES,
  resolveGithubRepositoryCreds,
} from "../lib/github-auth";
import {
  approveGithubRepositoryChange,
  disconnectGithubRepositories,
  getGithubRepositoryChange,
  getGithubRepositoryStatus,
  listGithubRepositoriesForUser,
  listGithubRepositoryChanges,
  PabloGithubError,
  proposeGithubRepositoryChange,
  readGithubRepositoryFile,
  rejectGithubRepositoryChange,
  saveGithubRepositoryConnection,
  updateGithubRepositorySelection,
} from "../lib/pablo-github";
import { logger } from "../lib/logger";
import { safePabloErrorFields } from "../lib/pablo-chat-diagnostics";

const router = Router();
const COOKIE_PREFIX = "/api/github-repositories";
const STATE_COOKIE = "pablo_github_repo_state";
const USER_COOKIE = "pablo_github_repo_user";
const COOKIE_MAX_AGE = 10 * 60 * 1000;
const CHANGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionUserId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String(req.user.id);
}

function requestHost(req: Request): string {
  return (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
}

function requestOrigin(req: Request): string {
  const protocol = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host = requestHost(req);
  if (!host || !/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) {
    throw new PabloGithubError("Could not determine the app's secure GitHub callback URL.", 400);
  }
  return `${protocol === "http" ? "http" : "https"}://${host}`;
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure || req.get("x-forwarded-proto") === "https",
    sameSite: "lax" as const,
    path: COOKIE_PREFIX,
    maxAge: COOKIE_MAX_AGE,
  };
}

function clearOAuthCookies(res: Response) {
  res.clearCookie(STATE_COOKIE, { path: COOKIE_PREFIX });
  res.clearCookie(USER_COOKIE, { path: COOKIE_PREFIX });
}

function equalState(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function logAndRespond(req: Request, res: Response, error: unknown, phase: string): void {
  const status = error instanceof PabloGithubError ? error.status : 500;
  const message = error instanceof PabloGithubError
    ? error.message
    : "GitHub repository access is temporarily unavailable.";
  (req.log ?? logger).warn(
    { phase, ...safePabloErrorFields(error) },
    "Pablo GitHub repository request failed",
  );
  res.status(status).json({ error: message });
}

router.get("/github-repositories/status", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  try {
    const status = await getGithubRepositoryStatus(
      userId,
      Boolean(resolveGithubRepositoryCreds(requestHost(req))),
    );
    res.json(status);
  } catch (error) {
    logAndRespond(req, res, error, "repository-status");
  }
});

router.get("/github-repositories/connect", (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  try {
    const host = requestHost(req);
    const creds = resolveGithubRepositoryCreds(host);
    if (!creds) {
      res.status(503).json({ error: "The separate GitHub repository OAuth app is not configured." });
      return;
    }
    const state = randomBytes(32).toString("base64url");
    const options = cookieOptions(req);
    res.cookie(STATE_COOKIE, state, options);
    res.cookie(USER_COOKIE, userId, options);
    const callback = `${requestOrigin(req)}${COOKIE_PREFIX}/callback`;
    res.redirect(buildGithubAuthUrl({
      redirectUri: callback,
      state,
      creds,
      scope: GITHUB_REPOSITORY_SCOPES,
    }));
  } catch (error) {
    logAndRespond(req, res, error, "repository-connect");
  }
});

router.get("/github-repositories/callback", async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const savedState = req.cookies?.[STATE_COOKIE];
  const savedUserId = req.cookies?.[USER_COOKIE];
  clearOAuthCookies(res);
  const returnTo = "/my-apps/connections";
  if (!state || typeof savedState !== "string" || !equalState(state, savedState)) {
    res.redirect(`${returnTo}?github_repo_error=state`);
    return;
  }
  if (!savedUserId || !req.isAuthenticated?.() || String(req.user?.id ?? "") !== savedUserId) {
    res.redirect(`${returnTo}?github_repo_error=session`);
    return;
  }
  if (typeof req.query.error === "string") {
    res.redirect(`${returnTo}?github_repo_error=authorization`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.redirect(`${returnTo}?github_repo_error=callback`);
    return;
  }
  try {
    const host = requestHost(req);
    const creds = resolveGithubRepositoryCreds(host);
    if (!creds) {
      res.redirect(`${returnTo}?github_repo_error=not_configured`);
      return;
    }
    const callback = `${requestOrigin(req)}${COOKIE_PREFIX}/callback`;
    const accessToken = await exchangeGithubCode({ code, redirectUri: callback, creds });
    const profile = await fetchGithubProfile(accessToken);
    if (!profile.id || !profile.login) throw new PabloGithubError("GitHub did not return a usable account.", 502);
    await saveGithubRepositoryConnection({
      userId: savedUserId,
      githubUserId: String(profile.id),
      githubLogin: profile.login,
      accessToken,
    });
    res.redirect(`${returnTo}?github_repo_connected=1`);
  } catch (error) {
    (req.log ?? logger).warn(
      { phase: "repository-callback", errorType: error instanceof Error ? error.name : "unknown" },
      "Pablo GitHub repository authorization failed",
    );
    res.redirect(`${returnTo}?github_repo_error=callback`);
  }
});

router.get("/github-repositories/repos", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  try {
    res.json(await listGithubRepositoriesForUser(userId));
  } catch (error) {
    logAndRespond(req, res, error, "repository-list");
  }
});

router.put("/github-repositories/selection", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  const parsed = UpdateGithubRepositorySelectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid repository selection." });
    return;
  }
  try {
    res.json(await updateGithubRepositorySelection(userId, parsed.data.repositoryIds));
  } catch (error) {
    logAndRespond(req, res, error, "repository-selection");
  }
});

router.post("/github-repositories/disconnect", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  try {
    res.json({ disconnected: await disconnectGithubRepositories(userId) });
  } catch (error) {
    logAndRespond(req, res, error, "repository-disconnect");
  }
});

router.get("/github-repositories/changes", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  try {
    res.json(await listGithubRepositoryChanges(userId));
  } catch (error) {
    logAndRespond(req, res, error, "repository-changes-list");
  }
});

router.get("/github-repositories/changes/:id", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  if (!CHANGE_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid change identifier." });
    return;
  }
  try {
    res.json(await getGithubRepositoryChange(userId, id));
  } catch (error) {
    logAndRespond(req, res, error, "repository-change-detail");
  }
});

router.post("/github-repositories/changes/:id/approve", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  if (!CHANGE_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid change identifier." });
    return;
  }
  const parsed = ApproveGithubRepositoryChangeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Approve the exact saved diff to continue." });
    return;
  }
  try {
    res.json(await approveGithubRepositoryChange(
      userId,
      id,
      parsed.data.diffHash,
    ));
  } catch (error) {
    logAndRespond(req, res, error, "repository-change-approve");
  }
});

router.post("/github-repositories/changes/:id/reject", async (req, res) => {
  const userId = sessionUserId(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  if (!CHANGE_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid change identifier." });
    return;
  }
  try {
    res.json(await rejectGithubRepositoryChange(userId, id));
  } catch (error) {
    logAndRespond(req, res, error, "repository-change-reject");
  }
});

// Tool-only helpers keep every chat route on the same bounded repository API.
export const pabloGithubTools = {
  readFile: readGithubRepositoryFile,
  proposeChange: proposeGithubRepositoryChange,
};

export default router;
