import { ArrowUpRight, Coins, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { apiFetch, FIAT_CHANGED_EVENT } from "@/lib/api-client";
import { STREAMER_MASK } from "@/lib/streamer-mode";
import { useStreamerMode } from "@/hooks/use-streamer-mode";

type WalletSnapshot = {
  bank?: {
    earnedFiat?: number;
  };
  gold?: number;
};

function formatFiat(value: unknown): string {
  const amount = Number(value);
  return `ƒ${(Number.isFinite(amount) ? Math.round(amount) : 0).toLocaleString()}`;
}

function formatGold(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toFixed(amount < 10 ? 1 : 0)} oz`;
}

/**
 * The nav balance is intentionally a compact readout, not a second wallet
 * implementation. The wallet snapshot remains authoritative and /wallet is
 * the detail view for account, company, and net-worth information.
 */
export function FinanceBalance({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [, navigate] = useLocation();
  const streamerMode = useStreamerMode();
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSnapshot(null);
      return;
    }

    let alive = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/wallet/snapshot", { credentials: "include" });
        if (!response.ok) {
          if (alive) setSnapshot(null);
          return;
        }
        const next = (await response.json()) as WalletSnapshot;
        if (alive) setSnapshot(next);
      } catch {
        if (alive) setSnapshot(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    void load();
    const interval = window.setInterval(load, 30_000);
    let debounce: number | null = null;
    const onFiatChanged = () => {
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void load(), 400);
    };
    window.addEventListener(FIAT_CHANGED_EVENT, onFiatChanged);

    return () => {
      alive = false;
      window.clearInterval(interval);
      if (debounce !== null) window.clearTimeout(debounce);
      window.removeEventListener(FIAT_CHANGED_EVENT, onFiatChanged);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const spendable = snapshot?.bank?.earnedFiat;
  const gold = snapshot?.gold;
  const fiatLabel = loading && !snapshot
    ? "…"
    : snapshot?.bank?.earnedFiat == null
      ? "—"
      : streamerMode
        ? STREAMER_MASK
        : formatFiat(spendable);
  const goldLabel = loading && !snapshot ? "…" : snapshot?.gold == null ? "—" : formatGold(gold);

  return (
    <button
      type="button"
      onClick={() => navigate("/wallet")}
      className="group flex min-w-0 max-w-full items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-left transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/[0.11] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/70"
      title="Open your full wallet and account snapshot"
      aria-label={`Open wallet. Spendable FIAT ${fiatLabel}. In-game GOLD ${goldLabel}.`}
    >
      <WalletCards className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
      <span className="flex min-w-0 flex-col gap-0.5 leading-none">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-200/65">
          SPENDABLE FIAT
        </span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-100">
          {fiatLabel}
        </span>
      </span>
      <span className="hidden items-center gap-1 border-l border-emerald-300/15 pl-2 font-mono text-[10px] tabular-nums text-amber-200/85 sm:flex">
        <Coins className="h-3 w-3 text-amber-300/80" />
        {goldLabel}
      </span>
      <ArrowUpRight className="h-3 w-3 shrink-0 text-emerald-300/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </button>
  );
}

export default FinanceBalance;