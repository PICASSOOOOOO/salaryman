import { PABLO_VOICE_ID } from "./pablo-voice";

export async function synthesizePabloLine(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs is not configured");
  if (!text.trim()) throw new Error("Speech text is required");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${PABLO_VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs synthesis failed (${response.status})`);
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/")) {
    throw new Error("ElevenLabs returned a non-audio response");
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error("ElevenLabs returned empty audio");
  return audio;
}