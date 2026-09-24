import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessMock = vi.hoisted(() => ({
  hasPabloVoiceAccess: vi.fn(),
}));

vi.mock("../lib/pablo-voice-access", () => accessMock);

import openAiRouter from "../routes/openai";

function appWithAuth(authenticated: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    if (authenticated) (req as any).user = { id: "voice-test-user" };
    next();
  });
  app.use(openAiRouter);
  return app;
}

function mockElevenLabsSuccess() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Pablo TTS route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-elevenlabs-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["/tts", { text: "Hello", character: "PABLO" }],
    ["/game-tts", { text: "Hello", character: "PABLO" }],
    ["/tts", { text: "Hello" }],
  ])("rejects unauthenticated Pablo voice requests at %s before ElevenLabs", async (path, body) => {
    const fetchMock = mockElevenLabsSuccess();
    const response = await request(appWithAuth(false)).post(path).send(body);

    expect(response.status).toBe(401);
    expect(accessMock.hasPabloVoiceAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated free users before ElevenLabs", async () => {
    const fetchMock = mockElevenLabsSuccess();
    accessMock.hasPabloVoiceAccess.mockResolvedValue(false);

    const response = await request(appWithAuth(true))
      .post("/tts")
      .send({ text: "Hello", character: "PABLO" });

    expect(response.status).toBe(403);
    expect(accessMock.hasPabloVoiceAccess).toHaveBeenCalledWith("voice-test-user");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an entitled user through to the Pablo voice provider", async () => {
    const fetchMock = mockElevenLabsSuccess();
    accessMock.hasPabloVoiceAccess.mockResolvedValue(true);

    const response = await request(appWithAuth(true))
      .post("/tts")
      .send({ text: "Hello", character: "PABLO" });

    expect(response.status).toBe(200);
    expect(response.headers["x-tts-provider"]).toBe("elevenlabs");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});