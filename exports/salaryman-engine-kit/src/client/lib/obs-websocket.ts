// ── Browser-side OBS WebSocket (v5) client ───────────────────────────────────
// Lets a player drive their OWN locally-running OBS Studio / Streamlabs Desktop
// straight from inside SALARYMAN: connect, start/stop recording, start/stop
// streaming, and read live status (live / recording, elapsed time, dropped
// frames / congestion). We speak the OBS WebSocket v5 protocol directly over a
// plain WebSocket — no third-party library, no server of ours involved. The
// connection is browser → the user's localhost OBS only.
//
// Mixed-content note: the app is served over HTTPS but OBS exposes an insecure
// ws:// endpoint. Browsers special-case localhost / 127.0.0.1 as a trustworthy
// origin, so ws://localhost:4455 connects fine from an https page; a LAN IP
// would be blocked by the mixed-content policy. The setup guide tells players to
// keep the default localhost host.
//
// A single module-level client instance backs the whole app so the connection
// survives navigating away from the Settings page and the UI can subscribe via
// useSyncExternalStore.

export type ObsConnState = "disconnected" | "connecting" | "connected" | "error";

export interface ObsStatus {
  connState: ObsConnState;
  /** Human-readable last error, cleared on a fresh connect. */
  error: string | null;
  streaming: boolean;
  recording: boolean;
  recordPaused: boolean;
  /** "HH:MM:SS" timecode of the active stream (empty when not streaming). */
  streamTimecode: string;
  /** "HH:MM:SS" timecode of the active recording (empty when not recording). */
  recordTimecode: string;
  /** 0..1 network congestion as reported by OBS while streaming. */
  congestion: number;
  /** Frames dropped by the streaming output (network). */
  skippedFrames: number;
  /** Total frames produced by the streaming output. */
  totalFrames: number;
  /** OBS process CPU usage (0..1) from GetStats. */
  cpuUsage: number;
  /** OBS active render FPS from GetStats. */
  fps: number;
}

const INITIAL_STATUS: ObsStatus = {
  connState: "disconnected",
  error: null,
  streaming: false,
  recording: false,
  recordPaused: false,
  streamTimecode: "",
  recordTimecode: "",
  congestion: 0,
  skippedFrames: 0,
  totalFrames: 0,
  cpuUsage: 0,
  fps: 0,
};

// OBS WebSocket v5 opcodes.
const OP = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Event: 5,
  Request: 6,
  RequestResponse: 7,
} as const;

// EventSubscriptions bitmask — we only need the "Outputs" category (record /
// stream state changes). General keeps the connection's housekeeping events.
const EVENT_SUB_GENERAL = 1 << 0;
const EVENT_SUB_OUTPUTS = 1 << 6;

