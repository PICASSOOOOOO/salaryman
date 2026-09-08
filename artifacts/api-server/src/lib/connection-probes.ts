/**
 * Shared platform connection probe module.
 *
 * Every probe returns a ProbeResult with a standard shape:
 *   name, status (PASS | WARN | FAIL), detail, latencyMs, checkedAt.
 *
 * IMPORTANT: This file must NOT import @workspace/db or any module that
 * transitively imports it. It is used by both the API server (for the admin
 * status endpoint) and the standalone scheduled health-check script.
 */

export type ProbeStatus = "PASS" | "WARN" | "FAIL";

export interface ProbeResult {
  name: string;
  status: ProbeStatus;
  detail: string;
  latencyMs: number;
  checkedAt: string;
}

export interface AllProbeResults {
  results: ProbeResult[];
  overall: ProbeStatus;
  failCount: number;
  warnCount: number;
  checkedAt: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CONNECTOR_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function timedFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ res: Response; latencyMs: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(t);
  }
}

function makeResult(
  name: string,
  status: ProbeStatus,
  detail: string,
  latencyMs: number
): ProbeResult {
  return { name, status, detail, latencyMs, checkedAt: new Date().toISOString() };
}

// ── Replit connector metadata ─────────────────────────────────────────────────
// Same auth pattern as lib/resend.ts. Works in dev (REPL_IDENTITY) and in
// Scheduled Deployment runs (WEB_REPL_RENEWAL).
async function fetchConnectorSettings(
  connectorName: string
): Promise<Record<string, any> | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) return null;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) return null;
  try {
    const { res } = await timedFetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${encodeURIComponent(connectorName)}`,
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
      CONNECTOR_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.items?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Individual probes ─────────────────────────────────────────────────────────

export async function probeOpenAI(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { probeInternalProvider } = await import("./internal-ai");
    await withTimeout(probeInternalProvider("gpt"), DEFAULT_TIMEOUT_MS, "Replit-managed OpenAI integration");
    return makeResult("OpenAI (GPT)", "PASS", "Replit-managed internal integration responded", Date.now() - start);
  } catch (e: any) {
    return makeResult("OpenAI (GPT)", "FAIL", `Internal integration failed: ${e?.message || "Unknown error"}`, Date.now() - start);
  }
}

export async function probeAnthropic(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { probeInternalProvider } = await import("./internal-ai");
    await withTimeout(probeInternalProvider("claude"), DEFAULT_TIMEOUT_MS, "Replit-managed Anthropic integration");
    return makeResult("Anthropic (Claude)", "PASS", "Replit-managed internal integration responded", Date.now() - start);
  } catch (e: any) {
    return makeResult("Anthropic (Claude)", "FAIL", `Internal integration failed: ${e?.message || "Unknown error"}`, Date.now() - start);
  }
}

export async function probeResend(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const settings = await withTimeout(
      fetchConnectorSettings("resend"),
      CONNECTOR_TIMEOUT_MS,
      "Resend connector"
    );
    const connMs = Date.now() - start;
    if (!settings || !settings.settings?.api_key) {
      return makeResult(
        "Resend (Email)",
        "FAIL",
        "Connector not configured or api_key missing",
        connMs
      );
    }
    const apiKey = settings.settings.api_key as string;
    const { res: apiRes, latencyMs: apiMs } = await timedFetch(
      "https://api.resend.com/domains",
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      DEFAULT_TIMEOUT_MS
    );
    const totalMs = connMs + apiMs;
    if (apiRes.ok) {
      return makeResult("Resend (Email)", "PASS", `API key valid (HTTP ${apiRes.status})`, totalMs);
    }
    if (apiRes.status === 401 || apiRes.status === 403) {
      return makeResult("Resend (Email)", "FAIL", `API key invalid (HTTP ${apiRes.status})`, totalMs);
    }
    return makeResult("Resend (Email)", "WARN", `Unexpected response: HTTP ${apiRes.status}`, totalMs);
  } catch (e: any) {
    return makeResult("Resend (Email)", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeOpenClaw(): Promise<ProbeResult> {
  const OPENCLAW_WS_URL = "ws://127.0.0.1:18789";
  const start = Date.now();
  return new Promise<ProbeResult>((resolve) => {
    let done = false;
    const finish = (r: ProbeResult) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(() => {
      finish(makeResult(
        "OpenClaw Gateway",
        "WARN",
        "Local gateway not reachable within 2.5s (optional; AI fallback active)",
        Date.now() - start
      ));
    }, 2500);

    import("ws")
      .then(({ default: WebSocket }) => {
        const ws = new WebSocket(OPENCLAW_WS_URL);
        ws.on("open", () => {
          clearTimeout(timer);
          ws.close();
          finish(makeResult("OpenClaw Gateway", "PASS", "WebSocket reachable", Date.now() - start));
        });
        ws.on("error", () => {
          clearTimeout(timer);
          finish(makeResult(
            "OpenClaw Gateway",
            "WARN",
            "Local gateway offline (optional; Claude/GPT fallback active)",
            Date.now() - start
          ));
        });
      })
      .catch(() => {
        clearTimeout(timer);
        finish(makeResult("OpenClaw Gateway", "WARN", "ws module not available; skipping probe", Date.now() - start));
      });
  });
}

export async function probeTwilio(): Promise<ProbeResult> {
  const start = Date.now();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const num = process.env.TWILIO_PHONE_NUMBER;
  const missing = [!sid && "TWILIO_ACCOUNT_SID", !token && "TWILIO_AUTH_TOKEN"].filter(Boolean);
  if (missing.length) {
    return makeResult("Twilio", "FAIL", `Missing env vars: ${missing.join(", ")}`, 0);
  }
  try {
    const { res, latencyMs } = await timedFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid!)}.json`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return makeResult("Twilio", "FAIL", `HTTP ${res.status}: ${body.slice(0, 150)}`, latencyMs);
    }
    const data: any = await res.json().catch(() => ({}));
    const status = data.status ?? "unknown";
    if (status !== "active") {
      return makeResult("Twilio", "FAIL", `Account status: "${status}" (expected active)`, latencyMs);
    }
    return makeResult("Twilio", "PASS", `Account active${num ? `, number ${num}` : " (no TWILIO_PHONE_NUMBER set)"}`, latencyMs);
  } catch (e: any) {
    return makeResult("Twilio", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeElevenLabs(): Promise<ProbeResult> {
  const start = Date.now();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return makeResult("ElevenLabs (TTS)", "WARN", "ELEVENLABS_API_KEY not set — phone TTS falls back to Google TTS", 0);
  }
  try {
    const { res, latencyMs } = await timedFetch(
      "https://api.elevenlabs.io/v1/user",
      { headers: { "xi-api-key": key, Accept: "application/json" } }
    );
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const tier = data.subscription?.tier ?? "unknown";
      return makeResult("ElevenLabs (TTS)", "PASS", `Account reachable, subscription tier: ${tier}`, latencyMs);
    }
    if (res.status === 401) {
      return makeResult("ElevenLabs (TTS)", "FAIL", "Invalid API key (HTTP 401)", latencyMs);
    }
    return makeResult("ElevenLabs (TTS)", "WARN", `Unexpected HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    return makeResult("ElevenLabs (TTS)", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeStripe(): Promise<ProbeResult> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return makeResult("Stripe (Payments)", "FAIL", "STRIPE_SECRET_KEY not set", 0);
  }
  try {
    const { res, latencyMs } = await timedFetch(
      "https://api.stripe.com/v1/balance",
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      }
    );
    if (res.ok) {
      return makeResult("Stripe (Payments)", "PASS", "Balance endpoint reachable, key valid", latencyMs);
    }
    if (res.status === 401) {
      return makeResult("Stripe (Payments)", "FAIL", "Invalid Stripe secret key (HTTP 401)", latencyMs);
    }
    return makeResult("Stripe (Payments)", "WARN", `HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    return makeResult("Stripe (Payments)", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeNanaBanana(): Promise<ProbeResult> {
  const start = Date.now();
  const key = process.env.NANO_BANANA_API_KEY;
  if (!key) {
    return makeResult(
      "Nano Banana (Image Gen)",
      "WARN",
      "NANO_BANANA_API_KEY not set — AI image generation unavailable",
      0
    );
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const probeStart = Date.now();
  try {
    const res = await fetch("https://api.apipass.dev", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - probeStart;
    clearTimeout(t);
    if ([402, 429, 500, 502, 503, 504].includes(res.status)) {
      return makeResult("Nano Banana (Image Gen)", "FAIL", `apipass service issue: HTTP ${res.status}`, latencyMs);
    }
    return makeResult("Nano Banana (Image Gen)", "PASS", `apipass reachable (HTTP ${res.status})`, latencyMs);
  } catch (e: any) {
    clearTimeout(t);
    return makeResult("Nano Banana (Image Gen)", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeReplicate(): Promise<ProbeResult> {
  const start = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return makeResult(
      "Replicate (Music Gen)",
      "WARN",
      "REPLICATE_API_TOKEN not set — music generation unavailable",
      0
    );
  }
  try {
    const { res, latencyMs } = await timedFetch(
      "https://api.replicate.com/v1/account",
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return makeResult("Replicate (Music Gen)", "PASS", `Account ok: ${data.username ?? "unknown"}`, latencyMs);
    }
    if (res.status === 401) {
      return makeResult("Replicate (Music Gen)", "FAIL", "Invalid token (HTTP 401)", latencyMs);
    }
    return makeResult("Replicate (Music Gen)", "WARN", `HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    return makeResult("Replicate (Music Gen)", "FAIL", e?.message || "Unknown error", Date.now() - start);
  }
}

export async function probeObjectStorage(): Promise<ProbeResult> {
  const start = Date.now();
  const SIDECAR = "http://127.0.0.1:1106";
  const pubPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  const privDir = process.env.PRIVATE_OBJECT_DIR;
  if (!pubPaths && !privDir) {
    return makeResult(
      "Object Storage",
      "WARN",
      "PUBLIC_OBJECT_SEARCH_PATHS and PRIVATE_OBJECT_DIR not set",
      0
    );
  }
  try {
    const { res, latencyMs } = await timedFetch(`${SIDECAR}/token`, {}, 5_000);
    if (res.ok || res.status === 405 || res.status === 400) {
      return makeResult("Object Storage", "PASS", `Replit storage sidecar reachable (HTTP ${res.status})`, latencyMs);
    }
    return makeResult("Object Storage", "WARN", `Storage sidecar HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    return makeResult(
      "Object Storage",
      "FAIL",
      `Storage sidecar unreachable: ${e?.message || e}`,
      Date.now() - start
    );
  }
}

export async function probeMusicBrainz(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(
      "https://musicbrainz.org/ws/2/release?query=artist:radiohead&limit=1&fmt=json",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "SALARYMAN-HealthCheck/1.0 (health@picassoo.app)",
        },
      }
    );
    if (res.ok) {
      return makeResult("MusicBrainz", "PASS", `Public API reachable (HTTP ${res.status})`, latencyMs);
    }
    if (res.status === 503) {
      return makeResult("MusicBrainz", "WARN", "Rate-limited or under maintenance (HTTP 503)", latencyMs);
    }
    return makeResult("MusicBrainz", "WARN", `HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    // MusicBrainz is an optional public enrichment service. A timeout must not
    // mark the whole platform unhealthy or page the owner when CRM, phone, and
    // automation services are otherwise available.
    return makeResult("MusicBrainz", "WARN", `Public API unavailable: ${e?.message || "Unknown error"}`, Date.now() - start);
  }
}

export async function probeInternalApi(baseUrl: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(`${baseUrl}/api/healthz`, {}, DEFAULT_TIMEOUT_MS);
    if (res.ok) {
      return makeResult("Internal API (/api/healthz)", "PASS", `HTTP ${res.status}`, latencyMs);
    }
    return makeResult("Internal API (/api/healthz)", "FAIL", `HTTP ${res.status}`, latencyMs);
  } catch (e: any) {
    return makeResult(
      "Internal API (/api/healthz)",
      "FAIL",
      `Unreachable: ${e?.message || e}`,
      Date.now() - start
    );
  }
}

/**
 * Structural probe of the internal API: hit an auth-enforced route unauthenticated
 * and expect a 401. A 401 proves the router is mounted AND its auth middleware is
 * enforced end-to-end; a 404 means the route (or its router) is unmounted — a
 * structural regression the liveness probe alone can't catch; a 200 means auth is
 * NOT being enforced (a security regression); a 5xx means the handler is throwing.
 */
export async function probeInternalApiAuth(baseUrl: string): Promise<ProbeResult> {
  const name = "Internal API (auth enforced)";
  const start = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(
      `${baseUrl}/api/economy/bank/accounts`,
      { headers: { Accept: "application/json" } },
      DEFAULT_TIMEOUT_MS
    );
    if (res.status === 401) {
      return makeResult(name, "PASS", "GET /api/economy/bank/accounts → 401 (mounted, auth enforced)", latencyMs);
    }
    if (res.status === 404) {
      return makeResult(name, "FAIL", "GET /api/economy/bank/accounts → 404 (route/router unmounted!)", latencyMs);
    }
    if (res.status === 200) {
      return makeResult(name, "FAIL", "GET /api/economy/bank/accounts → 200 (auth NOT enforced!)", latencyMs);
    }
    if (res.status >= 500) {
      return makeResult(name, "FAIL", `GET /api/economy/bank/accounts → ${res.status} (server error)`, latencyMs);
    }
    return makeResult(name, "WARN", `GET /api/economy/bank/accounts → ${res.status} (expected 401)`, latencyMs);
  } catch (e: any) {
    return makeResult(name, "FAIL", `Unreachable: ${e?.message || e}`, Date.now() - start);
  }
}

// ── Run all probes ────────────────────────────────────────────────────────────

export async function runAllProbes(baseUrl = "https://salaryman.io"): Promise<AllProbeResults> {
  const results = await Promise.all([
    probeOpenAI(),
    probeAnthropic(),
    probeOpenClaw(),
    probeTwilio(),
    probeResend(),
    probeElevenLabs(),
    probeStripe(),
    probeNanaBanana(),
    probeReplicate(),
    probeObjectStorage(),
    probeMusicBrainz(),
    probeInternalApi(baseUrl),
    probeInternalApiAuth(baseUrl),
  ]);

  const failCount = results.filter((r) => r.status === "FAIL").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const overall: ProbeStatus = failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS";

  return { results, overall, failCount, warnCount, checkedAt: new Date().toISOString() };
}
