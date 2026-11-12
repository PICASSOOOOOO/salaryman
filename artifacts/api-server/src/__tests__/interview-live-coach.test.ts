import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: mocks.completionCreate } } },
}));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: mocks.speechToText,
  ensureCompatibleFormat: mocks.ensureCompatibleFormat,
}));
vi.mock("../lib/usage-meter", () => ({ recordUsage: mocks.recordUsage }));
vi.mock("../middlewares/requirePro", () => ({
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePro: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import interviewRouter from "../routes/interview";

function appWithUser() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "prep-test-user" };
    next();
  });
  app.use(interviewRouter);
  return app;
}

describe("scenario-specific live preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureCompatibleFormat.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), format: "wav" });
    mocks.speechToText.mockResolvedValue("We need to agree on a launch date and owner.");
    mocks.completionCreate.mockResolvedValue((async function* () {
      yield { choices: [{ delta: { content: "CONTEXT: A launch date and owner are undecided.\n" } }] };
      yield { choices: [{ delta: { content: "SAY: Can we choose an owner and date today?\nSKILL: Summarize the decision before closing." } }] };
    })());
    mocks.recordUsage.mockResolvedValue(1);
  });

  it.each([
    ["interview", "prep_interview"],
    ["meeting", "prep_meeting"],
    ["pitch", "prep_pitch"],
    ["presentation", "prep_presentation"],
    ["management", "prep_management"],
    ["hiring", "prep_hiring"],
    ["firing", "prep_firing"],
    ["difficult_conversation", "prep_difficult_conversation"],
  ] as const)("uses conversation context and records %s independently", async (scenario, usageKind) => {
    const response = await request(appWithUser())
      .post("/interview/listen")
      .send({ audio: Buffer.from([1, 2, 3]).toString("base64"), scenario });

    expect(response.status).toBe(200);
    expect(response.text).toContain("CONTEXT:");
    expect(response.text).toContain("SAY:");
    expect(response.text).toContain("SKILL:");
    expect(mocks.completionCreate.mock.calls[0][0].messages[1].content).toContain(
      "We need to agree on a launch date and owner.",
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith("prep-test-user", usageKind);
  });
});
