import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TowerFloor, TowerResidentPresence } from "@/lib/tower-life";

type PresenceResponse = { residents?: TowerResidentPresence[] };

export function useTowerResidentPresence(cityId: string, floor: TowerFloor): TowerResidentPresence[] {
  const [residents, setResidents] = useState<TowerResidentPresence[]>([]);
  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (document.visibilityState === "hidden" || pending) return;
      pending = true;
      try {
        const response = await apiFetch(
          `/api/tower/resident-presence?cityId=${encodeURIComponent(cityId)}&floor=${encodeURIComponent(String(floor))}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!response.ok) throw new Error(`Tower resident presence returned ${response.status}`);
        const data = await response.json() as PresenceResponse;
        if (active) setResidents(Array.isArray(data.residents) ? data.residents : []);
      } catch (error) {
        console.error("[Tower] Could not load floor-scoped resident presence", error);
        if (active) setResidents([]);
      } finally {
        pending = false;
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cityId, floor]);
  return residents;
}
