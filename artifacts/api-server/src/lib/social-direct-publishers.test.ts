import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "./social-providers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("direct social publishers", () => {
  it("requires a real Bluesky record URI before reporting success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accessJwt: "access-token",
        did: "did:plc:test",
        handle: "tester.bsky.social",
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uri: "at://did:plc:test/app.bsky.feed.post/post-key" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getProvider("bluesky");
    const result = await provider!.publish!({
      identifier: "tester.bsky.social",
      appPassword: "test-app-password",
    }, { content: "A real post" });

    expect(result).toMatchObject({
      ok: true,
      externalId: "at://did:plc:test/app.bsky.feed.post/post-key",
      url: "https://bsky.app/profile/tester.bsky.social/post/post-key",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a Bluesky response without a record URI", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accessJwt: "access-token",
        did: "did:plc:test",
        handle: "tester.bsky.social",
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getProvider("bluesky")!.publish!({
      identifier: "tester.bsky.social",
      appPassword: "test-app-password",
    }, { content: "A real post" });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not return a post URI") });
  });

  it("waits for Discord's message ID before reporting success", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ id: "message-123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getProvider("discord")!.publish!({
      webhookUrl: "https://discord.com/api/webhooks/123/abcDEF",
    }, { content: "A real post" });

    expect(result).toMatchObject({ ok: true, externalId: "message-123" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://discord.com/api/webhooks/123/abcDEF?wait=true");
  });

  it("rejects a Discord webhook response without a message ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await getProvider("discord")!.publish!({
      webhookUrl: "https://discord.com/api/webhooks/123/abcDEF",
    }, { content: "A real post" });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not return a message ID") });
  });
});
