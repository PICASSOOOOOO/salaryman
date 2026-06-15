import { useEffect, useRef } from "react";
import { apiFetch, PABLO_TAX_DRAW_CHECK_EVENT } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";

type Meter = {
  period: string;
  billedCents: number;
  fiatPerUsd: number;
};

// Global, route-independent toaster that explains Pablo-Tax draws. AI usage
// (Pablo chat, image generation, character portraits) is billed FIRE-AND-FORGET
// after the response, so the player's ƒ balance can drop with no on-screen
// explanation. This watches the billing meter and, when the waterfall actually
// draws ƒ (billedCents goes UP), pops a small one-line toast naming the charge.
//
// Nothing is shown for the common case where a call accrues cost but draws 0 ƒ
// (the waterfall only bills once accrued usage crosses a $20 increment), and the
// fire-and-forget billing invariant is untouched — we only READ the meter, on a
// delay, after the AI response has already been delivered.
//
// Mount this once, only while authenticated.
export function PabloTaxToaster() {
  // Last-seen billedCents for the CURRENT period. null until the baseline fetch
  // resolves so we never toast the pre-existing total at mount/login.
  const lastBilledRef = useRef<number | null>(null);
  const periodRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    const readMeter = async (): Promise<Meter | null> => {
      try {
        const r = await apiFetch("/api/pablo-tax/meter");
        if (!r.ok) return null;
        return (await r.json()) as Meter;
      } catch {
        return null;
      }
    };

    // Establish the baseline once so the first check after an AI call compares
    // against a known total rather than toasting whatever was already billed.
    const baseline = async () => {
      const m = await readMeter();
      if (!alive || !m) return;
      lastBilledRef.current = m.billedCents;
      periodRef.current = m.period;
    };
    void baseline();

    const onCheck = async () => {
      const m = await readMeter();
      if (!alive || !m) return;

      // Month rollover (or a baseline that never landed): re-anchor, don't toast.
      if (lastBilledRef.current == null || periodRef.current !== m.period) {
        lastBilledRef.current = m.billedCents;
        periodRef.current = m.period;
        return;
      }

      const deltaCents = m.billedCents - lastBilledRef.current;
      lastBilledRef.current = m.billedCents;
      // Only an actual draw (billedCents increased) gets a toast. A 0 / negative
      // delta is the common "accrued but nothing drawn" case — stay silent.
      if (deltaCents <= 0) return;

      const fiat = Math.round((deltaCents / 100) * (m.fiatPerUsd || 1000));
      toast({
        title: "Pablo Tax",
        description: `ƒ${fiat.toLocaleString()} drawn for AI usage`,
        duration: 6000,
      });
    };

    window.addEventListener(PABLO_TAX_DRAW_CHECK_EVENT, onCheck);
    return () => {
      alive = false;
      window.removeEventListener(PABLO_TAX_DRAW_CHECK_EVENT, onCheck);
    };
  }, []);

  return null;
}

export default PabloTaxToaster;
