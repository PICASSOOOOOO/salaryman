import { afterEach, describe, expect, it, vi } from "vitest";

describe("critical platform surface probes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes when a protected CALLL HOME/CRM/automation route returns 401", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Login required" }), { status: 401 }),
    );
    const { probeProtectedSurface } = await import("../lib/connection-probes");

    await expect(
      probeProtectedSurface("https://salaryman.io", "CRM API surface", "/api/crm/summary"),
    ).resolves.toMatchObject({
      status: "PASS",
      detail: "GET /api/crm/summary → 401 (mounted, auth enforced)",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://salaryman.io/api/crm/summary",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("fails when a critical surface is missing or stops enforcing auth", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const { probeProtectedSurface } = await import("../lib/connection-probes");

    await expect(
      probeProtectedSurface("https://salaryman.io", "CALLL HOME API surface", "/api/twilio/system-status"),
    ).resolves.toMatchObject({ status: "FAIL" });
    await expect(
      probeProtectedSurface("https://salaryman.io", "Pablo Prime automation surface", "/api/autopilot"),
    ).resolves.toMatchObject({ status: "FAIL" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});