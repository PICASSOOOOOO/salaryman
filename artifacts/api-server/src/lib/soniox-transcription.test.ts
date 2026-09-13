import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SonioxNotConfiguredError,
  transcribeWithSoniox,
} from "./soniox-transcription";

const originalApiKey = process.env.SONIOX_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.SONIOX_API_KEY;
  else process.env.SONIOX_API_KEY = originalApiKey;
});

describe("Soniox transcription adapter", () => {
  it("requires the server-side Soniox secret", async () => {
    delete process.env.SONIOX_API_KEY;
    await expect(transcribeWithSoniox({
      audioBuffer: Buffer.from("audio"),
      filename: "audio.webm",
    })).rejects.toBeInstanceOf(SonioxNotConfiguredError);
  });

  it("uploads, polls, reads translated tokens, and cleans up", async () => {
    process.env.SONIOX_API_KEY = "test-soniox-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;

      if (path === "/v1/files") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        const file = (init?.body as FormData).get("file");
        expect(file).toBeInstanceOf(Blob);
        expect((file as File).name).toBe("audio.webm");
        return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
      }
      if (path === "/v1/transcriptions" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          model: "stt-async-v5",
          file_id: "file-1",
          enable_language_identification: true,
          translation: { type: "one_way", target_language: "vi" },
        });
        return new Response(JSON.stringify({ id: "transcription-1" }), { status: 200 });
      }
      if (path === "/v1/transcriptions/transcription-1") {
        return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
      }
      if (path === "/v1/transcriptions/transcription-1/transcript") {
        return new Response(JSON.stringify({
          text: "Hello",
          tokens: [
            { text: "Hello", translation_status: "original" },
            { text: " Xin chào", translation_status: "translation" },
          ],
        }), { status: 200 });
      }
      if (path === "/v1/transcriptions/transcription-1" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (path === "/v1/files/file-1" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected Soniox request: ${init?.method ?? "GET"} ${path}`);
    });

    await expect(transcribeWithSoniox({
      audioBuffer: Buffer.from("audio"),
      filename: "audio.webm",
      mimeType: "audio/webm",
      translationTo: "vi",
    })).resolves.toEqual({
      text: "Xin chào",
      sourceText: "Hello",
      translation: "Xin chào",
    });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
  });

  it("uses source text when Soniox returns no translated tokens", async () => {
    process.env.SONIOX_API_KEY = "test-soniox-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === "/v1/files") return new Response(JSON.stringify({ id: "file-2" }));
      if (path === "/v1/transcriptions" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "transcription-2" }));
      }
      if (path === "/v1/transcriptions/transcription-2") {
        return new Response(JSON.stringify({ status: "completed" }));
      }
      if (path.endsWith("/transcript")) {
        return new Response(JSON.stringify({ text: "Hello there", tokens: [] }));
      }
      return new Response(null, { status: 204 });
    });

    await expect(transcribeWithSoniox({
      audioBuffer: Buffer.from("audio"),
      filename: "audio.webm",
    })).resolves.toEqual({
      text: "Hello there",
      sourceText: "Hello there",
    });
  });
});