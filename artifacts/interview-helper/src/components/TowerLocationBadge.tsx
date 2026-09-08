import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Location = { city: string; floorNumber: number };

export function TowerLocationBadge() {
  const [location, setLocation] = useState<Location | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await apiFetch("/api/shadow-tower/floors/current", { credentials: "include" }).catch(() => null);
      if (!response?.ok) return;
      const body = await response.json();
      if (active && body.floor) setLocation(body.floor);
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!location) return null;
  const city = location.city === "huda_city" ? "HUDA CITY" : "MINX CITY";
  return <span className="flex items-center gap-1.5 border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 font-mono text-[10px] tracking-widest text-emerald-200" title="Current Tower location">
    <Building2 className="h-3 w-3" /> {city} · F{location.floorNumber}
  </span>;
}