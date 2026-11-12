import { useCallback, useState } from "react";
import { useMusicPlayer, type Track } from "@/contexts/MusicPlayerContext";

export type ExportOpts = {
  name: string;
  mime?: string;
  artist?: string;
  album?: string;
};

function safeName(n: string, ext: string) {
  const base = n.replace(/[^\w\-. ]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "untitled";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

function extFromMime(m?: string): string {
  if (!m) return "wav";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("flac")) return "flac";
  return "bin";
}

export function useHummingbirdBridge() {
  const mp = useMusicPlayer();
  const [exporting, setExporting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const exportBlob = useCallback(
    async (blob: Blob, opts: ExportOpts) => {
      setExporting(true);
      setLastError(null);
      try {
        const mime = opts.mime || blob.type || "audio/wav";
        const ext = extFromMime(mime);
        const fname = safeName(opts.name, ext);
        const file = new File([blob], fname, { type: mime });
        await mp.uploadFiles([file]);
        await mp.refresh();
        return true;
      } catch (e: any) {
        setLastError(e?.message || "Export failed");
        return false;
      } finally {
        setExporting(false);
      }
    },
    [mp],
  );

  const tracks: Track[] = mp.tracks;

  return {
    exportBlob,
    exporting,
    lastError,
    tracks,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
  };
}
