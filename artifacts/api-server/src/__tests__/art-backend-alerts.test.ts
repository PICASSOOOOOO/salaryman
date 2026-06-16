import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProviderSummary, ProviderHealth } from "../lib/art-providers";
import {
  reconcileBackendHealth,
  resetBackendAlertState,
  artBackendAlertsEnabled,
  renderTransitionEmail,
  ALERT_DEBOUNCE_MS,
} from "../lib/art-providers/backend-alerts";

const ID = "fal";
const LABEL = "FAL (FLUX)";

function summary(health: ProviderHealth, lastError: string | null = null): ProviderSummary[] {
  return [
    {
      id: ID,
      label: LABEL,
      description: "",
      configured: health !== "not-configured",
      isDefault: false,
      health,
      lastError,
    },
  ];
}

describe("reconcileBackendHealth (debounced transition detection)", () => {
  beforeEach(() => resetBackendAlertState());

  it("treats the first observation as a silent baseline (never alerts)", () => {
    expect(reconcileBackendHealth(summary("online"), 0)).toEqual([]);
    expect(reconcileBackendHealth(summary("offline"), 0)).toEqual([]);
  });

  it("alerts only after a drop has held for the debounce window", () => {
    // Baseline online.
    expect(reconcileBackendHealth(summary("online"), 0)).toEqual([]);
    // Goes offline — not yet debounced.
    expect(reconcileBackendHealth(summary("offline", "timeout"), 1_000)).toEqual([]);
    // Still offline but before window elapses — nothing.
    expect(reconcileBackendHealth(summary("offline", "timeout"), ALERT_DEBOUNCE_MS)).toEqual([]);
    // Window elapsed (measured from first offline reading at t=1_000).
    const fired = reconcileBackendHealth(summary("offline", "timeout"), 1_000 + ALERT_DEBOUNCE_MS);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ id: ID, from: "online", to: "offline", lastError: "timeout" });
  });

  it("does NOT alert a flapping node that recovers before the window", () => {
    reconcileBackendHealth(summary("online"), 0); // baseline
    reconcileBackendHealth(summary("offline"), 1_000); // start drop
    // Recovers to the stable state well before debounce — drops the pending alert.
    expect(reconcileBackendHealth(summary("online"), 1_500)).toEqual([]);
    // Even long after, no stale alert leaks out.
    expect(reconcileBackendHealth(summary("online"), 10 * ALERT_DEBOUNCE_MS)).toEqual([]);
  });

  it("resets the debounce clock when the candidate flaps to the other state", () => {
    reconcileBackendHealth(summary("online"), 0); // baseline online
    reconcileBackendHealth(summary("offline"), 1_000); // candidate offline @1s
    // Flap: back online (clears pending), then offline again @ near the old deadline.
    reconcileBackendHealth(summary("online"), 1_500);
    reconcileBackendHealth(summary("offline"), ALERT_DEBOUNCE_MS); // new clock starts here
    // At what would have been the ORIGINAL deadline, still nothing (clock reset).
    expect(reconcileBackendHealth(summary("offline"), ALERT_DEBOUNCE_MS + 1_000)).toEqual([]);
    // Only once the NEW window fully elapses does it fire.
    const fired = reconcileBackendHealth(summary("offline"), 2 * ALERT_DEBOUNCE_MS);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ from: "online", to: "offline" });
  });

  it("fires a recovery alert after an offline state settles back online", () => {
    reconcileBackendHealth(summary("online"), 0); // baseline
    reconcileBackendHealth(summary("offline"), 1_000);
    const drop = reconcileBackendHealth(summary("offline"), 1_000 + ALERT_DEBOUNCE_MS);
    expect(drop).toHaveLength(1); // now stable = offline

    const t = 1_000 + ALERT_DEBOUNCE_MS;
    reconcileBackendHealth(summary("online"), t + 1); // recovery candidate
    const recovery = reconcileBackendHealth(summary("online"), t + 1 + ALERT_DEBOUNCE_MS);
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({ from: "offline", to: "online" });
  });

  it("ignores unknown / not-configured backends entirely", () => {
    expect(reconcileBackendHealth(summary("unknown"), 0)).toEqual([]);
    expect(reconcileBackendHealth(summary("not-configured"), ALERT_DEBOUNCE_MS)).toEqual([]);
    // Even repeated, no transition is ever produced for an untracked health.
    expect(reconcileBackendHealth(summary("unknown"), 10 * ALERT_DEBOUNCE_MS)).toEqual([]);
  });
});

describe("artBackendAlertsEnabled (env toggle)", () => {
  const prev = process.env.ART_BACKEND_ALERTS;
  afterEach(() => {
    if (prev === undefined) delete process.env.ART_BACKEND_ALERTS;
    else process.env.ART_BACKEND_ALERTS = prev;
  });

  it("defaults to enabled when unset", () => {
    delete process.env.ART_BACKEND_ALERTS;
    expect(artBackendAlertsEnabled()).toBe(true);
  });

  it.each(["off", "false", "0", "no", "OFF", " False "])(
    "is silenced by %s",
    (val) => {
      process.env.ART_BACKEND_ALERTS = val;
      expect(artBackendAlertsEnabled()).toBe(false);
    },
  );

  it("stays enabled for any other value", () => {
    process.env.ART_BACKEND_ALERTS = "on";
    expect(artBackendAlertsEnabled()).toBe(true);
  });
});

describe("renderTransitionEmail", () => {
  it("renders an offline alert with the last error, escaped", () => {
    const { subject, html, text } = renderTransitionEmail({
      id: ID,
      label: LABEL,
      from: "online",
      to: "offline",
      lastError: "5xx <bad> & timeout",
    });
    expect(subject).toContain("OFFLINE");
    expect(subject).toContain(LABEL);
    expect(html).toContain("&lt;bad&gt;");
    expect(html).not.toContain("<bad>");
    expect(text).toContain("5xx <bad> & timeout");
  });

  it("renders a recovery alert without an error line", () => {
    const { subject, html } = renderTransitionEmail({
      id: ID,
      label: LABEL,
      from: "offline",
      to: "online",
      lastError: null,
    });
    expect(subject).toContain("RECOVERED");
    expect(html).toContain("recovered");
    expect(html).not.toContain("Last error");
  });
});
