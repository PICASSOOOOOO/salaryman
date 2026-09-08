import { useEffect, useRef, useState } from 'react';
import { Activity, Gamepad2, Loader2, Radio, WifiOff } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface GodotStatus {
  connected: boolean;
  publisherCount: number;
  viewerCount: number;
  latestFrame: {
    sequence: number;
    mimeType: string;
    receivedAt: number;
    byteLength: number;
  } | null;
}

function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/godot/render?role=viewer`;
}

export default function GodotArtPreview() {
  const [status, setStatus] = useState<GodotStatus | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const frameUrlRef = useRef<string | null>(null);
  const awaitingBinaryRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;
    const loadStatus = async () => {
      try {
        const res = await apiFetch('/api/godot-render/status');
        if (!res.ok) return;
        const next = await res.json() as GodotStatus;
        if (!cancelled) setStatus(next);
      } catch {
        // The preview remains usable when the API is temporarily unavailable.
      }
    };
    void loadStatus();
    pollId = setInterval(loadStatus, 5000);
    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (cancelled) return;
      setSocketState('connecting');
      socket = new WebSocket(websocketUrl());
      socket.binaryType = 'blob';
      socket.onopen = () => {
        if (!cancelled) setSocketState('live');
      };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data) as { type?: string };
            awaitingBinaryRef.current = message.type === 'frame_meta';
          } catch {
            awaitingBinaryRef.current = false;
          }
          return;
        }
        if (!awaitingBinaryRef.current || cancelled) return;
        awaitingBinaryRef.current = false;
        const nextUrl = URL.createObjectURL(event.data as Blob);
        const previous = frameUrlRef.current;
        frameUrlRef.current = nextUrl;
        setFrameUrl(nextUrl);
        if (previous) URL.revokeObjectURL(previous);
      };
      socket.onerror = () => {
        if (!cancelled) setSocketState('offline');
      };
      socket.onclose = () => {
        if (cancelled) return;
        setSocketState('offline');
        window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      socket?.close();
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    };
  }, []);

  const live = socketState === 'live' && Boolean(status?.connected);
  return (
    <section className="mb-5 rounded-lg border border-cyan-500/20 bg-[#071019] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
        <Gamepad2 className="w-4 h-4 text-cyan-300" />
        <span className="font-mono text-[12px] tracking-widest uppercase text-zinc-200">Godot art dev</span>
        <span className={`flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase ${live ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {live ? <Radio className="w-3 h-3" /> : socketState === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
          {live ? 'live preview' : socketState === 'connecting' ? 'connecting' : 'offline'}
        </span>
        {status && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-zinc-600">
            <Activity className="w-3 h-3" />
            {status.publisherCount} publisher · {status.viewerCount} viewer
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-4 p-4">
        <div className="min-h-[180px] rounded-md border border-white/[0.08] bg-[#06070b] flex items-center justify-center overflow-hidden">
          {frameUrl ? (
            <img src={frameUrl} alt="Latest Godot sprite preview" className="max-h-[260px] max-w-full object-contain [image-rendering:pixelated]" />
          ) : (
            <div className="text-center">
              <Gamepad2 className="mx-auto mb-2 w-7 h-7 text-zinc-700" />
              <p className="font-mono text-[10px] text-zinc-600">Run godot/art-dev to publish a frame.</p>
            </div>
          )}
        </div>
        <div className="space-y-2 font-mono text-[10px] text-zinc-500">
          <p className="text-cyan-300 tracking-widest uppercase">Review channel</p>
          <p>Godot previews the shared 16×32 character sheets and sends PNG frames through the existing render bridge.</p>
          <p className="text-zinc-600">
            {status?.latestFrame
              ? `Latest frame #${status.latestFrame.sequence} · ${Math.round(status.latestFrame.byteLength / 1024)} KB`
              : 'No frame received yet.'}
          </p>
        </div>
      </div>
    </section>
  );
}