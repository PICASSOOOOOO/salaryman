import { useEffect } from "react";
import { useLocation } from "wouter";
import { queuePendingCommsDmUserId } from "@/lib/comms-navigation";

/**
 * Keeps legacy COMMS actions working without a site-wide floating dock.
 * The full COMMS page is available from navigation and The Office widgets.
 */
export function DeferredChatPanel() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const onOpenChat = () => {
      navigate("/comms");
    };
    const onOpenDm = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId?.trim();
      if (userId) queuePendingCommsDmUserId(userId);
      navigate("/comms");
    };

    window.addEventListener("salaryman:open-chat", onOpenChat);
    window.addEventListener("salaryman:open-dm", onOpenDm as EventListener);
    return () => {
      window.removeEventListener("salaryman:open-chat", onOpenChat);
      window.removeEventListener("salaryman:open-dm", onOpenDm as EventListener);
    };
  }, [navigate]);

  return null;
}