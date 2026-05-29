import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Check, X, ZoomIn } from 'lucide-react';

const VIEWPORT = 256;
const OUTPUT_MAX = 512;

interface Point {
  x: number;
  y: number;
}

/**
 * Square-crop + downscale modal for profile photos.
 *
 * The user pans (drag) and zooms (slider) the source image inside a square
 * viewport. On save we render the visible region to a canvas capped at
 * OUTPUT_MAX px and re-encode it as JPEG, returning a small File ready to
 * upload. The image is always kept covering the viewport so the result is a
 * full, centered square with no transparent gaps.
 */
export function AvatarCropModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Load the picked file into an HTMLImageElement via an object URL.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setLoadError(true);
    image.src = url;
    return () => {
      URL.revokeObjectURL(url);
      objectUrlRef.current = null;
    };
  }, [file]);

  // Baseline "cover" scale: smallest scale that fills the viewport.
  const baseScale = img ? Math.max(VIEWPORT / img.width, VIEWPORT / img.height) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.width * scale : 0;
  const dispH = img ? img.height * scale : 0;

  // Keep the image covering the viewport: offsets are bounded so no edge
  // pulls inside the square.
  const clamp = useCallback(
    (next: Point): Point => {
      const minX = VIEWPORT - dispW;
      const minY = VIEWPORT - dispH;
      return {
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y)),
      };
    },
    [dispW, dispH],
  );

  // Center the image whenever it loads or the zoom changes.
  useEffect(() => {
    if (!img) return;
    setOffset((prev) => {
      // Preserve the focal center across zoom changes when possible.
      const centerX = (VIEWPORT / 2 - prev.x) / (dispW || 1);
      const centerY = (VIEWPORT / 2 - prev.y) / (dispH || 1);
      const next = {
        x: VIEWPORT / 2 - centerX * dispW,
        y: VIEWPORT / 2 - centerY * dispH,
      };
      const minX = VIEWPORT - dispW;
      const minY = VIEWPORT - dispH;
      return {
        x: Math.min(0, Math.max(minX, Number.isFinite(next.x) ? next.x : 0)),
        y: Math.min(0, Math.max(minY, Number.isFinite(next.y) ? next.y : 0)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      // Visible region of the source image, in source pixels.
      const srcX = -offset.x / scale;
      const srcY = -offset.y / scale;
      const srcSize = VIEWPORT / scale;
      // Never upscale beyond the source region; cap at OUTPUT_MAX.
      const out = Math.max(1, Math.min(OUTPUT_MAX, Math.round(srcSize)));

      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, out, out);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('encode-failed');

      const base = file.name.replace(/\.[^./\\]+$/, '') || 'avatar';
      const cropped = new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
      onCropped(cropped);
    } catch {
      setLoadError(true);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xs bg-[#0d100d] border border-cyan-500/25 rounded-lg p-4 font-mono">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs tracking-widest text-cyan-400/80">CROP PHOTO</h3>
          <button onClick={onCancel} disabled={busy} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        {loadError ? (
          <div className="text-[11px] text-red-300 py-8 text-center">⚠ Couldn't read that image. Try another.</div>
        ) : (
          <>
            <div
              className="relative mx-auto overflow-hidden rounded-full border border-cyan-500/30 bg-[#080b08] touch-none select-none cursor-grab active:cursor-grabbing"
              style={{ width: VIEWPORT, height: VIEWPORT }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {img ? (
                <img
                  src={objectUrlRef.current ?? undefined}
                  alt="Crop preview"
                  draggable={false}
                  className="absolute max-w-none pointer-events-none"
                  style={{ width: dispW, height: dispH, left: offset.x, top: offset.y }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-cyan-400/40" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <ZoomIn size={14} className="text-cyan-400/50 shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                disabled={!img || busy}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-cyan-400 disabled:opacity-40"
                aria-label="Zoom"
              />
            </div>

            <p className="text-[10px] text-cyan-400/30 mt-2 text-center">Drag to reposition · slide to zoom</p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={onCancel}
                disabled={busy}
                className="flex-1 px-3 py-1.5 text-[11px] tracking-wider rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                onClick={save}
                disabled={!img || busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] tracking-wider rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                SAVE
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
