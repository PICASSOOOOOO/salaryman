import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// publishSocialPost gates real outbound posting behind BOTH the PRIME entitlement
// (claw_bot) AND a live, connected account for the platform. Mock those two
// collaborators so we can drive every branch deterministically without touching
// the real plan service or making outbound provider calls.
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  hasFeature: vi.fn(async () => true),
}));
vi.mock("../lib/social-providers", async (importActual) => ({
  ...(await importActual<typeof import("../lib/social-providers")>()),
  getProvider: vi.fn(),
}));

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  socialPostsTable,
  socialConnectionsTable,
  platformConnectedAppsTable,
} from "@workspace/db";
import { hasFeature } from "../lib/plan";
import { getProvider } from "../lib/social-providers";
import { publishSocialPost } from "../lib/social-service";

const hasFeatureMock = hasFeature as ReturnType<typeof vi.fn>;
const getProviderMock = getProvider as ReturnType<typeof vi.fn>;

// All rows this file writes are scoped to a single synthetic user id so cleanup
// can delete them precisely (the suite runs against the shared dev database).
const USER_ID = `aptest-pub-${randomUUID()}`;

async function createPost(opts: { platform?: string; content?: string } = {}): Promise<number> {
  const [row] = await db
    .insert(socialPostsTable)
    .values({
      userId: USER_ID,
      platform: opts.platform ?? "bluesky",
      content: opts.content ?? "Hello world",
      hashtags: ["#hi"],
      status: "draft",
      aiGenerated: "yes",
    })
    .returning({ id: socialPostsTable.id });
  return row.id;
}

async function createConnection(opts: {
  platform?: string;
  status?: string;
  credentials?: Record<string, string> | null;
} = {}): Promise<void> {
  await db.insert(socialConnectionsTable).values({
    userId: USER_ID,
    provider: opts.platform ?? "bluesky",
    status: opts.status ?? "connected",
    credentials: opts.credentials === undefined ? { token: "x" } : opts.credentials,
  });
}

async function createPlatformConnection(opts: {
  appSlug?: string;
  credentials?: Record<string, string>;
} = {}): Promise<void> {
  await db.insert(platformConnectedAppsTable).values({
    orgId: USER_ID,
    appSlug: opts.appSlug ?? "bluesky",
    appName: "Platform test connection",
    status: "connected",
    config: { credentials: opts.credentials ?? { login: "handle", password: "app-password" } },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  hasFeatureMock.mockResolvedValue(true);
  getProviderMock.mockReturnValue(undefined);
  // Start every test from a clean slate so connections from one case never leak.
  await db.delete(socialPostsTable).where(eq(socialPostsTable.userId, USER_ID));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.userId, USER_ID));
  await db.delete(platformConnectedAppsTable).where(eq(platformConnectedAppsTable.orgId, USER_ID));
});

afterAll(async () => {
  await db.delete(socialPostsTable).where(eq(socialPostsTable.userId, USER_ID));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.userId, USER_ID));
  await db.delete(platformConnectedAppsTable).where(eq(platformConnectedAppsTable.orgId, USER_ID));
});

