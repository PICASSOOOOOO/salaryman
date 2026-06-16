import { useEffect, useState } from "react";
import {
  Radio, Video, Circle, Square, Wifi, WifiOff, Loader2,
  AlertTriangle, Eye, ShieldCheck, Cpu, Activity,
} from "lucide-react";
import { useObs } from "@/hooks/use-obs";

// Device-local store for the OBS WebSocket password. Deliberately NOT part of
// the synced settings blob — it is a local secret used only by this browser to
// reach localhost OBS, so it never leaves the device.
const OBS_PW_KEY = "sm_obs_password";

function loadPassword(): string {
  try {
    return localStorage.getItem(OBS_PW_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePassword(pw: string) {
  try {
    if (pw) localStorage.setItem(OBS_PW_KEY, pw);
    else localStorage.removeItem(OBS_PW_KEY);
  } catch {}
}

const Sec = ({ icon: Icon, title, children }: any) => (
  <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
    <h2 className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-zinc-300 mb-3">
      <Icon className="w-3.5 h-3.5 text-zinc-500" /> {title}
    </h2>
    <div className="space-y-3">{children}</div>
  </section>
);

const Row = ({ label, hint, children }: any) => (
  <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
    <div>
      <div className="text-xs font-mono text-zinc-300 tracking-wider">{label}</div>
      {hint && <div className="text-[10px] text-zinc-600 mt-0.5">{hint}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const inputCls =
  "bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/60";

interface Props {
  host: string;
  port: number;
  streamerMode: boolean;
  onChange: (patch: { obsHost?: string; obsPort?: number; streamerMode?: boolean }) => void;
}

export default function StreamingTab({ host, port, streamerMode, onChange }: Props) {
  const { status, connect, disconnect, startRecording, stopRecording, startStreaming, stopStreaming } = useObs();
  const [password, setPassword] = useState<string>(loadPassword);
  const [busy, setBusy] = useState<null | string>(null);

  // Persist the password to the device whenever it changes.
  useEffect(() => {
    savePassword(password);
  }, [password]);

  const connecting = status.connState === "connecting";
  const connected = status.connState === "connected";
  const isError = status.connState === "error";

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      /* surfaced by status.error / left to the next poll */
    } finally {
      setBusy(null);
    }
  };

  const statusDot = connected
    ? "bg-emerald-400"
    : connecting
    ? "bg-amber-400 animate-pulse"
    : isError
    ? "bg-red-400"
    : "bg-zinc-600";

  const statusText = connected
    ? "CONNECTED"
    : connecting
    ? "CONNECTING…"
    : isError
    ? "ERROR"
    : "DISCONNECTED";

  return (
    <>
      <Sec icon={Radio} title="OBS CONNECTION">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-[11px] font-mono tracking-widest text-zinc-300">{statusText}</span>
        </div>
        {isError && status.error && (
          <div className="flex items-start gap-1.5 text-[10px] font-mono text-red-300 bg-red-500/5 border border-red-900/40 rounded px-2 py-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{status.error}</span>
          </div>
        )}

        <Row label="Host" hint="Keep localhost — browsers only allow OBS on this machine.">
          <input
            value={host}
            onChange={(e) => onChange({ obsHost: e.target.value.trim() || "localhost" })}
            disabled={connected || connecting}
            className={`${inputCls} w-36 disabled:opacity-50`}
          />
        </Row>
        <Row label="Port" hint="OBS WebSocket default is 4455.">
          <input
            type="number"
            value={port}
            onChange={(e) => onChange({ obsPort: Number(e.target.value) || 4455 })}
            disabled={connected || connecting}
            className={`${inputCls} w-24 disabled:opacity-50`}
          />
        </Row>
        <Row label="Password" hint="Your local OBS WebSocket password. Stays on this device only.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connected || connecting}
            placeholder="••••••"
            className={`${inputCls} w-36 disabled:opacity-50`}
          />
        </Row>

        <div className="pt-1">
          {connected ? (
            <button
              onClick={() => disconnect()}
              className="w-full py-2 text-xs font-mono tracking-widest text-zinc-300 border border-zinc-700 hover:bg-zinc-800 rounded inline-flex items-center justify-center gap-2"
            >
              <WifiOff className="w-3.5 h-3.5" /> DISCONNECT
            </button>
          ) : (
            <button
              onClick={() => connect({ host, port, password })}
              disabled={connecting}
              className="w-full py-2 text-xs font-mono tracking-widest text-cyan-200 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 rounded inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              {connecting ? "CONNECTING…" : "CONNECT"}
            </button>
          )}
        </div>
      </Sec>

      <Sec icon={Video} title="BROADCAST">
        <Row
          label="Recording"
          hint={status.recording ? `Recording · ${status.recordTimecode || "00:00:00"}` : "Save gameplay to disk."}
        >
          {status.recording ? (
            <button
              onClick={() => run("rec", stopRecording)}
              disabled={!connected || busy === "rec"}
              className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Square className="w-3 h-3" /> STOP REC
            </button>
          ) : (
            <button
              onClick={() => run("rec", startRecording)}
              disabled={!connected || busy === "rec"}
              className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Circle className="w-3 h-3 text-red-400" /> START REC
            </button>
          )}
        </Row>

        <Row
          label="Streaming"
          hint={
            status.streaming
              ? `Live · ${status.streamTimecode || "00:00:00"}${status.congestion > 0.3 ? " · network strained" : ""}`
              : "Go live to your destination configured in OBS."
          }
        >
          {status.streaming ? (
            <button
              onClick={() => run("stream", stopStreaming)}
              disabled={!connected || busy === "stream"}
              className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Square className="w-3 h-3" /> END STREAM
            </button>
          ) : (
            <button
              onClick={() => run("stream", startStreaming)}
              disabled={!connected || busy === "stream"}
              className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Radio className="w-3 h-3" /> GO LIVE
            </button>
          )}
        </Row>

        {connected && (status.streaming || status.recording) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-zinc-500 pt-1">
            {status.streaming && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Activity className="w-3 h-3" /> dropped {status.skippedFrames}
                  {status.totalFrames > 0 && (
                    <span className="text-zinc-700">
                      {" "}
                      ({((status.skippedFrames / Math.max(1, status.totalFrames)) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  congestion {(status.congestion * 100).toFixed(0)}%
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3 h-3" /> {(status.cpuUsage * 100).toFixed(0)}% CPU
            </span>
            {status.fps > 0 && <span>{status.fps.toFixed(0)} fps</span>}
          </div>
        )}

        {!connected && (
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Connect to OBS above to enable recording &amp; streaming controls.
          </p>
        )}
      </Sec>

      <Sec icon={Eye} title="STREAMER MODE">
        <Row
          label="Hide sensitive info"
          hint="Masks your account email and exact real-money / USD balances on screen — safe to broadcast."
        >
          <button
            onClick={() => onChange({ streamerMode: !streamerMode })}
            className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded border transition-colors inline-flex items-center gap-1.5 ${
              streamerMode
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900 border-zinc-700 text-zinc-500"
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            {streamerMode ? "ON" : "OFF"}
          </button>
        </Row>
      </Sec>

      <Sec icon={Radio} title="SETUP GUIDE">
        <ol className="text-[11px] text-zinc-400 leading-relaxed list-decimal pl-4 space-y-1.5">
          <li>
            Install <span className="text-zinc-200">OBS Studio</span> (28+) or
            Streamlabs Desktop — both speak the same WebSocket protocol.
          </li>
          <li>
            In OBS, open <span className="text-zinc-200">Tools → WebSocket Server Settings</span>.
          </li>
          <li>
            Tick <span className="text-zinc-200">Enable WebSocket server</span>. Note
            the <span className="text-zinc-200">Server Port</span> (default 4455).
          </li>
          <li>
            Click <span className="text-zinc-200">Show Connect Info</span> to reveal
            (or set) the <span className="text-zinc-200">Server Password</span>, then
            paste it above.
          </li>
          <li>
            Configure your stream destination (Twitch / YouTube) in OBS as usual —
            SALARYMAN only sends the start / stop commands.
          </li>
          <li>
            Click <span className="text-zinc-200">Connect</span>. Keep the host as{" "}
            <span className="text-zinc-200">localhost</span>; OBS must run on this
            same computer.
          </li>
        </ol>
      </Sec>
    </>
  );
}
