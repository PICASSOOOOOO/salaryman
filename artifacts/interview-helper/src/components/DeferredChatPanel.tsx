import { lazy, Suspense, useEffect, useState } from "react";
import { useCommsSummary } from "@/hooks/use-comms-summary";

const ChatPanel = lazy(() =>
  import("@/components/ChatPanel").then((m) => ({ default: m.ChatPanel })),
);

/**
 * Lightweight COMMS launcher. The WebSocket client, composer, markdown and
 * attachment UI are not evaluated until the user (or another surface) asks to
 * open chat. The existing summary poll keeps the badge accurate beforehand.
 */
export function DeferredChatPanel() {
  const [loadPanel, setLoadPanel] = useState(false);
  const [initialDmUserId, setInitialDmUserId] = useState<string | undefined>();
  const { total } = useCommsSummary();

  useEffect(() => {
    if (loadPanel) return;
    const load = (event: Event) => {
      if (event.type === "salaryman:open-dm") {
        setInitialDmUserId((event as CustomEvent<{ userId?: string }>).detail?.userId);
      }
      setLoadPanel(true);
    };
    window.addEventListener("salaryman:open-chat", load);
    window.addEventListener("salaryman:open-dm", load);
    return () => {
      window.removeEventListener("salaryman:open-chat", load);
      window.removeEventListener("salaryman:open-dm", load);
    };
  }, [loadPanel]);

  if (loadPanel) {
    return (
      <Suspense fallback={null}>
        <ChatPanel initiallyOpen initialDmUserId={initialDmUserId} />
      </Suspense>
    );
  }

  return (
    <button
      type="button"
      data-testid="button-comms-toggle"
      aria-label="Open chat"
      title="Chat"
      onClick={() => setLoadPanel(true)}
      className="fixed bottom-[calc(var(--app-safe-bottom)+16px+var(--fab-bottom-offset,0px))] right-[calc(var(--app-safe-right)+16px)] z-[901] flex h-[52px] w-[52px] items-center justify-center rounded-full border border-emerald-400/40 bg-slate-950/92 text-xl text-emerald-300 shadow-[0_4px_18px_rgba(0,0,0,.65),0_0_12px_rgba(52,211,153,.18)] backdrop-blur sm:bottom-[calc(16px+var(--fab-bottom-offset,0px))] sm:right-4 sm:h-[42px] sm:w-[42px] sm:border-[1.5px] sm:text-lg"
    >
      <span aria-hidden>◇</span>
      {total > 0 && (
        <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-950 bg-red-500 px-1 text-[10px] font-bold text-white">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </button>
  );
}