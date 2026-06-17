import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface SalaryState {
  paid: number;
  total: number;
  perGameDay: number;
  startedAt: number;
  expiresAt: number;
  expired: boolean;
  remainingMs: number;
  nextDayInMs: number;
  balance: number;
  spendable: number;
}

export interface SalaryPayEvent {
  id: number;
  amount: number;
}

/**
 * Polls the Pablo Corp unemployment stipend endpoint (server-authoritative,
 * idempotent) while the office HUD is mounted. Once per in-game day the server
 * credits a lump stipend; this hook surfaces the running spendable balance and
 * emits a short-lived "pay event" so the HUD can float a "+ƒ" animation.
 *
 * A game day is 1 real hour, so we poll every 30s — frequent enough to collect
 * a new day's stipend within half a minute, cheap enough to leave running.
 */
export function useUnemploymentSalary(active = true) {
  const [state, setState] = useState<SalaryState | null>(null);
  const [payEvents, setPayEvents] = useState<SalaryPayEvent[]>([]);
  const idRef = useRef(0);
  const inFlight = useRef(false);

  const claim = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await apiFetch('/api/economy/salary/claim', { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as SalaryState;
      setState(data);
      if (data.paid > 0) {
        const id = ++idRef.current;
        setPayEvents((ev) => [...ev, { id, amount: data.paid }]);
        window.setTimeout(() => {
          setPayEvents((ev) => ev.filter((e) => e.id !== id));
        }, 2200);
      }
    } catch {
      /* network hiccup — next tick retries */
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    claim();
    const t = window.setInterval(claim, 30_000);
    return () => window.clearInterval(t);
  }, [active, claim]);

  return { state, payEvents, claim };
}
