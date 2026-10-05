import { useLocation } from "wouter";
import { MessageSquare } from "lucide-react";
import { useCommsSummary } from "@/hooks/use-comms-summary";

/**
 * COMMS launcher. Messaging opens in its dedicated page rather than a floating
 * panel, so it cannot cover another page's controls or text fields.
 */
export function DeferredChatPanel() {
  const { total } = useCommsSummary();
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      data-testid="button-comms-toggle"
      aria-label="Open COMMS"
      title="Open COMMS"
      onClick={() => navigate("/comms")}
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