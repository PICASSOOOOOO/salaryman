import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutopilotContext } from "../lib/autopilot/types";

vi.mock("../lib/pablo-creation-service", () => ({
  generateWorkspaceProjectDraft: vi.fn(),
  getWorkspaceProjectDraftStatus: vi.fn(),
}));

import {
  generateWorkspaceProjectDraft,
  getWorkspaceProjectDraftStatus,
} from "../lib/pablo-creation-service";
import { creativeWorkAutopilotHandler } from "../lib/autopilot/handlers/creative-work";

const statusMock = vi.mocked(getWorkspaceProjectDraftStatus);
const generateMock = vi.mocked(generateWorkspaceProjectDraft);

function makeContext(overrides: Partial<{
  prefs: Record<string, unknown>;
  claimAction: () => boolean;
  ensureEntitlement: () => Promise<boolean>;
  ensureCredit: () => Promise<boolean>;
}> = {}) {
  return {
    ownerId: "creative-owner",
    config: { prefs: overrides.prefs ?? { projectId: 37 } },
    claimAction: vi.fn(overrides.claimAction ?? (() => true)),
    ensureEntitlement: vi.fn(overrides.ensureEntitlement ?? (async () => true)),
    ensureCredit: vi.fn(overrides.ensureCredit ?? (async () => true)),
    log: vi.fn(async () => undefined),
  } as unknown as AutopilotContext;
}

describe("Creative Work autopilot handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the shared draft service after owner, action, Prime, and credit guards pass", async () => {
    const ctx = makeContext();
    statusMock.mockResolvedValue("ready");
    generateMock.mockResolvedValue({ status: "generated" } as Awaited<ReturnType<typeof generateWorkspaceProjectDraft>>);

    await creativeWorkAutopilotHandler(ctx);

    expect(ctx.claimAction).toHaveBeenCalledOnce();
    expect(ctx.ensureEntitlement).toHaveBeenCalledOnce();
    expect(ctx.ensureCredit).toHaveBeenCalledOnce();
    expect(generateMock).toHaveBeenCalledWith(
      "creative-owner",
      37,
      expect.stringContaining("review-only"),
      "autopilot",
    );
    expect(ctx.log).toHaveBeenCalledWith(expect.objectContaining({ action: "draft_created", outcome: "success" }));
  });

  it("waits without spending an action or AI credit when inputs have not changed", async () => {
    const ctx = makeContext();
    statusMock.mockResolvedValue("unchanged");

    await creativeWorkAutopilotHandler(ctx);

    expect(ctx.claimAction).not.toHaveBeenCalled();
    expect(ctx.ensureEntitlement).not.toHaveBeenCalled();
    expect(ctx.ensureCredit).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("does nothing until a project target is selected", async () => {
    const ctx = makeContext({ prefs: { projectId: null } });

    await creativeWorkAutopilotHandler(ctx);

    expect(statusMock).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
    expect(ctx.log).toHaveBeenCalledWith(expect.objectContaining({ action: "missing_project", outcome: "noop" }));
  });

  it("stops before generation when Prime entitlement or credit is unavailable", async () => {
    const ctx = makeContext({ ensureCredit: async () => false });
    statusMock.mockResolvedValue("ready");

    await creativeWorkAutopilotHandler(ctx);

    expect(ctx.ensureEntitlement).toHaveBeenCalledOnce();
    expect(ctx.ensureCredit).toHaveBeenCalledOnce();
    expect(generateMock).not.toHaveBeenCalled();
  });
});