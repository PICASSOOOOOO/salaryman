import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProbeResult, ProbeStatus } from "../lib/connection-probes";
import {
  reconcileConnectionHealth,
  resetConnectionMonitorState,
  connHealthMonitorEnabled,
  connStateOf,
  connectionSlug,
  renderConnectionAlertEmail,
  CONN_HEALTH_DEBOUNCE_MS,
} from "../lib/connection-health-monitor";

const NAME = "Stripe (Payments)";

function probe(status: ProbeStatus, detail = ""): ProbeResult[] {
  return [{ name: NAME, status, detail, latencyMs: 1, checkedAt: new Date(0).toISOString() }];
}

describe("connStateOf", () => {
  it("maps FAIL to broken and PASS/WARN to healthy (WARN never alerts)", () => {
    expect(connStateOf("FAIL")).toBe("broken");
    expect(connStateOf("PASS")).toBe("healthy");
    expect(connStateOf("WARN")).toBe("healthy");
  });
});

describe("connectionSlug", () => {
  it("produces a stable, namespaced, <=64-char slug", () => {
    expect(connectionSlug(NAME)).toBe("conn:stripe-payments");
    expect(connectionSlug("Internal API (auth enforced)")).toBe("conn:internal-api-auth-enforced");
    expect(connectionSlug(NAME).length).toBeLessThanOrEqual(64);
  });
});

describe("reconcileConnectionHealth (debounced transition detection)", () => {
  beforeEach(() => resetConnectionMonitorState());

  it("treats the first observation as a silent baseline (never alerts)", () => {
    expect(reconcileConnectionHealth(probe("PASS"), 0)).toEqual([]);
    expect(reconcileConnectionHealth(probe("FAIL"), 0)).toEqual([]);
  });

  it("alerts only after a break has held for the debounce window", () => {
    expect(reconcileConnectionHealth(probe("PASS"), 0)).toEqual([]); // baseline healthy
    expect(reconcileConnectionHealth(probe("FAIL", "HTTP 500"), 1_000)).toEqual([]); // not yet
    expect(reconcileConnectionHealth(probe("FAIL", "HTTP 500"), CONN_HEALTH_DEBOUNCE_MS)).toEqual([]);
    const fired = reconcileConnectionHealth(probe("FAIL", "HTTP 500"), 1_000 + CONN_HEALTH_DEBOUNCE_MS);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      name: NAME,
      slug: "conn:stripe-payments",
      from: "healthy",
      to: "broken",
      status: "FAIL",
      detail: "HTTP 500",
    });
  });

  it("does NOT alert a connection that recovers before the window", () => {
    reconcileConnectionHealth(probe("PASS"), 0); // baseline
    reconcileConnectionHealth(probe("FAIL"), 1_000); // start break
    expect(reconcileConnectionHealth(probe("PASS"), 1_500)).toEqual([]); // recovered early
    expect(reconcileConnectionHealth(probe("PASS"), 10 * CONN_HEALTH_DEBOUNCE_MS)).toEqual([]);
  });

  it("treats a WARN as healthy so unconfigured optional integrations don't alert", () => {
    reconcileConnectionHealth(probe("PASS"), 0); // baseline healthy
    // WARN maps to healthy → no transition ever, even after the window.
    expect(reconcileConnectionHealth(probe("WARN"), CONN_HEALTH_DEBOUNCE_MS)).toEqual([]);
    expect(reconcileConnectionHealth(probe("WARN"), 5 * CONN_HEALTH_DEBOUNCE_MS)).toEqual([]);
  });

  it("resets the debounce clock when the candidate flaps back and forth", () => {
    reconcileConnectionHealth(probe("PASS"), 0); // baseline healthy
    reconcileConnectionHealth(probe("FAIL"), 1_000); // candidate broken @1s
    reconcileConnectionHealth(probe("PASS"), 1_500); // recover (clears pending)
    reconcileConnectionHealth(probe("FAIL"), CONN_HEALTH_DEBOUNCE_MS); // new clock starts here
    expect(reconcileConnectionHealth(probe("FAIL"), CONN_HEALTH_DEBOUNCE_MS + 1_000)).toEqual([]);
    const fired = reconcileConnectionHealth(probe("FAIL"), 2 * CONN_HEALTH_DEBOUNCE_MS);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ from: "healthy", to: "broken" });
  });

  it("fires a recovery alert after a broken state settles back healthy", () => {
    reconcileConnectionHealth(probe("PASS"), 0); // baseline
    reconcileConnectionHealth(probe("FAIL"), 1_000);
    const drop = reconcileConnectionHealth(probe("FAIL"), 1_000 + CONN_HEALTH_DEBOUNCE_MS);
    expect(drop).toHaveLength(1); // stable = broken now

    const t = 1_000 + CONN_HEALTH_DEBOUNCE_MS;
    reconcileConnectionHealth(probe("PASS"), t + 1); // recovery candidate
    const recovery = reconcileConnectionHealth(probe("PASS"), t + 1 + CONN_HEALTH_DEBOUNCE_MS);
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({ from: "broken", to: "healthy" });
  });

  it("tracks multiple connections independently", () => {
    const two = (a: ProbeStatus, b: ProbeStatus): ProbeResult[] => [
      { name: "Stripe (Payments)", status: a, detail: "", latencyMs: 1, checkedAt: "" },
      { name: "OpenAI (GPT)", status: b, detail: "", latencyMs: 1, checkedAt: "" },
    ];
    reconcileConnectionHealth(two("PASS", "PASS"), 0); // baseline both
    reconcileConnectionHealth(two("FAIL", "PASS"), 1_000); // only Stripe breaks
    const fired = reconcileConnectionHealth(two("FAIL", "PASS"), 1_000 + CONN_HEALTH_DEBOUNCE_MS);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ name: "Stripe (Payments)", to: "broken" });
  });
});

