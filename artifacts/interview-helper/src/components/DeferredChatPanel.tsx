import { lazy, Suspense, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
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
      aria-label="Open COMMS"
      title="Open COMMS"
      onClick={() => setLoadPanel(true)}
      className="fixed bottom-[calc(var(--app-safe-bottom)+16px+var(--fab-bottom-offset,0px))] right-[calc(var(--app-safe-right)+16px)] z-[901] flex h-11 items-center justify-center gap-2 border border-black bg-[#FFFCF5] px-3 font-mono text-[10px] font-bold tracking-[0.14em] text-black shadow-[4px_4px_0_#000] sm:bottom-[calc(16px+var(--fab-bottom-offset,0px))] sm:right-4"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      COMMS
      {total > 0 && (
        <span className="absolute -left-2 -top-2 flex h-5 min-w-5 items-center justify-center border border-black bg-black px-1 text-[9px] font-bold text-[#FFFCF5]">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </button>
  );
}