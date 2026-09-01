import { beforeEach, describe, expect, it, vi } from "vitest";

const probeInternalProvider = vi.fn();
vi.mock("../lib/internal-ai", () => ({ probeInternalProvider }));

describe("AI connection probes", () => {
  beforeEach(() => probeInternalProvider.mockReset());

  it("checks Replit-managed GPT rather than an external connector", async () => {
    probeInternalProvider.mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { probeOpenAI } = await import("../lib/connection-probes");
    await expect(probeOpenAI()).resolves.toMatchObject({
      status: "PASS",
      detail: "Replit-managed internal integration responded",
    });
    expect(probeInternalProvider).toHaveBeenCalledWith("gpt");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

});