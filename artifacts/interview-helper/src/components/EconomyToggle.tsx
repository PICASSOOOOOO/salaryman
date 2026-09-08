import { useEffect, useState } from "react";
import { Activity, ArrowRightLeft, Bitcoin, Building2, ChevronLeft, Coins, Landmark, RefreshCw, WalletCards } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { STREAMER_MASK } from "@/lib/streamer-mode";
import { useStreamerMode } from "@/hooks/use-streamer-mode";
import { useOrg } from "@/hooks/use-org";
import { useLocation } from "wouter";

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

type WalletSnapshot = {
  bank?: {
    accounts?: Array<{ kind?: string; label?: string; balance?: number; currency?: string }>;
    activeUsd?: number;
    fiatTotal?: number;
    earnedFiat?: number;
  };
  gold?: number;
  property?: { businesses?: unknown[] };
};

type OrgAccountsSnapshot = {
  orgId: number;
  orgName: string;
  accounts: Array<{ type: string; label: string; balanceFiat: number }>;
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
export function EconomyToggle({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [market, setMarket] = useState<MarketIndex | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [orgAccounts, setOrgAccounts] = useState<OrgAccountsSnapshot | null>(null);
  const [orgFinanceRestricted, setOrgFinanceRestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const streamerMode = useStreamerMode();
  const { org } = useOrg();
  const [, navigate] = useLocation();

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

  useEffect(() => {
    if (!isAuthenticated) {
      setWallet(null);
      return;
    }
    let alive = true;
    const loadWallet = async () => {
      try {
        const response = await apiFetch("/api/wallet/snapshot", { credentials: "include" });
        if (!response.ok) return;
        const next = (await response.json()) as WalletSnapshot;
        if (alive) setWallet(next);
      } catch {
        if (alive) setWallet(null);
      }
    };
    void loadWallet();
    const interval = window.setInterval(() => void loadWallet(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !org?.id) {
      setOrgAccounts(null);
      setOrgFinanceRestricted(false);
      return;
    }
    let alive = true;
    const loadOrgAccounts = async () => {
      try {
        const response = await apiFetch(`/api/orgs/${org.id}/accounts`, { credentials: "include" });
        if (!response.ok) {
          if (alive) {
            setOrgAccounts(null);
            setOrgFinanceRestricted(response.status === 403);
          }
          return;
        }
        const next = (await response.json()) as OrgAccountsSnapshot;
        if (alive) {
          setOrgAccounts(next);
          setOrgFinanceRestricted(false);
        }
      } catch {
        if (alive) setOrgAccounts(null);
      }
    };
    void loadOrgAccounts();
    const interval = window.setInterval(() => void loadOrgAccounts(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated, org?.id]);

  const status = market?.status ?? (loading ? "syncing" : "offline");
  const isLive = status === "live";
  const statusLabel = status.toUpperCase();
  const statusClass = isLive ? "is-live" : status === "stale" ? "is-stale" : "is-offline";
  const personalNetWorthFiat = wallet?.bank?.fiatTotal;
  const availableFiat = wallet?.bank?.earnedFiat ?? wallet?.bank?.fiatTotal;
  const orgChecking = orgAccounts?.accounts.find((account) => account.type === "checking")?.balanceFiat;
  const orgSavings = orgAccounts?.accounts.find((account) => account.type === "savings")?.balanceFiat;
  const orgNetWorthFiat = orgAccounts?.accounts.reduce((total, account) => total + (account.balanceFiat || 0), 0);

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
        title="Show finances and live economy reference"
      >
        <span className={`economy-status-dot ${statusClass}`} />
        <Activity className="economy-toggle-icon" />
        <span>ECONOMY</span>
        <ChevronLeft className={`economy-toggle-chevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <section id="salaryman-economy-disclosure" className="economy-popover" aria-label="Finances and live economy reference">
          <div className="economy-popover-heading">
            <div>
              <p className="economy-popover-kicker">FINANCES + ECONOMY</p>
              <p className="economy-popover-note">Your balances are separate from market facts.</p>
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

          <div className="economy-section">
            <div className="economy-section-heading">
              <span>FINANCES</span>
              <small>YOUR BALANCES</small>
            </div>
            <div className="economy-account-grid">
              <div className="economy-account-card economy-account-usd">
                <WalletCards />
                <span>ACTIVE USD</span>
                <strong>{streamerMode ? STREAMER_MASK : `$${money(wallet?.bank?.activeUsd, 2)}`}</strong>
                <small>Stripe-withdrawable balance</small>
              </div>
              <div className="economy-account-card">
                <Coins />
                <span>AVAILABLE FIAT</span>
                <strong>ƒ{money(availableFiat, 0)}</strong>
                <small>Spendable personal funds</small>
              </div>
              <div className="economy-account-card">
                <Coins />
                <span>GOLD SAVINGS</span>
                <strong>{money(wallet?.gold, 1)}</strong>
                <small>Property and major purchases</small>
              </div>
              <div className="economy-account-card economy-account-property">
                <Building2 />
                <span>NET WORTH</span>
                <strong>ƒ{money(personalNetWorthFiat, 0)}</strong>
                <small>All personal FIAT accounts</small>
              </div>
            </div>
          </div>

          {org && (
            <div className="economy-section economy-reference-section">
              <div className="economy-section-heading">
                <span>ORGANIZATION</span>
                <small>{orgAccounts?.orgName || org.name}</small>
              </div>
              {orgFinanceRestricted ? (
                <div className="economy-org-restricted">Organization balances require finance access.</div>
              ) : (
                <div className="economy-org-grid">
                  <div>
                    <Landmark />
                    <span>CHECKING</span>
                    <strong>ƒ{money(orgChecking, 0)}</strong>
                  </div>
                  <div>
                    <Coins />
                    <span>SAVINGS</span>
                    <strong>ƒ{money(orgSavings, 0)}</strong>
                  </div>
                  <div>
                    <Building2 />
                    <span>ORG NET WORTH</span>
                    <strong>ƒ{money(orgNetWorthFiat, 0)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="economy-section economy-reference-section">
            <div className="economy-section-heading">
              <span>ECONOMY</span>
              <small>LIVE REFERENCE</small>
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
               <small>GOLD reference rate</small>
            </div>
          </div>

          {isAuthenticated && (
            <button
              type="button"
              className="economy-transfer-button"
              onClick={() => {
                setOpen(false);
                navigate("/game/economy");
              }}
            >
              <ArrowRightLeft />
              TRANSFER FIAT ↔ GOLD
            </button>
          )}

          <div className="economy-popover-footer">
            <span>
              <Coins /> BTC multiplier {market?.multiplier ? `${market.multiplier.toFixed(2)}×` : "—"}
            </span>
            <span>{market?.asOf ? `Updated ${new Date(market.asOf).toLocaleTimeString()}` : "Waiting for sync"}</span>
          </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default EconomyToggle;