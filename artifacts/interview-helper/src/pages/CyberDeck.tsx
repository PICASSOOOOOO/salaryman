import { useCallback, useEffect, useRef, useState } from "react";
import { MeshDevice } from "@meshtastic/core";
import { TransportWebSerial } from "@meshtastic/transport-web-serial";
import { TransportWebBluetooth } from "@meshtastic/transport-web-bluetooth";
import { unzipSync } from "fflate";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { AlertTriangle, Download, FileSearch, Radio, ShieldCheck, Trash2, Upload, Unplug } from "lucide-react";

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_ARCHIVE_OUTPUT = 48 * 1024 * 1024;
const MAX_EXTRACTED_FILE = 12 * 1024 * 1024;
const TEXT_PREVIEW_BYTES = 48 * 1024;

type Finding = { label: string; value: string };
type Evidence = {
  file: File;
  hash: string;
  detected: string;
  findings: Finding[];
  text: string;
  archive: { name: string; size: number; data?: Uint8Array }[];
};
type MeshMessage = { from: number; channel: number; text: string; time: number };

function detectFileType(bytes: Uint8Array, name: string): string {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) return "ZIP archive";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "PNG image";
  if (starts(0xff, 0xd8, 0xff)) return "JPEG image";
  if (String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "PDF document";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "GIF image";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "RIFF container";
  if (name.toLowerCase().endsWith(".json")) return "JSON candidate";
  if (bytes.subarray(0, Math.min(bytes.length, 2048)).every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32)) return "Text candidate";
  return "Unknown / binary";
}

function safeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "�");
}

function validateZipDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minSearch = Math.max(0, bytes.length - 65_557);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= minSearch; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) throw new Error("ZIP directory is missing or invalid.");
  const count = view.getUint16(endRecord + 10, true);
  const directorySize = view.getUint32(endRecord + 12, true);
  const directoryOffset = view.getUint32(endRecord + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported in this inspection view.");
  }
  if (count > MAX_ARCHIVE_ENTRIES || directoryOffset + directorySize > endRecord) {
    throw new Error("Archive exceeds the safe entry limit or has an invalid directory.");
  }
  let cursor = directoryOffset;
  let expandedSize = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Archive directory entry is invalid.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    if (cursor + entryLength > bytes.length || uncompressedSize === 0xffffffff) {
      throw new Error("Archive contains an unsupported or malformed entry.");
    }
    if (flags & 1) throw new Error("Password-protected entries cannot be inspected.");
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name.startsWith("/") || name.split(/[\\/]/).includes("..")) {
      throw new Error("Archive contains an unsafe path; extraction was stopped.");
    }
    expandedSize += uncompressedSize;
    if (expandedSize > MAX_ARCHIVE_OUTPUT) throw new Error("Archive expands beyond the 48 MB inspection limit.");
    cursor += entryLength;
  }
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function analyzeFile(file: File): Promise<Evidence> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file smaller than 32 MB.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  const hash = [...hashBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const detected = detectFileType(bytes, file.name);
  const findings: Finding[] = [
    { label: "Reported MIME", value: file.type || "not provided" },
    { label: "File signature", value: detected },
    { label: "SHA-256", value: hash },
    { label: "Last modified", value: file.lastModified ? new Date(file.lastModified).toISOString() : "not provided" },
  ];
  let text = "";
  let archive: Evidence["archive"] = [];
  if (detected === "ZIP archive") {
    validateZipDirectory(bytes);
    const entries = unzipSync(bytes, {
      filter: (entry) => !entry.name.startsWith("/") && !entry.name.split(/[\\/]/).includes(".."),
    });
    const names = Object.keys(entries);
    if (names.length > MAX_ARCHIVE_ENTRIES) throw new Error("Archive has too many entries to inspect safely.");
    let expanded = 0;
    archive = names.map((name) => {
      const data = entries[name];
      expanded += data.byteLength;
      return { name, size: data.byteLength, ...(data.byteLength <= MAX_EXTRACTED_FILE ? { data } : {}) };
    });
    if (expanded > MAX_ARCHIVE_OUTPUT) throw new Error("Archive expands beyond the 48 MB inspection limit.");
    findings.push({ label: "Archive entries", value: String(names.length) });
    findings.push({ label: "Expanded bytes", value: `${expanded.toLocaleString()} (limit 48 MB)` });
  } else if (detected.includes("Text") || detected.includes("JSON")) {
    text = safeText(bytes.subarray(0, TEXT_PREVIEW_BYTES));
    if (bytes.length > TEXT_PREVIEW_BYTES) text += "\n\n[Preview truncated at 48 KB]";
  }
  if (file.type && detected !== "Unknown / binary" && !file.type.toLowerCase().includes(detected.split(" ")[0].toLowerCase())) {
    findings.push({ label: "Note", value: "Reported MIME type may not match the file signature." });
  }
  return { file, hash, detected, findings, text, archive };
}

