import type { ProviderPublishInput, ProviderPublishResult } from "./social-providers";
import { safeFetch } from "./safe-fetch";

function firstMedia(input: ProviderPublishInput): string | null {
  const url = input.mediaUrls?.find((candidate) => typeof candidate === "string" && candidate.trim())?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function hashtags(input: ProviderPublishInput): string {
  return (input.hashtags ?? []).map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ");
}

function caption(input: ProviderPublishInput, limit: number): string {
  const text = [input.content?.trim(), hashtags(input)].filter(Boolean).join("\n\n");
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

async function providerRequest(url: string, init: RequestInit): Promise<Record<string, any>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || data.error) {
    throw new Error(`Platform rejected the post (${response.status}).`);
  }
  return data;
}

function oauthToken(creds: Record<string, string>): string {
  if (!creds.accessToken) throw new Error("Reconnect this social account before publishing.");
  return creds.accessToken;
}

async function postFacebook(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult> {
  const token = oauthToken(creds);
  const media = firstMedia(input);
  const route = media ? `${creds.pageId}/photos` : `${creds.pageId}/feed`;
  if (!creds.pageId) throw new Error("The connected Facebook account has no Page selected.");
  const body = new URLSearchParams({ access_token: token });
  body.set(media ? "url" : "message", media ? media : caption(input, 5000));
  if (media) body.set("caption", caption(input, 5000));
  const result = await providerRequest(`https://graph.facebook.com/v22.0/${route}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return { ok: true, externalId: String(result.id ?? result.post_id ?? "") };
}

async function postThreads(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult> {
  const token = oauthToken(creds);
  const userId = creds.accountId;
  if (!userId) throw new Error("The connected Threads account could not be identified.");
  const media = firstMedia(input);
  const params = new URLSearchParams({
    access_token: token,
    text: caption(input, 500),
    ...(media ? { media_type: "IMAGE", image_url: media } : {}),
  });
  const container = await providerRequest(`https://graph.threads.net/v1.0/${userId}/threads`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!container.id) throw new Error("Threads did not return a post container.");
  const published = await providerRequest(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, creation_id: String(container.id) }),
  });
  return { ok: true, externalId: String(published.id ?? container.id) };
}

async function postInstagram(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult> {
  const token = oauthToken(creds);
  const userId = creds.instagramUserId;
  const media = firstMedia(input);
  if (!userId) throw new Error("The connected Instagram account could not be identified.");
  if (!media) throw new Error("Instagram publishing requires an attached public image or video.");
  const isVideo = /\.(mp4|mov|webm)(?:$|[?#])/i.test(media);
  const creation = new URLSearchParams({
    access_token: token,
    caption: caption(input, 2200),
    ...(isVideo ? { media_type: "REELS", video_url: media } : { image_url: media }),
  });
  const container = await providerRequest(`https://graph.facebook.com/v22.0/${userId}/media`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: creation,
  });
  if (!container.id) throw new Error("Instagram did not return a media container.");
  if (isVideo) {
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      const status = await providerRequest(`https://graph.facebook.com/v22.0/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`, { method: "GET" });
      if (status.status_code === "FINISHED") { ready = true; break; }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new Error("Instagram could not process the attached video.");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    if (!ready) throw new Error("Instagram video processing did not finish in time; retry after checking the post.");
  }
  const published = await providerRequest(`https://graph.facebook.com/v22.0/${userId}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, creation_id: String(container.id) }),
  });
  return { ok: true, externalId: String(published.id ?? container.id) };
}

async function postTikTok(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult> {
  const token = oauthToken(creds);
  const media = firstMedia(input);
  if (!media || !/\.(mp4|mov|webm)(?:$|[?#])/i.test(media)) {
    throw new Error("TikTok publishing requires an attached public video.");
  }
  const result = await providerRequest("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: caption(input, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
      },
      source_info: { source: "PULL_FROM_URL", video_url: media },
    }),
  });
  const data = result.data ?? {};
  if (result.error?.code && result.error.code !== "ok") {
    throw new Error("TikTok did not accept the video for publishing.");
  }
  if (!data.publish_id) throw new Error("TikTok did not return a publish ID.");
  return { ok: true, externalId: String(data.publish_id) };
}

async function postYouTube(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult> {
  const token = oauthToken(creds);
  const media = firstMedia(input);
  if (!media || !/\.(mp4|mov|webm)(?:$|[?#])/i.test(media)) {
    throw new Error("YouTube publishing requires an attached public video.");
  }
  const downloaded = await safeFetch(media, { timeoutMs: 120_000, maxResponseBytes: 100 * 1024 * 1024, maxRedirects: 3 });
  if (!downloaded.ok) throw new Error("The attached video could not be downloaded.");
  const mimeType = downloaded.headers.get("content-type")?.split(";")[0] || "video/mp4";
  if (!mimeType.startsWith("video/")) throw new Error("The attached YouTube media is not a video.");
  const bytes = await downloaded.arrayBuffer();
  const title = (input.content?.split(/\r?\n/, 1)[0] || "Campaign update").slice(0, 100);
  const metadata = {
    snippet: { title, description: caption(input, 5000) },
    status: { privacyStatus: "public" },
  };
  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json; charset=UTF-8" }));
  form.set("media", new Blob([bytes], { type: mimeType }), "campaign-video");
  const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || !result.id) throw new Error(`YouTube rejected the video (${response.status}).`);
  return { ok: true, externalId: String(result.id), url: `https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}` };
}

export async function publishOAuthPost(
  provider: "facebook" | "instagram" | "threads" | "tiktok" | "youtube",
  credentials: Record<string, string>,
  input: ProviderPublishInput,
): Promise<ProviderPublishResult> {
  try {
    switch (provider) {
      case "facebook": return await postFacebook(credentials, input);
      case "instagram": return await postInstagram(credentials, input);
      case "threads": return await postThreads(credentials, input);
      case "tiktok": return await postTikTok(credentials, input);
      case "youtube": return await postYouTube(credentials, input);
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Social publish failed." };
  }
}
