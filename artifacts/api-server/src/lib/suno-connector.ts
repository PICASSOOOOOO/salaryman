const SUNO_API_BASE = "https://studio-api.suno.ai/api";

export interface SunoGenerateRequest {
  title: string;
  genre: string;
  mood: string;
  tempo: number;
  key: string;
  vocal: "male" | "female" | "duet" | "instrumental";
  lyrics: string;
  stylePrompt: string;
  duration: number;
}

export interface SunoTrack {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl?: string;
  duration: number;
  status: "queued" | "processing" | "complete" | "failed";
  metadata: {
    genre: string;
    mood: string;
    tempo: number;
    key: string;
  };
}

export interface SunoGenerateResponse {
  tracks: SunoTrack[];
  creditsRemaining: number;
}

function getSunoApiKey(): string | null {
  return process.env.SUNO_API_KEY ?? null;
}

export function isSunoConfigured(): boolean {
  return !!getSunoApiKey();
}

export async function generateMusic(
  request: SunoGenerateRequest
): Promise<SunoGenerateResponse> {
  const apiKey = getSunoApiKey();
  if (!apiKey) {
    throw new Error(
      "SUNO_API_KEY not configured. Music generation requires a Suno API key."
    );
  }

  const prompt = buildSunoPrompt(request);

  try {
    const response = await fetch(`${SUNO_API_BASE}/generate/v2/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: request.lyrics !== "instrumental" ? request.lyrics : "",
        tags: request.stylePrompt,
        title: request.title,
        make_instrumental: request.vocal === "instrumental",
        wait_audio: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Suno API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      id: string;
      clips: Array<{
        id: string;
        title: string;
        audio_url: string;
        image_url?: string;
        metadata: { duration: number; tags: string };
        status: string;
      }>;
      credits_left?: number;
    };

    return {
      tracks: (data.clips ?? []).map((clip) => ({
        id: clip.id,
        title: clip.title || request.title,
        audioUrl: clip.audio_url,
        imageUrl: clip.image_url,
        duration: clip.metadata?.duration ?? request.duration,
        status: mapStatus(clip.status),
        metadata: {
          genre: request.genre,
          mood: request.mood,
          tempo: request.tempo,
          key: request.key,
        },
      })),
      creditsRemaining: data.credits_left ?? -1,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Suno API error")) {
      throw error;
    }
    throw new Error(
      `Failed to connect to Suno API: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function checkTrackStatus(trackId: string): Promise<SunoTrack | null> {
  const apiKey = getSunoApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${SUNO_API_BASE}/feed/${trackId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
      id: string;
      title: string;
      audio_url: string;
      image_url?: string;
      metadata: { duration: number; tags: string };
      status: string;
    }>;

    const clip = data[0];
    if (!clip) return null;

    return {
      id: clip.id,
      title: clip.title,
      audioUrl: clip.audio_url,
      imageUrl: clip.image_url,
      duration: clip.metadata?.duration ?? 0,
      status: mapStatus(clip.status),
      metadata: {
        genre: clip.metadata?.tags ?? "",
        mood: "",
        tempo: 0,
        key: "",
      },
    };
  } catch {
    return null;
  }
}

function mapStatus(
  status: string
): "queued" | "processing" | "complete" | "failed" {
  switch (status?.toLowerCase()) {
    case "complete":
    case "streaming":
      return "complete";
    case "queued":
      return "queued";
    case "processing":
    case "generating":
      return "processing";
    case "error":
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}

function buildSunoPrompt(request: SunoGenerateRequest): string {
  const parts: string[] = [];

  if (request.genre) parts.push(request.genre);
  if (request.mood) parts.push(request.mood);
  if (request.tempo) parts.push(`${request.tempo} bpm`);
  if (request.key) parts.push(`key of ${request.key}`);
  if (request.vocal && request.vocal !== "instrumental") {
    parts.push(`${request.vocal} vocals`);
  }
  if (request.stylePrompt) parts.push(request.stylePrompt);

  return parts.join(", ");
}

export function parseMusicGenerateBlock(
  text: string
): SunoGenerateRequest | null {
  const match = text.match(
    /\[MUSIC_GENERATE\]([\s\S]*?)\[\/MUSIC_GENERATE\]/
  );
  if (!match) return null;

  const block = match[1];
  const get = (key: string): string => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
    return m ? m[1].trim() : "";
  };

  const title = get("title");
  if (!title) return null;

  return {
    title,
    genre: get("genre"),
    mood: get("mood"),
    tempo: parseInt(get("tempo")) || 120,
    key: get("key") || "C major",
    vocal: (get("vocal") as SunoGenerateRequest["vocal"]) || "instrumental",
    lyrics: get("lyrics") || "instrumental",
    stylePrompt: get("style_prompt"),
    duration: parseInt(get("duration")) || 120,
  };
}
