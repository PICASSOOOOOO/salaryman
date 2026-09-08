import { useEffect, useState } from "react";
import { apiFetch, FIAT_CHANGED_EVENT } from "@/lib/api-client";
import { Bitcoin, Coins } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { setLiveRates } from "@/lib/currency";
import { useStreamerMode } from "@/hooks/use-streamer-mode";
import { STREAMER_MASK } from "@/lib/streamer-mode";

type Idx = {
  btcUsd: number;
  goldUsd: number | null;
  multiplier: number;
  asOf: number;
  source: string;
  status: "live" | "stale" | "unavailable";
  goldSource: string | null;
  goldAsOf: number | null;
  conversion: {
    usdToFiat: number;
    usdToGoldOz: number;
    btcToFiat: number;
    btcToGoldOz: number;
    fiatPerGold: number;
    btcPerUsd: number | null;
  };
  // Live USD→currency fiat FX rates (optional — older servers omit it).
  fx?: Record<string, number>;
};

function fmt(n: number, max = 2) {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function CurrencyTicker({ compact = false, showPlayerFiat = false, wrap = false }: { compact?: boolean; showPlayerFiat?: boolean; wrap?: boolean }) {
  const [idx, setIdx] = useState<Idx | null>(null);
  const [prevBtc, setPrevBtc] = useState<number | null>(null);
  const [playerFiat, setPlayerFiat] = useState<number | null>(null);
  // Real-world display currency (USD by default). Selecting another currency
  // re-renders this ticker live and converts the USD readouts via static rates.
  const { code: curCode, info: cur } = useCurrency();
  const streamerMode = useStreamerMode();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/real-estate/market-index");
        if (!r.ok) return;
        const j = (await r.json()) as Idx;
        if (!alive) return;
        // Feed live USD→currency FX rates into the display-currency layer so all
        // money readouts (here and elsewhere) convert with fresh rates instead
        // of the static fallback table.
        setLiveRates(j.fx);
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

  if (idx.status === "unavailable" || !idx.btcUsd) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono text-rose-300 tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        LIVE MARKET UNAVAILABLE · CONVERSION DISABLED
      </div>
    );
  }

  const dir = prevBtc == null ? 0 : Math.sign(idx.btcUsd - prevBtc);
  const arrow = dir > 0 ? "▴" : dir < 0 ? "▾" : "·";
  const arrowCls = dir > 0 ? "text-emerald-400" : dir < 0 ? "text-red-400" : "text-zinc-600";
  const status = idx.status ?? "live";

  // Reference unit = 1 unit of the selected display currency. USD is the native
  // unit of the market index, so converting to the chosen currency just divides
  // the per-USD rates by that currency's USD rate (units-per-USD).
  // Display-only: in-game ƒ/Gold and Stripe charges are unaffected.
  const ratePerUsd = cur.ratePerUsd;
  const btcInCur = idx.btcUsd * ratePerUsd;
  const goldInCur = idx.goldUsd == null ? null : idx.goldUsd * ratePerUsd;
  const oneCurInFiat = idx.conversion.usdToFiat / ratePerUsd;
  const sym = cur.symbol;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 tracking-wider ${wrap ? "flex-wrap gap-y-0.5" : "whitespace-nowrap"}`}
        title={`Live market reference · BTC ${sym}${fmt(btcInCur, 0)} · spot gold ${goldInCur == null ? "unavailable" : `${sym}${fmt(goldInCur, 0)}/oz`} · conversion ${sym}1 = ƒ${fmt(oneCurInFiat)} · ${status.toUpperCase()} · updated ${new Date(idx.asOf).toLocaleString()}. Wallet FIAT and in-game GOLD are separate holdings.`}
        aria-label={`Live market reference: Bitcoin ${sym}${fmt(btcInCur, 0)}, spot gold ${goldInCur == null ? "unavailable" : `${sym}${fmt(goldInCur, 0)} per ounce`}, conversion ${sym}1 equals ƒ${fmt(oneCurInFiat)}, ${status}`}
      >
        <Bitcoin className="w-3 h-3 text-amber-400/80" />
        <span className="text-zinc-500">BTC</span>
        <span className="text-amber-300">{sym}{fmt(btcInCur, 0)}</span>
        <span className={arrowCls}>{arrow}</span>
        <span className="text-zinc-700">·</span>
        <span className="text-fuchsia-300">ƒ{fmt(oneCurInFiat)}/{curCode}</span>
        <span className="text-zinc-700">·</span>
        <span className="text-amber-200">
          <span className="text-zinc-500">Au</span>{" "}
          {goldInCur == null ? "—" : `${sym}${fmt(goldInCur, 0)}/oz`}
        </span>
        <span className={status === "live" ? "text-emerald-300/80" : "text-amber-300/90"}>
          {status.toUpperCase()}
        </span>
        {showPlayerFiat && playerFiat != null && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-sky-300">YOU ƒ{streamerMode ? STREAMER_MASK : fmt(playerFiat, 0)}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider whitespace-nowrap">
      <span className="flex items-center gap-1 text-amber-400/80">
        <Bitcoin className="w-3 h-3" />
        <span className="text-amber-300">{sym}{fmt(btcInCur, 0)}</span>
        <span className={arrowCls}>{arrow}</span>
      </span>
      <span className="text-zinc-700">→</span>
      <span className="flex items-center gap-1 text-zinc-300">
        <span className="text-emerald-400/80">{sym}</span>
        1 {curCode}
      </span>
      <span className="text-zinc-700">→</span>
      <span className="text-fuchsia-300">ƒ{fmt(oneCurInFiat)}</span>
      <span className="text-zinc-700">→</span>
      <span className="flex items-center gap-1 text-amber-200">
        <Coins className="w-3 h-3 text-amber-400/80" />
        {goldInCur == null ? "—" : `${sym}${fmt(goldInCur, 0)}/oz`}
      </span>
      <span className="text-zinc-700">·</span>
      <span className={status === "live" ? "text-emerald-300" : "text-amber-300"}>
        {status.toUpperCase()} · {idx.source.toUpperCase()} · {new Date(idx.asOf).toLocaleTimeString()}
      </span>
      {showPlayerFiat && playerFiat != null && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-sky-300">YOU ƒ{streamerMode ? STREAMER_MASK : fmt(playerFiat, 0)}</span>
        </>
      )}
    </div>
  );
}

export default CurrencyTicker;
