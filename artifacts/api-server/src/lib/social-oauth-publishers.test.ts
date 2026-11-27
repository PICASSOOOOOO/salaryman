import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "./safe-fetch";
import { publishOAuthPost } from "./social-oauth-publishers";
import { getProvider } from "./social-providers";

vi.mock("./safe-fetch", () => ({ safeFetch: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(safeFetch).mockReset();
});

describe("OAuth social publishers", () => {
  it("keeps X, LinkedIn, and TikTok disabled until their live publishing is verified", () => {
    expect(getProvider("twitter")?.supportsPublishing).toBe(false);
    expect(getProvider("linkedin")?.supportsPublishing).toBe(false);
    expect(getProvider("tiktok")?.supportsPublishing).toBe(false);
    expect(getProvider("bluesky")?.supportsPublishing).not.toBe(false);
  });

  it("rejects media on text-only OAuth publishers instead of silently dropping it", async () => {
    const x = await publishOAuthPost("twitter", { accessToken: "x-token" }, {
      content: "Text with image",
      mediaUrls: ["https://example.com/image.png"],
    });
    const linkedin = await publishOAuthPost("linkedin", {
      accessToken: "linkedin-token",
      authorUrn: "urn:li:person:member-123",
    }, {
      content: "Text with image",
      mediaUrls: ["https://example.com/image.png"],
    });

    expect(x).toMatchObject({ ok: false, error: expect.stringContaining("media uploads are not supported") });
    expect(linkedin).toMatchObject({ ok: false, error: expect.stringContaining("media uploads are not supported") });
  });

  it("publishes X text posts through the connected account", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "post-123" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("twitter", {
      accessToken: "x-token",
      username: "salaryman",
    }, {
      content: "A real update",
      hashtags: ["#SALARYMAN"],
    });

    expect(result).toMatchObject({
      ok: true,
      externalId: "post-123",
      url: "https://x.com/salaryman/status/post-123",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(String(init.body))).toEqual({ text: "A real update\n\n#SALARYMAN" });
  });

  it("publishes LinkedIn text posts as the connected member", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202611");
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 201,
      headers: { "x-restli-id": "urn:li:share:123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("linkedin", {
      accessToken: "linkedin-token",
      authorUrn: "urn:li:person:member-123",
    }, { content: "A company update" });

    expect(result).toMatchObject({ ok: true, externalId: "urn:li:share:123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.linkedin.com/rest/posts");
    expect(new Headers(init.headers).get("linkedin-version")).toBe("202611");
    expect(JSON.parse(String(init.body))).toMatchObject({
      author: "urn:li:person:member-123",
      commentary: "A company update",
      lifecycleState: "PUBLISHED",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
    });
  });

  it("uses the resolved Facebook Page token for video posts", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "page-video-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("facebook", {
      accessToken: "page-token",
      pageId: "page-1",
    }, {
      content: "Campaign update",
      mediaUrls: ["https://cdn.example.test/campaign.mp4"],
    });

    expect(result).toMatchObject({ ok: true, externalId: "page-video-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/page-1/videos");
    expect(new URLSearchParams(init.body as string).get("access_token")).toBe("page-token");
    expect(new URLSearchParams(init.body as string).get("file_url")).toBe("https://cdn.example.test/campaign.mp4");
  });

  it("sends Threads video attachments as video containers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "thread-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("threads", {
      accessToken: "threads-token",
      accountId: "threads-user-1",
    }, {
      content: "Campaign update",
      mediaUrls: ["https://cdn.example.test/campaign.mp4"],
    });

    expect(result).toMatchObject({ ok: true, externalId: "thread-1" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("media_type")).toBe("VIDEO");
    expect(body.get("video_url")).toBe("https://cdn.example.test/campaign.mp4");
  });

  it("publishes Instagram media only after the media ID is confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "published-ig-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("instagram", {
      accessToken: "ig-token",
      instagramUserId: "ig-user-1",
    }, {
      content: "Campaign update",
      mediaUrls: ["https://cdn.example.test/image.jpg"],
    });

    expect(result).toMatchObject({ ok: true, externalId: "published-ig-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("publishes a YouTube video only after YouTube returns the uploaded video ID", async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "youtube-video-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("youtube", { accessToken: "youtube-token" }, {
      content: "A video update",
      mediaUrls: ["https://cdn.example.test/video.mp4"],
    });

    expect(result).toMatchObject({
      ok: true,
      externalId: "youtube-video-1",
      url: "https://www.youtube.com/watch?v=youtube-video-1",
    });
    expect(safeFetch).toHaveBeenCalledWith("https://cdn.example.test/video.mp4", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not accept an Instagram media container as a completed publish", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("instagram", {
      accessToken: "ig-token",
      instagramUserId: "ig-user-1",
    }, {
      content: "Campaign update",
      mediaUrls: ["https://cdn.example.test/image.jpg"],
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not confirm a published media ID") });
  });

  it("does not accept a Threads container as a published post", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("threads", {
      accessToken: "threads-token",
      accountId: "threads-user-1",
    }, { content: "Campaign update" });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not confirm a published post ID") });
  });

  it("does not accept a Facebook response without a post ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await publishOAuthPost("facebook", {
      accessToken: "page-token",
      pageId: "page-1",
    }, { content: "Campaign update" });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not return a post ID") });
  });

  it("keeps TikTok direct publishing disabled until async post status is confirmed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("tiktok", { accessToken: "token" }, {
      content: "Campaign update",
      mediaUrls: ["https://cdn.example.test/campaign.mp4"],
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("asynchronous post status") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