export async function sha256Base64(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// OBS v5 auth: sha256(base64(sha256(password + salt)) + challenge), base64'd.
export async function computeAuth(
  password: string,
  salt: string,
  challenge: string,
): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

function friendlyClose(code: number): string {
  switch (code) {
    case 4009:
      return "Authentication failed — check your OBS WebSocket password.";
    case 4008:
      return "OBS requires a password. Enter it and reconnect.";
    case 4006:
      return "OBS closed the connection (session timeout).";
    case 1006:
      return "Could not reach OBS. Is it running with the WebSocket server enabled?";
    default:
      return `Connection closed (code ${code}).`;
  }
}

export interface ObsConnectOptions {
  host: string;
  port: number;
  password: string;
}

class ObsClient {
  private ws: WebSocket | null = null;
  private status: ObsStatus = { ...INITIAL_STATUS };
  private listeners = new Set<() => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reqSeq = 0;
  private pending = new Map<
    string,
    { resolve: (data: any) => void; reject: (err: Error) => void }
  >();
  // Connect options held so a one-click reconnect works after a drop.
  private lastOptions: ObsConnectOptions | null = null;
  // Set while we are intentionally tearing the socket down so onclose doesn't
  // report it as an error.
  private deliberateClose = false;

  // ── external store plumbing (useSyncExternalStore) ─────────────────────────
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): ObsStatus => this.status;
  getServerSnapshot = (): ObsStatus => INITIAL_STATUS;

  private patch(next: Partial<ObsStatus>) {
    this.status = { ...this.status, ...next };
    this.listeners.forEach((l) => l());
  }

  isConnected(): boolean {
    return this.status.connState === "connected";
  }

  connect(opts: ObsConnectOptions): void {
    this.disconnect();
    this.lastOptions = opts;
    this.deliberateClose = false;
    this.patch({ ...INITIAL_STATUS, connState: "connecting" });

    let ws: WebSocket;
    const url = `ws://${opts.host}:${opts.port}`;
    try {
      ws = new WebSocket(url);
    } catch {
      this.patch({ connState: "error", error: `Invalid address: ${url}` });
      return;
    }
    this.ws = ws;

    // Guard against a socket that hangs in CONNECTING (OBS not running often
    // leaves it pending until the browser's own long timeout).
    this.connectTimer = setTimeout(() => {
      if (this.status.connState === "connecting") {
        this.deliberateClose = true;
        try {
          ws.close();
        } catch {}
        this.patch({
          connState: "error",
          error:
            "Timed out reaching OBS. Confirm OBS is open and the WebSocket server is enabled.",
        });
      }
    }, 8000);

    ws.onmessage = (ev) => void this.onMessage(ev, opts);
    ws.onerror = () => {
      // onerror gives no detail; onclose follows with the actual code.
    };
    ws.onclose = (ev) => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.stopPolling();
      this.rejectAllPending("OBS connection closed");
      if (this.deliberateClose) {
        this.patch({ ...INITIAL_STATUS, connState: "disconnected" });
      } else {
        this.patch({
          ...INITIAL_STATUS,
          connState: "error",
          error: friendlyClose(ev.code),
        });
      }
      this.ws = null;
    };
  }

  disconnect(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.stopPolling();
    this.rejectAllPending("Disconnected");
    if (this.ws) {
      this.deliberateClose = true;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.patch({ ...INITIAL_STATUS, connState: "disconnected" });
  }

  /** Reconnect using the last-used options (one-click reconnect). */
  reconnect(): void {
    if (this.lastOptions) this.connect(this.lastOptions);
  }

  private async onMessage(ev: MessageEvent, opts: ObsConnectOptions) {
    let msg: { op: number; d: any };
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      return;
    }

    if (msg.op === OP.Hello) {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      const d = msg.d ?? {};
      const identify: Record<string, unknown> = {
        rpcVersion: d.rpcVersion ?? 1,
        eventSubscriptions: EVENT_SUB_GENERAL | EVENT_SUB_OUTPUTS,
      };
      if (d.authentication) {
        if (!opts.password) {
          this.deliberateClose = false;
          this.patch({
            connState: "error",
            error: "OBS requires a password. Enter it and reconnect.",
          });
          try {
            this.ws?.close();
          } catch {}
          return;
        }
        identify.authentication = await computeAuth(
          opts.password,
          d.authentication.salt,
          d.authentication.challenge,
        );
      }
      this.send({ op: OP.Identify, d: identify });
      return;
    }

    if (msg.op === OP.Identified) {
      this.patch({ connState: "connected", error: null });
      // Pull the initial record/stream status, then poll for live timecodes.
      void this.refreshStatus();
      this.startPolling();
      return;
    }

    if (msg.op === OP.Event) {
      this.onEvent(msg.d);
      return;
    }

    if (msg.op === OP.RequestResponse) {
      const d = msg.d ?? {};
      const entry = this.pending.get(d.requestId);
      if (!entry) return;
      this.pending.delete(d.requestId);
      if (d.requestStatus?.result) {
        entry.resolve(d.responseData ?? {});
      } else {
        entry.reject(
          new Error(d.requestStatus?.comment || "OBS request failed"),
        );
      }
      return;
    }
  }

  private onEvent(d: any) {
    const type = d?.eventType as string;
    const data = d?.eventData ?? {};
    if (type === "StreamStateChanged") {
      this.patch({ streaming: !!data.outputActive });
      if (!data.outputActive) this.patch({ streamTimecode: "", congestion: 0 });
    } else if (type === "RecordStateChanged") {
      this.patch({ recording: !!data.outputActive });
      if (!data.outputActive) this.patch({ recordTimecode: "" });
    } else if (type === "RecordStateChangedPaused" || type === "RecordPaused") {
      this.patch({ recordPaused: true });
    }
  }

  private send(payload: { op: number; d: unknown }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private request<T = any>(
    requestType: string,
    requestData?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to OBS"));
        return;
      }
      const requestId = `sm-${++this.reqSeq}`;
      this.pending.set(requestId, { resolve, reject });
      this.send({
        op: OP.Request,
        d: { requestType, requestId, requestData: requestData ?? {} },
      });
      // Safety timeout so a lost response can't leak a pending entry forever.
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`OBS request "${requestType}" timed out`));
        }
      }, 8000);
    });
  }

  private rejectAllPending(reason: string) {
    this.pending.forEach((p) => p.reject(new Error(reason)));
    this.pending.clear();
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.refreshStatus(), 1000);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async refreshStatus() {
    if (!this.isConnected()) return;
    try {
      const [stream, record, stats] = await Promise.all([
        this.request("GetStreamStatus").catch(() => null),
        this.request("GetRecordStatus").catch(() => null),
        this.request("GetStats").catch(() => null),
      ]);
      const next: Partial<ObsStatus> = {};
      if (stream) {
        next.streaming = !!stream.outputActive;
        next.streamTimecode = stream.outputActive
          ? formatTimecode(stream.outputTimecode, stream.outputDuration)
          : "";
        next.congestion =
          typeof stream.outputCongestion === "number"
            ? stream.outputCongestion
            : 0;
        next.skippedFrames = stream.outputSkippedFrames ?? 0;
        next.totalFrames = stream.outputTotalFrames ?? 0;
      }
      if (record) {
        next.recording = !!record.outputActive;
        next.recordPaused = !!record.outputPaused;
        next.recordTimecode = record.outputActive
          ? formatTimecode(record.outputTimecode, record.outputDuration)
          : "";
      }
      if (stats) {
        next.cpuUsage =
          typeof stats.cpuUsage === "number" ? stats.cpuUsage : 0;
        next.fps = typeof stats.activeFps === "number" ? stats.activeFps : 0;
      }
      this.patch(next);
    } catch {
      // Transient; the next poll tick retries.
    }
  }

  // ── controls ───────────────────────────────────────────────────────────────
  async startRecording(): Promise<void> {
    await this.request("StartRecord");
  }
  async stopRecording(): Promise<void> {
    await this.request("StopRecord");
  }
  async startStreaming(): Promise<void> {
    await this.request("StartStream");
  }
  async stopStreaming(): Promise<void> {
    await this.request("StopStream");
  }
}

// outputTimecode is "HH:MM:SS.mmm"; fall back to deriving from the ms duration.
export function formatTimecode(timecode?: string, durationMs?: number): string {
  if (typeof timecode === "string" && timecode.length >= 8) {
    return timecode.slice(0, 8);
  }
  if (typeof durationMs === "number" && durationMs > 0) {
    const total = Math.floor(durationMs / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return "00:00:00";
}

export const obsClient = new ObsClient();