function CyberDeck() {
  const { isAuthenticated, isLoading } = useAuth();
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<MeshDevice | null>(null);
  const [radioType, setRadioType] = useState<"serial" | "bluetooth">("serial");
  const [radioError, setRadioError] = useState("");
  const [channel, setChannel] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageSubscription = useRef<{ unsubscribe?: () => void } | null>(null);

  useEffect(() => () => {
    messageSubscription.current?.unsubscribe?.();
    if (device) void device.disconnect();
  }, [device]);

  const inspect = useCallback(async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    setEvidence(null);
    try {
      setEvidence(await analyzeFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not inspect this file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = async () => {
    setRadioError("");
    try {
      const transport = radioType === "serial"
        ? await TransportWebSerial.create(115200)
        : await TransportWebBluetooth.create();
      const nextDevice = new MeshDevice(transport);
      const wrapper = nextDevice.events.onMessagePacket.asEvent() as unknown as {
        subscribe: (callback: (packet: { from: number; channel: number; data: string }) => void) => { unsubscribe?: () => void };
      };
      messageSubscription.current = wrapper.subscribe((packet) => {
        setMessages((current) => [...current.slice(-99), { from: packet.from, channel: packet.channel, text: packet.data, time: Date.now() }]);
      });
      setDevice(nextDevice);
    } catch (cause) {
      setRadioError(cause instanceof Error ? cause.message : "Could not connect to the selected radio.");
    }
  };

  const disconnect = async () => {
    messageSubscription.current?.unsubscribe?.();
    messageSubscription.current = null;
    if (device) await device.disconnect().catch(() => undefined);
    setDevice(null);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!device || !text || text.length > 200) return;
    setSending(true);
    setRadioError("");
    try {
      await device.sendText(text, "broadcast", false, channel);
      setMessages((current) => [...current.slice(-99), { from: 0, channel, text, time: Date.now() }]);
      setDraft("");
    } catch (cause) {
      setRadioError(cause instanceof Error ? cause.message : "Message was not sent.");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) return <div className="p-8 text-sm">Restoring session…</div>;
  if (!isAuthenticated) return <SignInPage context="Sign in to use Cyber Deck." />;

  return (
    <main className="min-h-[100dvh] bg-[#fafaf7] px-4 py-6 text-black sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-black pb-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-black/55"><ShieldCheck className="h-4 w-4" /> Browser-only tools</p>
            <h1 className="text-3xl font-bold tracking-tight">Cyber Deck</h1>
            <p className="mt-1 max-w-2xl text-sm text-black/60">Inspect selected evidence files locally, or connect a Meshtastic radio to read and send channel messages.</p>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="border border-black/20 bg-white p-4 sm:p-5" aria-labelledby="evidence-title">
            <div className="mb-4 flex items-center gap-2"><FileSearch className="h-5 w-5" /><h2 id="evidence-title" className="text-base font-bold">Evidence inspection</h2></div>
            <p className="mb-4 text-sm text-black/60">Files stay in this tab. No upload or server storage. Calculates SHA-256, checks file signatures, previews text, and lists ZIP contents.</p>
            <input ref={fileInput} type="file" className="hidden" onChange={(event) => void inspect(event.target.files?.[0])} />
            <button onClick={() => fileInput.current?.click()} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 border border-black px-4 py-3 text-sm font-bold hover:bg-black hover:text-white disabled:opacity-50">
              <Upload className="h-4 w-4" /> {busy ? "Inspecting locally…" : "Choose evidence file"}
            </button>
            {error && <p role="alert" className="mt-3 flex gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
            {evidence && (
              <div className="mt-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-black/10 pb-3">
                  <div className="min-w-0"><p className="break-all text-sm font-bold">{evidence.file.name}</p><p className="mt-1 text-xs text-black/55">{evidence.detected} · {evidence.file.size.toLocaleString()} bytes</p></div>
                  <button aria-label="Clear evidence" onClick={() => setEvidence(null)} className="p-2 hover:bg-black/5"><Trash2 className="h-4 w-4" /></button>
                </div>
                <dl className="space-y-2">
                  {evidence.findings.map((finding) => <div key={finding.label} className="grid grid-cols-[110px_1fr] gap-2 text-xs"><dt className="font-bold uppercase text-black/55">{finding.label}</dt><dd className="break-all font-mono">{finding.value}</dd></div>)}
                </dl>
                {evidence.text && <pre className="max-h-56 overflow-auto border border-black/10 bg-[#fafaf7] p-3 text-xs whitespace-pre-wrap">{evidence.text}</pre>}
                {evidence.archive.length > 0 && (
                  <div className="max-h-64 overflow-auto border border-black/10">
                    {evidence.archive.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 text-xs last:border-0">
                      <span className="min-w-0 break-all font-mono">{entry.name} <span className="text-black/45">({entry.size.toLocaleString()} B)</span></span>
                      {entry.data && <button onClick={() => saveBlob(new Blob([entry.data!.slice().buffer as ArrayBuffer]), entry.name.split(/[\\/]/).pop() || "evidence.bin")} className="shrink-0 p-1" aria-label={`Extract ${entry.name}`}><Download className="h-4 w-4" /></button>}
                    </div>)}
                  </div>
                )}
                <button onClick={() => saveBlob(new Blob([JSON.stringify({ filename: evidence.file.name, size: evidence.file.size, detected: evidence.detected, findings: evidence.findings, analyzedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }), `${evidence.file.name}.analysis.json`)} className="border border-black/30 px-3 py-2 text-xs font-bold hover:bg-black/5">Download analysis record</button>
              </div>
            )}
          </section>

          <section className="border border-black/20 bg-white p-4 sm:p-5" aria-labelledby="mesh-title">
            <div className="mb-4 flex items-center gap-2"><Radio className="h-5 w-5" /><h2 id="mesh-title" className="text-base font-bold">Meshtastic mesh comms</h2></div>
            <p className="mb-4 text-sm text-black/60">Connect directly to a nearby radio. Browser radio support requires HTTPS and a compatible Chromium browser. Messages are broadcast over the selected mesh channel.</p>
            {!device ? (
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wide">Connection type
                  <select value={radioType} onChange={(event) => setRadioType(event.target.value as "serial" | "bluetooth")} className="mt-1 block min-h-11 w-full border border-black/25 bg-white px-3 text-sm">
                    <option value="serial">USB / Web Serial</option><option value="bluetooth">Bluetooth LE</option>
                  </select>
                </label>
                <button onClick={() => void connect()} className="min-h-11 w-full border border-black bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/80">Connect radio</button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between border border-black/10 bg-[#fafaf7] p-3 text-sm">
                  <span className="font-bold">Radio connected · {radioType === "serial" ? "USB" : "Bluetooth"}</span>
                  <button onClick={() => void disconnect()} className="flex items-center gap-1 text-xs font-bold"><Unplug className="h-4 w-4" /> Disconnect</button>
                </div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-wide">Channel
                  <select value={channel} onChange={(event) => setChannel(Number(event.target.value))} className="mt-1 block min-h-10 w-full border border-black/25 bg-white px-3 text-sm">
                    {Array.from({ length: 8 }, (_, number) => <option key={number} value={number}>{number === 7 ? "Admin (receive only in this tool)" : `Channel ${number}`}</option>)}
                  </select>
                </label>
                <div className="mb-3 flex h-64 flex-col gap-2 overflow-y-auto border border-black/15 bg-[#fafaf7] p-3" aria-live="polite">
                  {messages.filter((message) => message.channel === channel).length === 0 && <p className="m-auto text-center text-sm text-black/45">Waiting for messages on this channel.</p>}
                  {messages.filter((message) => message.channel === channel).map((message, index) => <article key={`${message.time}-${index}`} className="max-w-[90%] border border-black/10 bg-white p-2 text-sm"><p className="mb-1 text-[10px] font-bold uppercase text-black/45">{message.from === 0 ? "You" : `Node !${message.from.toString(16)}`} · {new Date(message.time).toLocaleTimeString()}</p><p className="break-words">{message.text}</p></article>)}
                </div>
                <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2">
                  <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} placeholder="Message this channel" className="min-h-11 min-w-0 flex-1 border border-black/25 px-3 text-sm" aria-label="Mesh message" />
                  <button disabled={!draft.trim() || sending || channel === 7} className="min-h-11 border border-black bg-black px-4 text-sm font-bold text-white disabled:opacity-40">{sending ? "Sending…" : "Send"}</button>
                </form>
                <p className="mt-2 text-xs text-black/50">Broadcasts are public to listeners on this channel. This tool does not encrypt or retain messages.</p>
              </>
            )}
            {radioError && <p role="alert" className="mt-3 flex gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{radioError}</p>}
          </section>
        </div>
        <p className="mt-5 text-xs text-black/45">Radio transport: Meshtastic JavaScript SDK, GPL-3.0-only. <a href={`${import.meta.env.BASE_URL}licenses/GPL-3.0.txt`} className="underline">Read the license</a>. Evidence inspection is read-only and limited to files you select.</p>
      </div>
    </main>
  );
}

export default CyberDeck;
