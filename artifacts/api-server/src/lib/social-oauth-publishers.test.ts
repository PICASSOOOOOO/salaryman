import { afterEach, describe, expect, it, vi } from "vitest";
import { publishOAuthPost } from "./social-oauth-publishers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuth social publishers", () => {
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

  it("refuses TikTok posts without an attached video before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishOAuthPost("tiktok", { accessToken: "token" }, {
      content: "Campaign update",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("requires an attached public video");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
