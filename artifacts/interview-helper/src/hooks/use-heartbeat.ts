import { apiFetch } from '@/lib/api-client';
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

const HEARTBEAT_MS = 5 * 60 * 1000; // every 5 minutes when active

// Pings /api/lifecycle/heartbeat so the server knows the user is still around.
// Drives Pablo's 3-day warning + 28-day asset seizure.
export function useHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const ping = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await apiFetch("/api/lifecycle/heartbeat", { method: "POST", credentials: "include" });
      } catch {
        // network failure — silent; next interval will retry
      }
    };

    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);
}
