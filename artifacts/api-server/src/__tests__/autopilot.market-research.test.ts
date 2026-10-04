import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutopilotContext } from "../lib/autopilot/types";
import { extractWebSearchCitations } from "../lib/autopilot/research-sources";
import { sanitizeMarketResearchPrefs } from "../lib/autopilot/market-research-prefs";

vi.mock("../lib/pablo-live", () => ({
  pabloWebSearchWithSources: vi.fn(),
}));

import { pabloWebSearchWithSources } from "../lib/pablo-live";
import { marketResearchAutopilotHandler } from "../lib/autopilot/handlers/market-research";

const searchMock = vi.mocked(pabloWebSearchWithSources);

function makeContext(prefs: Record<string, unknown> = { subject: "Clinic payroll software" }) {
  return {
    ownerId: "market-research-owner",
    config: { prefs },
    claimAction: vi.fn(() => true),
    ensureEntitlement: vi.fn(async () => true),
    ensureCredit: vi.fn(async () => true),
    log: vi.fn(async () => undefined),
  } as unknown as AutopilotContext;
}

describe("Market Research preferences and citations", () => {
  it("trims and bounds the saved research scope", () => {
    expect(sanitizeMarketResearchPrefs({
      subject: `  ${"x".repeat(200)}  `,
      region: "  Ho Chi Minh City ",
      competitors: "  A, B ",
      ignored: "not persisted",
    })).toEqual({
      subject: "x".repeat(180),
      region: "Ho Chi Minh City",
      competitors: "A, B",
    });
    expect(sanitizeMarketResearchPrefs(null)).toEqual({ subject: "", region: "", competitors: "" });
  });

  it("extracts unique HTTP(S) citations and ignores unsafe or malformed URLs", () => {
    const sources = extractWebSearchCitations({
      output: [{
        content: [{
          annotations: [
            { type: "url_citation", url: "https://example.com/report", title: "Report" },
            { type: "url_citation", url: "https://example.com/report", title: "Duplicate" },
            { type: "url_citation", url: "javascript:alert(1)", title: "Unsafe" },
            { type: "url_citation", url: "not a url", title: "Malformed" },
          ],
        }],
      }],
    });
    expect(sources).toEqual([{ title: "Report", url: "https://example.com/report" }]);
  });
});

describe("Market Research autopilot handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a sourced review-only brief only after the shared guards pass", async () => {
    const ctx = makeContext({
      subject: "Clinic payroll software",
      region: "Vietnam",
      competitors: "Provider A, Provider B",
    });
    searchMock.mockResolvedValue({
      text: "Market signals\n- Adoption is increasing.\n\nCompetitor snapshot\n- Provider A offers payroll tools.",
      sources: [{ title: "Industry report", url: "https://example.com/industry-report" }],
    });

    await marketResearchAutopilotHandler(ctx);

    expect(ctx.claimAction).toHaveBeenCalledOnce();
    expect(ctx.ensureEntitlement).toHaveBeenCalledOnce();
    expect(ctx.ensureCredit).toHaveBeenCalledOnce();
    expect(searchMock).toHaveBeenCalledWith(expect.stringContaining("Clinic payroll software"));
    expect(searchMock).toHaveBeenCalledWith(expect.stringContaining("Vietnam"));
    expect(ctx.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "research_brief",
      outcome: "success",
      detail: expect.objectContaining({
        reviewStatus: "needs_owner_review",
        report: expect.stringContaining("Market signals"),
        sources: [{ title: "Industry report", url: "https://example.com/industry-report" }],
      }),
    }));
  });

  it("does not call the search provider when the action cap is exhausted", async () => {
    const ctx = makeContext();
    vi.mocked(ctx.claimAction).mockReturnValue(false);

    await marketResearchAutopilotHandler(ctx);

    expect(ctx.ensureEntitlement).not.toHaveBeenCalled();
    expect(ctx.ensureCredit).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("does not save an uncited answer as a research brief", async () => {
    const ctx = makeContext();
    searchMock.mockResolvedValue({ text: "Uncited answer", sources: [] });

    await marketResearchAutopilotHandler(ctx);

    expect(ctx.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "research_unavailable",
      outcome: "error",
    }));
    expect(ctx.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: "research_brief" }));
  });

  it("waits for a configured subject before using actions or AI", async () => {
    const ctx = makeContext({ subject: " " });

    await marketResearchAutopilotHandler(ctx);

    expect(ctx.claimAction).not.toHaveBeenCalled();
    expect(ctx.ensureCredit).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });
});