describe("publishSocialPost", () => {
  it("404 when the post does not exist (or isn't owned by the user)", async () => {
    const res = await publishSocialPost({ userId: USER_ID, postId: 999_999_999 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("simulates (never posts live) when the owner is NOT PRIME, even with a live connection", async () => {
    hasFeatureMock.mockResolvedValue(false);
    const publish = vi.fn(async () => ({ ok: true, externalId: "x", url: "http://live" }));
    getProviderMock.mockReturnValue({ publish });
    await createConnection({ platform: "bluesky", status: "connected", credentials: { token: "x" } });
    const postId = await createPost({ platform: "bluesky" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulated).toBe(true);
      expect(res.needsConnection).toBe("bluesky");
    }
    // The PRIME gate must short-circuit BEFORE any real outbound call.
    expect(publish).not.toHaveBeenCalled();
    const [row] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId));
    expect(row.status).toBe("published");
  });

  it("simulates when PRIME but there is no connected account for the platform", async () => {
    hasFeatureMock.mockResolvedValue(true);
    const publish = vi.fn(async () => ({ ok: true, externalId: "x" }));
    getProviderMock.mockReturnValue({ publish });
    const postId = await createPost({ platform: "bluesky" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulated).toBe(true);
      expect(res.needsConnection).toBe("bluesky");
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes for real when PRIME + connected + provider can publish", async () => {
    hasFeatureMock.mockResolvedValue(true);
    const publish = vi.fn(async () => ({ ok: true, externalId: "ext-123", url: "http://live/post" }));
    getProviderMock.mockReturnValue({ publish });
    await createConnection({ platform: "bluesky", status: "connected", credentials: { token: "x" } });
    const postId = await createPost({ platform: "bluesky", content: "Ship it" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulated).toBe(false);
      expect(res.url).toBe("http://live/post");
    }
    expect(publish).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId));
    expect(row.status).toBe("published");
    expect(row.externalPostId).toBe("ext-123");
    expect(row.publishedAt).toBeTruthy();
  });

  it("publishes for real from a Bluesky Platform Connections credential", async () => {
    const publish = vi.fn(async () => ({ ok: true, externalId: "bsky-uri", url: "https://bsky.app/post/1" }));
    getProviderMock.mockReturnValue({ authType: "app_password", publish });
    await createPlatformConnection({
      appSlug: "bluesky",
      credentials: { login: "saved.bsky.social", password: "saved-app-password" },
    });
    const postId = await createPost({ platform: "bluesky", content: "Saved connection post" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulated).toBe(false);
      expect(res.url).toBe("https://bsky.app/post/1");
    }
    expect(publish).toHaveBeenCalledWith(
      { identifier: "saved.bsky.social", appPassword: "saved-app-password" },
      expect.objectContaining({ content: "Saved connection post" }),
    );
  });

  it("does not simulate an OAuth-only platform when Platform Connections has raw credentials", async () => {
    getProviderMock.mockReturnValue({ id: "twitter", label: "X (Twitter)", authType: "oauth" });
    await createPlatformConnection({
      appSlug: "x-twitter",
      credentials: { login: "saved-x-user", password: "saved-password" },
    });
    const postId = await createPost({ platform: "twitter" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error).toMatch(/requires an OAuth connection/i);
      expect(res.needsConnection).toBe("twitter");
    }
    const [row] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId));
    expect(row.status).toBe("draft");
  });

  it("does NOT publish live when the connection exists but status isn't 'connected'", async () => {
    hasFeatureMock.mockResolvedValue(true);
    const publish = vi.fn(async () => ({ ok: true, externalId: "x" }));
    getProviderMock.mockReturnValue({ publish });
    await createConnection({ platform: "bluesky", status: "needs_setup", credentials: { token: "x" } });
    const postId = await createPost({ platform: "bluesky" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.simulated).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it("502 and records lastError when the live provider publish fails", async () => {
    hasFeatureMock.mockResolvedValue(true);
    const publish = vi.fn(async () => ({ ok: false, error: "Bluesky post failed (500)." }));
    getProviderMock.mockReturnValue({ publish });
    await createConnection({ platform: "bluesky", status: "connected", credentials: { token: "x" } });
    const postId = await createPost({ platform: "bluesky" });

    const res = await publishSocialPost({ userId: USER_ID, email: "u@test", postId });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toBe("Bluesky post failed (500).");
      expect(res.platform).toBe("bluesky");
    }
    // The post must NOT have flipped to published on a failed live publish.
    const [row] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId));
    expect(row.status).toBe("draft");
    // The connection's lastError is updated so the Command Center can surface it.
    const [conn] = await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.userId, USER_ID));
    expect(conn.lastError).toBe("Bluesky post failed (500).");
  });
});
