import { useEffect, useState } from "react";
import { apiFetch, FIAT_CHANGED_EVENT } from "@/lib/api-client";
import { Bitcoin, DollarSign, Coins } from "lucide-react";

type Idx = {
  btcUsd: number;
  multiplier: number;
  asOf: number;
  source: string;
  conversion: {
    usdToFiat: number;
    usdToGoldOz: number;
    btcToFiat: number;
    btcToGoldOz: number;
  };
};

function fmt(n: number, max = 2) {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function CurrencyTicker({ compact = false, showPlayerFiat = false }: { compact?: boolean; showPlayerFiat?: boolean }) {
  const [idx, setIdx] = useState<Idx | null>(null);
  const [prevBtc, setPrevBtc] = useState<number | null>(null);
  const [playerFiat, setPlayerFiat] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/real-estate/market-index");
        if (!r.ok) return;
        const j = (await r.json()) as Idx;
        if (!alive) return;
        setIdx((cur) => {
          if (cur) setPrevBtc(cur.btcUsd);
          return j;
        });
      } catch {}
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Authenticated-only: the logged-in player's current spendable ƒ balance
  // (sum of their FIAT bank accounts). Guests / signed-out viewers get a 401
  // here and the segment is gracefully omitted. Opt-in via `showPlayerFiat`
  // so the nav / market-page usages keep their lean market-only readout.
  useEffect(() => {
    if (!showPlayerFiat) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/economy/bank/accounts");
        if (!r.ok) { if (alive) setPlayerFiat(null); return; }
        const j = (await r.json()) as { accounts?: { balance?: number; currency?: string }[] };
        if (!alive) return;
        const total = (j.accounts ?? [])
          .filter((a) => (a.currency ?? "FIAT") === "FIAT")
          .reduce((s, a) => s + (a.balance ?? 0), 0);
        setPlayerFiat(total);
      } catch { if (alive) setPlayerFiat(null); }
    };
    load();
    // Fallback poll keeps the readout fresh against changes that don't originate
    // from this client (server-side ticks, other sessions).
    const id = setInterval(load, 30_000);
    // Event-driven refresh: after a buy/sell/transfer/bank action the balance
    // updates within ~1s instead of on the next poll. Debounced so a burst of
    // economy calls coalesces into a single refetch.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onFiatChanged = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 400);
    };
    window.addEventListener(FIAT_CHANGED_EVENT, onFiatChanged);
    return () => {
      alive = false;
      clearInterval(id);
      if (debounce) clearTimeout(debounce);
      window.removeEventListener(FIAT_CHANGED_EVENT, onFiatChanged);
    };
  }, [showPlayerFiat]);

  if (!idx) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
        LOADING MARKET…
      </div>
    );
  }

  const dir = prevBtc == null ? 0 : Math.sign(idx.btcUsd - prevBtc);
  const arrow = dir > 0 ? "▴" : dir < 0 ? "▾" : "·";
  const arrowCls = dir > 0 ? "text-emerald-400" : dir < 0 ? "text-red-400" : "text-zinc-600";

  // Reference unit = 1 USD (so the chain reads naturally for the player)
  const oneUsdInFiat = idx.conversion.usdToFiat;
  const oneUsdInGold = idx.conversion.usdToGoldOz;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 tracking-wider whitespace-nowrap">
        <Bitcoin className="w-3 h-3 text-amber-400/80" />
        <span className="text-amber-300">${fmt(idx.btcUsd, 0)}</span>
        <span className={arrowCls}>{arrow}</span>
        <span className="text-zinc-700">·</span>
        <span className="text-fuchsia-300">ƒ{fmt(oneUsdInFiat)}/$</span>
        <span className="text-zinc-700">·</span>
        <span className="text-amber-200">{fmt(oneUsdInGold, 4)}oz/$</span>
        {showPlayerFiat && playerFiat != null && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-sky-300">YOU ƒ{fmt(playerFiat, 0)}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider whitespace-nowrap">
      <span className="flex items-center gap-1 text-amber-400/80">
        <Bitcoin className="w-3 h-3" />
        <span className="text-amber-300">${fmt(idx.btcUsd, 0)}</span>
        <span className={arrowCls}>{arrow}</span>
      </span>
      <span className="text-zinc-700">→</span>
      <span className="flex items-center gap-1 text-zinc-300">
        <DollarSign className="w-3 h-3 text-emerald-400/80" />
        1 USD
      </span>
      <span className="text-zinc-700">→</span>
      <span className="text-fuchsia-300">ƒ{fmt(oneUsdInFiat)}</span>
      <span className="text-zinc-700">→</span>
      <span className="flex items-center gap-1 text-amber-200">
        <Coins className="w-3 h-3 text-amber-400/80" />
        {fmt(oneUsdInGold, 4)} oz
      </span>
      {showPlayerFiat && playerFiat != null && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-sky-300">YOU ƒ{fmt(playerFiat, 0)}</span>
        </>
      )}
    </div>
  );
}

export default CurrencyTicker;
