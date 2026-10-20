import { useEffect, useRef, useState, type FormEvent } from "react";
import { MeshDevice } from "@meshtastic/core";
import { TransportWebBluetooth } from "@meshtastic/transport-web-bluetooth";
import { TransportWebSerial } from "@meshtastic/transport-web-serial";
import { Radio, Unplug } from "lucide-react";

type MeshMessage = { from: number; channel: number; text: string; time: number };

export function MeshtasticCommsPanel() {
  const [device, setDevice] = useState<MeshDevice | null>(null);
  const [transportType, setTransportType] = useState<"serial" | "bluetooth">("bluetooth");
  const [channel, setChannel] = useState(0);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const subscription = useRef<{ unsubscribe?: () => void } | null>(null);

  useEffect(() => () => {
    subscription.current?.unsubscribe?.();
    if (device) void device.disconnect();
  }, [device]);

  const connect = async () => {
    setError("");
    try {
      if (!window.isSecureContext) throw new Error("Radio access requires a secure HTTPS page.");
      const transport = transportType === "serial"
        ? await TransportWebSerial.create(115200)
        : await TransportWebBluetooth.create();
      const next = new MeshDevice(transport);
      const events = next.events.onMessagePacket.asEvent() as unknown as {
        subscribe: (callback: (packet: { from: number; channel: number; data: string }) => void) => { unsubscribe?: () => void };
      };
      subscription.current = events.subscribe((packet) => {
        setMessages((current) => [...current.slice(-99), {
          from: packet.from, channel: packet.channel, text: packet.data, time: Date.now(),
        }]);
      });
      setDevice(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the radio.");
    }
  };

  const disconnect = async () => {
    subscription.current?.unsubscribe?.();
    subscription.current = null;
    await device?.disconnect().catch(() => undefined);
    setDevice(null);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!device || !text || text.length > 200 || channel === 7) return;
    setBusy(true);
    setError("");
    try {
      await device.sendText(text, "broadcast", false, channel);
      setMessages((current) => [...current.slice(-99), { from: 0, channel, text, time: Date.now() }]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message was not sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="m-4 border border-black/20 bg-white p-4 text-black sm:m-6 sm:p-5" aria-labelledby="meshtastic-title">
      <div className="mb-3 flex items-center gap-2">
        <Radio className="h-4 w-4" />
        <h2 id="meshtastic-title" className="text-xs font-bold uppercase tracking-widest">Meshtastic bridge · Free</h2>
      </div>
      <p className="mb-4 text-xs text-black/60">
        Connect directly to a nearby radio to exchange messages beyond SALARYMAN. Radio access and broadcasts are user-initiated; messages stay on your device and mesh.
      </p>
      {!device ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Radio connection type" value={transportType} onChange={(event) => setTransportType(event.target.value as "serial" | "bluetooth")} className="min-h-10 border border-black/25 bg-white px-3 text-sm">
            <option value="bluetooth">Bluetooth LE</option>
            <option value="serial">USB / Web Serial</option>
          </select>
          <button type="button" onClick={() => void connect()} className="min-h-10 border border-black bg-black px-4 text-xs font-bold uppercase text-white hover:bg-black/80">
            Connect radio
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between border border-black/10 bg-[#fffaf0] p-2 text-xs">
            <span className="font-bold">Radio connected · {transportType === "serial" ? "USB" : "Bluetooth"}</span>
            <button type="button" onClick={() => void disconnect()} className="flex items-center gap-1 font-bold"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>
          </div>
          <label className="mb-3 block text-[10px] font-bold uppercase tracking-wide">Mesh channel
            <select value={channel} onChange={(event) => setChannel(Number(event.target.value))} className="mt-1 block min-h-10 w-full border border-black/25 bg-white px-3 text-sm">
              {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{index === 7 ? "Admin (receive only)" : `Channel ${index}`}</option>)}
            </select>
          </label>
          <div className="mb-3 flex h-52 flex-col gap-2 overflow-y-auto border border-black/15 bg-[#fffaf0] p-3" aria-live="polite">
            {messages.filter((message) => message.channel === channel).length === 0
              ? <p className="m-auto text-center text-xs text-black/45">Waiting for messages on this channel.</p>
              : messages.filter((message) => message.channel === channel).map((message, index) => (
                <article key={`${message.time}-${index}`} className="max-w-[90%] border border-black/10 bg-white p-2 text-xs">
                  <p className="mb-1 text-[9px] font-bold uppercase text-black/45">{message.from === 0 ? "You" : `Node !${message.from.toString(16)}`} · {new Date(message.time).toLocaleTimeString()}</p>
                  <p className="break-words">{message.text}</p>
                </article>
              ))}
          </div>
          <form onSubmit={(event) => void send(event)} className="flex gap-2">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} aria-label="Mesh message" placeholder="Message this channel" className="min-h-10 min-w-0 flex-1 border border-black/25 px-3 text-sm" />
            <button disabled={!draft.trim() || busy || channel === 7} className="min-h-10 border border-black bg-black px-4 text-xs font-bold uppercase text-white disabled:opacity-40">{busy ? "Sending…" : "Send"}</button>
          </form>
          <p className="mt-2 text-[10px] text-black/50">Mesh broadcasts are visible to listeners on the channel and are not encrypted by this tool.</p>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-black/60">
        Need phone numbers or Twilio calling? <a href={`${import.meta.env.BASE_URL}phone`} className="font-bold underline">CALLL HOME paid service</a>.
      </p>
      <p className="mt-3 text-[10px] text-black/45">Meshtastic JavaScript SDK · GPL-3.0-only · <a href={`${import.meta.env.BASE_URL}licenses/GPL-3.0.txt`} className="underline">license</a></p>
    </section>
  );
}
