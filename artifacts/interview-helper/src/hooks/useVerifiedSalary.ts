import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface VerifiedSalaryState {
  verified: boolean;
  monthlySalary: number;
  hourlyRate: number;
  paid: number;
  total: number;
  lastClaimAt: number | null;
  nextHourInMs: number;
  balance: number;
  spendable: number;
  // Real-business owner who declared a salary but isn't verified yet: they're
  // "legally unemployed / awaiting a work visa" and earns no passive FIAT until
  // verification clears. Lets the HUD explain the ƒ0 instead of hiding it.
  awaitingVerification: boolean;
  pendingMonthlySalary: number;
  pendingHourlyRate: number;
}

export interface VerifiedSalaryPayEvent {
  id: number;
  amount: number;
}

/**
 * Polls the verified real-salary accrual endpoint (server-authoritative,
 * idempotent) while the HUD is mounted. A player whose real-world monthly
 * salary is verified earns monthlySalary/720 ƒ per REAL-world hour; the server
 * credits whole real-hours only and this hook surfaces the running spendable
 * balance plus a short-lived "pay event" so the HUD can float a "+ƒ" animation.
 *
 * Cadence is real-time (a whole hour between credits), so a 60s poll is plenty
 * to collect a new hour shortly after it accrues while staying cheap to run.
 */
export function useVerifiedSalary(active = true) {
  const [state, setState] = useState<VerifiedSalaryState | null>(null);
  const [payEvents, setPayEvents] = useState<VerifiedSalaryPayEvent[]>([]);
  const idRef = useRef(0);
  const inFlight = useRef(false);

  const claim = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await apiFetch('/api/economy/verified-salary/claim', { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as VerifiedSalaryState;
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
    const t = window.setInterval(claim, 60_000);
    return () => window.clearInterval(t);
  }, [active, claim]);

  return { state, payEvents, claim };
}
