import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Film, Link2, X, RefreshCw, Aperture, Loader2, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Mode = "menu" | "camera" | "file" | "url";
type Facing = "user" | "environment";

/**
 * VisionIntake — Pablo's eyes. A small floating control that lives in
 * the corner of the nebula screen and lets the user feed Pablo:
 *   • a live camera feed (front or rear),
 *   • a video / image file from disk,
 *   • or a video URL (YouTube, TikTok, Vimeo, plain video).
 *
 * Frames are captured client-side (camera and file paths) and POSTed as
 * data URLs to /tools/analyze-vision. URLs go to the existing
 * /tools/analyze-video streaming route. Results stream back into a
 * panel in this same component so the user never leaves the nebula.
 */
export function VisionIntake() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [facing, setFacing] = useState<Facing>("user");
  const [hasMultipleCams, setHasMultipleCams] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const startCamera = useCallback(async (which: Facing) => {
    setCamError(null);
    stopStream();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: which } },
        audio: false,
      });
      setStream(s);
      // Probe device count once so the flip button only appears when useful.
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setHasMultipleCams(devs.filter((d) => d.kind === "videoinput").length > 1);
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Camera unavailable";
      setCamError(msg);
    }
  }, [stopStream]);

  // Bind the active stream to the <video> element only after mount.
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Tear down camera + abort in-flight analysis when the panel closes,
  // otherwise the camera light stays on after the user dismisses.
  useEffect(() => {
    if (!open) {
      stopStream();
      abortRef.current?.abort();
    }
  }, [open, stopStream]);
  useEffect(() => () => stopStream(), [stopStream]);

  // Switch mode → enter camera flow lazily so we don't ask for permission
  // until the user actually picks the camera tile.
  useEffect(() => {
    if (mode === "camera" && !stream && !camError) {
      void startCamera(facing);
    }
    if (mode !== "camera") {
      stopStream();
    }
  }, [mode, facing, stream, camError, startCamera, stopStream]);

  const analyzeImage = useCallback(async (dataUrl: string, hint: string) => {
    setBusy(true);
    setAnalysis("");
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await apiFetch("/tools/analyze-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, prompt: prompt || hint }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Analysis failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as { content?: string; error?: string; done?: boolean };
            if (evt.error) throw new Error(evt.error);
            if (evt.content) setAnalysis((prev) => prev + evt.content);
          } catch {
            // Ignore malformed frames; the stream may carry partial chunks.
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }, [prompt]);

  const snapFromVideo = useCallback((video: HTMLVideoElement, mime = "image/jpeg", quality = 0.85): string => {
    // Cap the captured frame at 1280px on the long edge so we don't ship
    // a 12-megapixel rear-camera frame to the vision endpoint just to
    // describe what's in it.
    const MAX = 1280;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const scale = Math.min(1, MAX / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL(mime, quality);
  }, []);

  const onSnap = useCallback(async () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    const data = snapFromVideo(v);
    if (!data) return;
    await analyzeImage(data, "Tell me what you see in this camera frame.");
  }, [snapFromVideo, analyzeImage]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setAnalysis("");
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = async () => {
        const data = String(reader.result ?? "");
        setFilePreview(data);
        await analyzeImage(data, "Describe this image and what's notable in it.");
      };
      reader.readAsDataURL(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      // Pull a single representative frame from the middle of the clip.
      // Full-video understanding would mean uploading a whole MP4 to the
      // server and decoding it there; that's out of scope for the inline
      // nebula tool. A mid-clip frame is the cheap, useful approximation.
      const objectUrl = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error("Could not read this video file."));
      }).catch((e) => setError(e.message));
      v.currentTime = Math.min(1, (v.duration || 2) * 0.5);
      await new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
      });
      const data = snapFromVideo(v);
      setFilePreview(data);
      URL.revokeObjectURL(objectUrl);
      await analyzeImage(data, "This is a mid-clip frame from a video the user uploaded. Describe what's happening and what to take from it.");
      return;
    }
    setError("Pick an image or video file.");
  }, [snapFromVideo, analyzeImage]);

  const onAnalyzeUrl = useCallback(async () => {
    if (!url.trim()) return;
    try { new URL(url); } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }
    setBusy(true);
    setAnalysis("");
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await apiFetch("/tools/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, goal: prompt || undefined }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Analysis failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim()) as { content?: string; error?: string };
            if (evt.error) throw new Error(evt.error);
            if (evt.content) setAnalysis((p) => p + evt.content);
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }, [url, prompt]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setMode("menu"); }}
        title="Show Pablo something"
        aria-label="Show Pablo something"
        data-testid="vision-intake-open"
        // Keep the control in a dedicated top-right lane on every viewport.
        // The bottom lane belongs to Pablo's message board and text/voice
        // controls; desktop used to place SHOW PABLO directly on top of it.
         className="pablo-vision-trigger fixed right-3 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full border border-pink-400/45 bg-black/70 backdrop-blur text-pink-100 text-[10px] sm:right-6 sm:text-[11px] font-mono tracking-[0.25em] hover:bg-pink-500/15 transition-colors shadow-[0_0_20px_rgba(236,72,153,0.25)]"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
      >
        <Camera size={14} />
        SHOW PABLO
      </button>
    );
  }

  return (
    <div
      // Keep the panel in the same dedicated top-right lane as its opener so
      // it never covers the bottom message board or text-input form.
      className="fixed inset-x-3 right-3 z-30 rounded-xl border border-pink-400/40 bg-black/90 backdrop-blur-xl text-zinc-100 overflow-hidden shadow-[0_0_40px_rgba(236,72,153,0.35)] sm:inset-x-auto sm:right-6 sm:w-[380px]"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
      data-testid="vision-intake-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-pink-400/25 bg-black/60">
        <div className="flex items-center gap-2 text-pink-200 text-[10px] font-mono tracking-[0.3em]">
          <Aperture size={12} />
          PABLO · VISION
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setMode("menu"); setAnalysis(""); setFilePreview(null); setError(null); }}
          className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-100"
          aria-label="Close vision panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Mode picker */}
      {mode === "menu" && (
        <div className="grid grid-cols-3 gap-1 p-2">
          <button
            type="button"
            onClick={() => setMode("camera")}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-white/10 hover:border-pink-400/50 hover:bg-pink-500/10 transition-colors"
            data-testid="vision-mode-camera"
          >
            <Camera size={18} className="text-pink-200" />
            <span className="text-[9px] font-mono tracking-[0.2em] text-zinc-300">CAMERA</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode("file"); setTimeout(() => fileInputRef.current?.click(), 50); }}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-white/10 hover:border-pink-400/50 hover:bg-pink-500/10 transition-colors"
            data-testid="vision-mode-file"
          >
            <Film size={18} className="text-pink-200" />
            <span className="text-[9px] font-mono tracking-[0.2em] text-zinc-300">FILE</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-white/10 hover:border-pink-400/50 hover:bg-pink-500/10 transition-colors"
            data-testid="vision-mode-url"
          >
            <Link2 size={18} className="text-pink-200" />
            <span className="text-[9px] font-mono tracking-[0.2em] text-zinc-300">VIDEO URL</span>
          </button>
        </div>
      )}

      {/* Camera */}
      {mode === "camera" && (
        <div className="p-2 space-y-2">
          <div className="relative aspect-video w-full bg-black rounded-md overflow-hidden border border-white/10">
            {camError ? (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-red-300 px-3 text-center">
                {camError}
              </div>
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="px-2 py-1 rounded text-[10px] font-mono tracking-[0.2em] text-zinc-400 hover:text-zinc-100"
            >
              ← BACK
            </button>
            <div className="flex items-center gap-2">
              {hasMultipleCams && (
                <button
                  type="button"
                  onClick={() => { const next: Facing = facing === "user" ? "environment" : "user"; setFacing(next); void startCamera(next); }}
                  className="px-2 py-1 rounded border border-white/10 hover:border-pink-400/50 text-[10px] font-mono tracking-[0.2em] text-zinc-300 inline-flex items-center gap-1"
                  data-testid="vision-flip-camera"
                >
                  <RefreshCw size={11} /> FLIP
                </button>
              )}
              <button
                type="button"
                onClick={onSnap}
                disabled={busy || !stream}
                className="px-3 py-1.5 rounded bg-pink-500/90 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-[10px] font-mono tracking-[0.25em] inline-flex items-center gap-1"
                data-testid="vision-snap"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Aperture size={11} />}
                ANALYZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File */}
      {mode === "file" && (
        <div className="p-3 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            data-testid="vision-file-input"
          />
          {filePreview ? (
            <img src={filePreview} alt="preview" className="w-full rounded-md border border-white/10" />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 rounded-md border border-dashed border-pink-400/40 text-pink-200 text-[11px] font-mono tracking-[0.2em] hover:bg-pink-500/10 inline-flex items-center justify-center gap-2"
            >
              <Upload size={14} /> PICK IMAGE OR VIDEO
            </button>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setMode("menu"); setFilePreview(null); }}
              className="px-2 py-1 rounded text-[10px] font-mono tracking-[0.2em] text-zinc-400 hover:text-zinc-100"
            >
              ← BACK
            </button>
            {filePreview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 rounded border border-white/10 hover:border-pink-400/50 text-[10px] font-mono tracking-[0.2em] text-zinc-300"
              >
                PICK ANOTHER
              </button>
            )}
          </div>
        </div>
      )}

      {/* URL */}
      {mode === "url" && (
        <div className="p-3 space-y-2">
          <input
            type="url"
            placeholder="https://youtu.be/… or any video link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-black/60 border border-white/10 focus:border-pink-400/60 outline-none text-[12px] font-mono text-zinc-100 placeholder:text-zinc-600"
            data-testid="vision-url-input"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="px-2 py-1 rounded text-[10px] font-mono tracking-[0.2em] text-zinc-400 hover:text-zinc-100"
            >
              ← BACK
            </button>
            <button
              type="button"
              onClick={onAnalyzeUrl}
              disabled={busy || !url.trim()}
              className="px-3 py-1.5 rounded bg-pink-500/90 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-[10px] font-mono tracking-[0.25em] inline-flex items-center gap-1"
              data-testid="vision-url-go"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Aperture size={11} />}
              ANALYZE
            </button>
          </div>
        </div>
      )}

      {/* Optional steering prompt */}
      {mode !== "menu" && (
        <div className="px-3 pb-2">
          <input
            type="text"
            placeholder="Optional: ask Pablo something specific…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-2 py-1 rounded bg-black/40 border border-white/[0.06] focus:border-pink-400/40 outline-none text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600"
            data-testid="vision-prompt"
          />
        </div>
      )}

      {/* Output */}
      {(analysis || error) && (
        <div className="border-t border-pink-400/20 bg-black/50 max-h-[40vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-[11px] font-mono text-red-300">{error}</div>
          )}
          {analysis && (
            <div className="px-3 py-2 text-[12px] leading-relaxed text-zinc-100 whitespace-pre-wrap">
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VisionIntake;