describe("connHealthMonitorEnabled (env toggle)", () => {
  const prev = process.env.CONN_HEALTH_MONITOR;
  afterEach(() => {
    if (prev === undefined) delete process.env.CONN_HEALTH_MONITOR;
    else process.env.CONN_HEALTH_MONITOR = prev;
  });

  it("defaults to enabled when unset", () => {
    delete process.env.CONN_HEALTH_MONITOR;
    expect(connHealthMonitorEnabled()).toBe(true);
  });

  it.each(["off", "false", "0", "no", "OFF", " False "])("is silenced by %s", (val) => {
    process.env.CONN_HEALTH_MONITOR = val;
    expect(connHealthMonitorEnabled()).toBe(false);
  });

  it("stays enabled for any other value", () => {
    process.env.CONN_HEALTH_MONITOR = "on";
    expect(connHealthMonitorEnabled()).toBe(true);
  });
});

describe("renderConnectionAlertEmail", () => {
  it("renders a DOWN alert with the last error, escaped", () => {
    const { subject, html, text } = renderConnectionAlertEmail({
      slug: "conn:stripe-payments",
      name: NAME,
      from: "healthy",
      to: "broken",
      status: "FAIL",
      detail: "5xx <bad> & timeout",
    });
    expect(subject).toContain("DOWN");
    expect(subject).toContain(NAME);
    expect(html).toContain("&lt;bad&gt;");
    expect(html).not.toContain("<bad>");
    expect(text).toContain("5xx <bad> & timeout");
  });

  it("renders a RECOVERED alert without an error line", () => {
    const { subject, html } = renderConnectionAlertEmail({
      slug: "conn:stripe-payments",
      name: NAME,
      from: "broken",
      to: "healthy",
      status: "PASS",
      detail: "",
    });
    expect(subject).toContain("RECOVERED");
    expect(html).toContain("recovered");
    expect(html).not.toContain("Last error");
  });
});
