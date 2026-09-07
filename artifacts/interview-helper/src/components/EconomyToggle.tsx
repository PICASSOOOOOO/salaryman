import { useEffect, useState } from "react";
import { Activity, Bitcoin, ChevronDown, Coins, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type MarketIndex = {
  btcUsd: number;
  multiplier: number;
  asOf: number;
  status: "live" | "stale" | "unavailable";
  source: string;
  goldUsd: number | null;
  conversion?: {
    usdToFiat: number;
    usdToGoldOz: number;
    btcToFiat: number;
    btcToGoldOz: number;
  };
};

function money(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

/**
 * A deliberately small disclosure for the shared workspace chrome.
 * USD is the fixed reference; the live BTC multiplier changes the FIAT and
 * in-game GOLD amounts required for one USD. This is not a wallet or portfolio.
 */
export function EconomyToggle() {
  const [market, setMarket] = useState<MarketIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/real-estate/market-index");
      if (!response.ok) {
        setMarket(null);
        return;
      }
      setMarket((await response.json()) as MarketIndex);
    } catch {
      setMarket(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const status = market?.status ?? (loading ? "syncing" : "offline");
  const isLive = status === "live";
  const statusLabel = status.toUpperCase();
  const statusClass = isLive ? "is-live" : status === "stale" ? "is-stale" : "is-offline";

  return (
    <div className={`economy-toggle ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="economy-toggle-button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        aria-expanded={open}
        aria-controls="salaryman-economy-disclosure"
        title="Show the live BTC-linked economy reference"
      >
        <span className={`economy-status-dot ${statusClass}`} />
        <Activity className="economy-toggle-icon" />
        <span>ECONOMY</span>
        <ChevronDown className={`economy-toggle-chevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <section id="salaryman-economy-disclosure" className="economy-popover" aria-label="Live economy reference">
          <div className="economy-popover-heading">
            <div>
              <p className="economy-popover-kicker">LIVE ECONOMY REFERENCE</p>
              <p className="economy-popover-note">USD fixed · BTC moves the in-game rails</p>
            </div>
            <button
              type="button"
              className="economy-refresh-button"
              onClick={() => void load()}
              aria-label="Refresh live economy"
              title="Refresh live economy"
            >
              <RefreshCw className={loading ? "is-spinning" : ""} />
            </button>
          </div>

          <div className="economy-btc-card">
            <Bitcoin />
            <div>
              <span className="economy-metric-label">BTC / USD</span>
              <strong>{market?.btcUsd ? `$${money(market.btcUsd)}` : "SYNCING…"}</strong>
            </div>
            <span className={`economy-live-label ${statusClass}`}>{statusLabel}</span>
          </div>

          <div className="economy-rail-grid">
            <div>
              <span>1 USD</span>
              <strong>ƒ{money(market?.conversion?.usdToFiat, 2)}</strong>
              <small>FIAT required</small>
            </div>
            <div>
              <span>1 USD</span>
              <strong>{money(market?.conversion?.usdToGoldOz, 4)} GOLD</strong>
              <small>in-game only</small>
            </div>
          </div>

          <div className="economy-popover-footer">
            <span>
              <Coins /> BTC multiplier {market?.multiplier ? `${market.multiplier.toFixed(2)}×` : "—"}
            </span>
            <span>{market?.asOf ? `Updated ${new Date(market.asOf).toLocaleTimeString()}` : "Waiting for sync"}</span>
          </div>
        </section>
      )}
    </div>
  );
}

export default EconomyToggle;