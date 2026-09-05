const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const MUSICGEN_MODEL = "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055f2a91c72b3c4e0d06b5c34";

export interface MusicGenerateRequest {
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

export interface MusicTrack {
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

export interface MusicGenerateResponse {
  tracks: MusicTrack[];
  creditsRemaining: number;
}

function getReplicateToken(): string | null {
  return process.env.REPLICATE_API_TOKEN ?? null;
}

export function isMusicConfigured(): boolean {
  return !!getReplicateToken();
}

export const isSunoConfigured = isMusicConfigured;

function buildMusicPrompt(request: MusicGenerateRequest): string {
  const parts: string[] = [];
  if (request.genre) parts.push(request.genre);
  if (request.mood) parts.push(request.mood);
  if (request.tempo) parts.push(`${request.tempo} bpm`);
  if (request.key) parts.push(`key of ${request.key}`);
  if (request.vocal && request.vocal !== "instrumental") {
    parts.push(`${request.vocal} vocals`);
  }
  if (request.stylePrompt) parts.push(request.stylePrompt);
  if (request.title) parts.push(`"${request.title}"`);
  return parts.join(", ");
}

export async function generateMusic(
  request: MusicGenerateRequest
): Promise<MusicGenerateResponse> {
  const token = getReplicateToken();
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN not configured. Music generation requires a Replicate API token."
    );
  }

  const prompt = buildMusicPrompt(request);
  const durationSec = Math.min(Math.max(request.duration, 5), 300);

  try {
    const response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        version: MUSICGEN_MODEL.split(":")[1],
        input: {
          prompt,
          duration: durationSec,
          model_version: "stereo-melody-large",
          output_format: "mp3",
          normalization_strategy: "peak",
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Replicate API error (${response.status}): ${errorBody}`);
    }

    const prediction = (await response.json()) as {
      id: string;
      status: string;
      output?: string;
      urls: { get: string };
    };

    return {
      tracks: [
        {
          id: prediction.id,
          title: request.title,
          audioUrl: prediction.output ?? "",
          duration: durationSec,
          status: mapReplicateStatus(prediction.status),
          metadata: {
            genre: request.genre,
            mood: request.mood,
            tempo: request.tempo,
            key: request.key,
          },
        },
      ],
      creditsRemaining: -1,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Replicate API error")) {
      throw error;
    }
    throw new Error(
      `Failed to connect to Replicate API: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function checkTrackStatus(trackId: string): Promise<MusicTrack | null> {
  const token = getReplicateToken();
  if (!token) return null;

  try {
    const response = await fetch(`${REPLICATE_API_BASE}/predictions/${trackId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const prediction = (await response.json()) as {
      id: string;
      status: string;
      output?: string | string[];
      input?: { prompt?: string };
      created_at?: string;
    };

    const audioUrl = Array.isArray(prediction.output)
      ? prediction.output[0] ?? ""
      : prediction.output ?? "";

    return {
      id: prediction.id,
      title: prediction.input?.prompt?.slice(0, 60) ?? "GENERATED TRACK",
      audioUrl,
      duration: 0,
      status: mapReplicateStatus(prediction.status),
      metadata: {
        genre: "",
        mood: "",
        tempo: 0,
        key: "",
      },
    };
  } catch {
    return null;
  }
}

function mapReplicateStatus(
  status: string
): "queued" | "processing" | "complete" | "failed" {
  switch (status?.toLowerCase()) {
    case "succeeded":
      return "complete";
    case "starting":
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return "processing";
  }
}

export function parseMusicGenerateBlock(
  text: string
): MusicGenerateRequest | null {
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
    vocal: (get("vocal") as MusicGenerateRequest["vocal"]) || "instrumental",
    lyrics: get("lyrics") || "instrumental",
    stylePrompt: get("style_prompt"),
    duration: parseInt(get("duration")) || 30,
  };
}

export type SunoGenerateRequest = MusicGenerateRequest;
export type SunoTrack = MusicTrack;
export type SunoGenerateResponse = MusicGenerateResponse;
