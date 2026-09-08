import { useEffect, useState } from "react";
import { AlertTriangle, X, Send, Check } from "lucide-react";
import { subscribeErrors, sendReport, installGlobalErrorHandlers, type CapturedError } from "@/lib/errorReporter";

// Sits at the root of the tree. Listens for runtime errors captured by the
// global handlers (and React errors via ErrorBoundary integration) and shows
// a small bottom-right toast asking the user to add detail. The technical
// part of the report has already been auto-sent — the textarea is purely for
// human context. Designed to never block the user from continuing to work.
export function GlobalErrorReporter() {
  const [active, setActive] = useState<CapturedError | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    installGlobalErrorHandlers();
    const unsub = subscribeErrors((err) => {
      // If a toast is already up, ignore further errors — we don't want to
      // tower toasts on top of each other while the user is trying to write.
      setActive((prev) => prev ?? err);
    });
    return unsub;
  }, []);

  const dismiss = () => {
    setActive(null);
    setNote("");
    setSent(false);
    setBusy(false);
  };

  const submit = async () => {
    if (!active || !note.trim()) return;
    setBusy(true);
    const ok = await sendReport({
      source: active.source,
      message: active.message,
      stack: active.stack,
      componentStack: active.componentStack,
      url: active.url,
      userAgent: active.userAgent,
      userNote: note.trim(),
    });
    setBusy(false);
    if (ok) {
      setSent(true);
      setTimeout(dismiss, 1400);
    }
  };

  if (!active) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] w-[min(92vw,360px)] rounded-lg border border-red-500/30 bg-zinc-950/95 backdrop-blur shadow-2xl text-zinc-100 font-mono"
      role="alertdialog"
      aria-live="assertive"
    >
      <div className="flex items-start gap-2 p-3 border-b border-red-500/20">
        <div className="mt-0.5 w-7 h-7 rounded bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-red-300">SOMETHING GLITCHED</div>
          <div className="text-xs text-zinc-300 mt-0.5 truncate" title={active.message}>{active.message}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Auto-reported. Add a note?</div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {sent ? (
        <div className="p-3 flex items-center gap-2 text-emerald-400 text-xs">
          <Check className="w-4 h-4" /> Thanks — report sent.
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            placeholder="What were you doing when this happened?"
            rows={3}
            className="w-full text-xs bg-black/40 border border-white/10 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/40 resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">{note.length}/1000</span>
            <div className="flex items-center gap-2">
              <button
                onClick={dismiss}
                className="text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 px-2 py-1"
              >
                Skip
              </button>
              <button
                onClick={submit}
                disabled={!note.trim() || busy}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider bg-sky-500/15 border border-sky-500/30 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-colors"
              >
                <Send className="w-3 h-3" /> Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
