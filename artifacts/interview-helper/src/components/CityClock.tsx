import { useEffect, useState } from "react";
import {
  cityTimezone,
  getCityClock,
  type CityClock as CityClockValue,
} from "@workspace/api-zod";
import { apiFetch } from "@/lib/api-client";

export function useCityClock(cityId: string) {
  const [clock, setClock] = useState<CityClockValue | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/api/tower-market/clock?city=${encodeURIComponent(cityId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("CLOCK_SYNC_FAILED");
        const payload = await response.json() as { serverNow?: string };
        const serverNow = Date.parse(String(payload.serverNow ?? ""));
        if (!Number.isFinite(serverNow)) throw new Error("CLOCK_PAYLOAD_INVALID");
        if (!cancelled) {
          setOffsetMs(serverNow - Date.now());
          setSyncError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSyncError(true);
      });
    return () => { cancelled = true; };
  }, [cityId]);

  useEffect(() => {
    if (offsetMs == null) return;
    const tick = () => setClock(getCityClock(new Date(Date.now() + offsetMs), cityId));
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [cityId, offsetMs]);

  return { clock, syncError, timezone: cityTimezone(cityId) };
}

export function CityClock({
  cityId,
  compact = false,
  showSeconds = true,
}: {
  cityId: string;
  compact?: boolean;
  showSeconds?: boolean;
}) {
  const { clock, syncError, timezone } = useCityClock(cityId);
  const label = clock
    ? showSeconds ? clock.label : clock.label.slice(0, 5)
    : syncError ? "CLOCK OFFLINE" : "SYNCING CLOCK";
  return (
    <span
      className={`${compact ? "text-[9px]" : "text-[10px]"} font-mono tracking-[.12em] ${syncError ? "text-red-300" : "text-cyan-200"}`}
      title={`${cityId} · ${timezone}`}
      data-testid={`city-clock-${cityId}`}
    >
      {label} · {timezone}
    </span>
  );
}