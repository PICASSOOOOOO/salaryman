import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MessageSquare } from "lucide-react";
import { useCommsSummary } from "@/hooks/use-comms-summary";
import { useIsMobile } from "@/hooks/use-mobile";
import { queuePendingCommsDmUserId } from "@/lib/comms-navigation";

const ChatPanel = lazy(() =>
  import("@/components/ChatPanel").then((module) => ({ default: module.ChatPanel })),
);

/**
 * Site-wide desktop COMMS dock. It stays closed until the user opens it or a
 * message action explicitly targets it; mobile continues to use the full page.
 */
export function DeferredChatPanel() {
  const { total } = useCommsSummary();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [viewportReady, setViewportReady] = useState(false);
  const [loadPanel, setLoadPanel] = useState(false);
  const [initialDmUserId, setInitialDmUserId] = useState<string>();
  const [dmRequestId, setDmRequestId] = useState(0);
  const [openRequestId, setOpenRequestId] = useState(0);

  useEffect(() => setViewportReady(true), []);

  useEffect(() => {
    if (!viewportReady) return;

    const onOpenChat = () => {
      if (isMobile) {
        navigate("/comms");
        return;
      }
      setLoadPanel(true);
      setOpenRequestId((current) => current + 1);
    };
    const onOpenDm = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId?.trim();
      if (isMobile) {
        if (userId) queuePendingCommsDmUserId(userId);
        navigate("/comms");
        return;
      }
      setLoadPanel(true);
      setOpenRequestId((current) => current + 1);
      if (userId) {
        setInitialDmUserId(userId);
        setDmRequestId((current) => current + 1);
      }
    };

    window.addEventListener("salaryman:open-chat", onOpenChat);
    window.addEventListener("salaryman:open-dm", onOpenDm as EventListener);
    return () => {
      window.removeEventListener("salaryman:open-chat", onOpenChat);
      window.removeEventListener("salaryman:open-dm", onOpenDm as EventListener);
    };
  }, [isMobile, navigate, viewportReady]);

  if (!viewportReady || isMobile) return null;

  return (
    <>
      {!loadPanel && (
        <button
          type="button"
          data-testid="button-comms-toggle"
          aria-label="Open COMMS panel"
          aria-expanded={false}
          aria-controls="comms-panel"
          title="Open COMMS"
          onClick={() => setLoadPanel(true)}
          className="fixed bottom-0 right-6 z-[851] flex h-10 items-center justify-center gap-2 border border-b-0 border-black bg-[#FFFCF5] px-4 font-mono text-[10px] font-bold tracking-[0.14em] text-black shadow-[0_-2px_8px_rgba(0,0,0,0.14)]"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          COMMS
          {total > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center border border-black bg-black px-1 text-[9px] font-bold text-[#FFFCF5]">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      )}
      {loadPanel && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              className="fixed bottom-0 right-6 z-[851] flex h-10 items-center justify-center gap-2 border border-b-0 border-black bg-[#FFFCF5] px-4 font-mono text-[10px] font-bold tracking-[0.14em] text-black shadow-[0_-2px_8px_rgba(0,0,0,0.14)]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              OPENING COMMS
            </div>
          }
        >
          <ChatPanel
            dockMode
            initiallyOpen
            initialDmUserId={initialDmUserId}
            initialDmRequestId={dmRequestId}
            openRequestId={openRequestId}
          />
        </Suspense>
      )}
    </>
  );
}