/**
 * PABLO POWER & GAS — utility supply-point overlay.
 *
 * One Pablo-owned monopoly, three storefronts: vending machines (batteries),
 * charging stations (batteries + the per-unit charge rate) and gas pumps (fuel
 * + the per-unit gas price). All of them sell the same catalog from
 * /api/utility/catalog and buy through /api/items/buy, so every sale routes
 * back to the utility's revenue ledger.
 *
 * Usage:
 *   <UtilityStation mode="charge" onClose={() => setStation(null)} />  // charging post
 *   <UtilityStation mode="gas"    onClose={() => setStation(null)} />  // gas pump
 *   <PowerGoodsGrid mode="charge" />                                   // embedded (vending POWER tab)
 */

import { useEffect, useState, useCallback } from "react";
import { Loader2, Zap, Fuel, X } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch } from "@/lib/api-client";

export type UtilityMode = "charge" | "gas";

export type VehiclePowerKind = "gas" | "electric" | "manual";
export interface RefuelVehicleInfo {
  id: string;
  label: string;
  power: VehiclePowerKind;
  /** Current gas units in the tank. */
  gas: number;
  /** Tank capacity in gas units. */
  cap: number;
}
export interface RefuelProps {
  /** The vehicle the player is currently driving, if any. */
  vehicleInfo?: RefuelVehicleInfo | null;
  /** Current home cooking-gas supply (units). */
  homeGas?: number;
  /** Home gas supply capacity (units). */
  homeGasCap?: number;
  /** Credit `units` of gas to the active vehicle's tank after a paid refuel. */
  onRefuelVehicle?: (units: number) => void;
  /** Credit `units` of gas to the home supply after a paid refuel. */
  onRefuelHome?: (units: number) => void;
}

interface CompanyInfo {
  id: string;
  ownerOrg: string;
  name: string;
  kana: string;
  tagline: string;
  lore: string;
  strap: string;
}
interface BatterySpec {
  itemId: string;
  name: string;
  tier: "standard" | "high_yield";
  capacity: number;
  priceFiat: number;
  icon: string;
}
interface GasProductSpec {
  itemId: string;
  name: string;
  units: number;
  priceFiat: number;
  icon: string;
}
interface UtilityCatalog {
  company: CompanyInfo;
  batteries: BatterySpec[];
  gasProducts: GasProductSpec[];
  gasUnitPriceFiat: number;
  electricityRateFiatPerUnit: number;
}

interface Good {
  itemId: string;
  name: string;
  priceFiat: number;
  icon: string;
  /** Sub-line — capacity for batteries, unit volume for gas. */
  detail: string;
}

function useUtilityCatalog() {
  const [cat, setCat] = useState<UtilityCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/utility/catalog");
        if (res.ok && alive) setCat((await res.json()) as UtilityCatalog);
      } catch { /* surfaced via empty state */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);
  return { cat, loading };
}

/**
 * The buyable goods grid for a given mode. Reused by the world overlay and by
 * the vending machine's POWER tab.
 */
export function PowerGoodsGrid({ mode }: { mode: UtilityMode }) {
  const { isAuthenticated } = useAuth();
  const { cat, loading } = useUtilityCatalog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const goods: Good[] = !cat
    ? []
    : mode === "charge"
      ? cat.batteries.map((b) => ({
          itemId: b.itemId,
          name: b.name,
          priceFiat: b.priceFiat,
          icon: b.icon,
          detail: `${b.capacity.toLocaleString()} kWh · ${b.tier === "high_yield" ? "HIGH-YIELD" : "STANDARD"}`,
        }))
      : cat.gasProducts.map((g) => ({
          itemId: g.itemId,
          name: g.name,
          priceFiat: g.priceFiat,
          icon: g.icon,
          detail: `${g.units.toLocaleString()} units`,
        }));

  const handleBuy = useCallback(async (g: Good) => {
    if (!isAuthenticated) { showToast("LOGIN REQUIRED", false); return; }
    setBusyId(g.itemId);
    try {
      const res = await apiFetch("/api/items/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId: g.itemId, slot: 0, qty: 1 }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`ACQUIRED · ${g.name.toUpperCase()}`);
      } else if (res.status === 402) {
        showToast("INSUFFICIENT ƒ", false);
      } else {
        showToast(j.error ?? "TRANSACTION FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  }, [isAuthenticated]);

  const rate = mode === "charge"
    ? cat ? `CHARGE RATE · ƒ${cat.electricityRateFiatPerUnit}/kWh` : ""
    : cat ? `GAS · ƒ${cat.gasUnitPriceFiat}/unit` : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] text-cyan-300/70" style={{ fontFamily: "'VT323', monospace" }}>
          ▾ {mode === "charge" ? "POWER CELLS · SPEND ƒ" : "FUEL · SPEND ƒ"}
        </div>
        {rate && (
          <div className="text-[10px] tracking-[0.3em] text-amber-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            {rate}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded border text-[10px] tracking-[0.25em] ${
            toast.ok
              ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
              : "border-red-400/50 bg-red-500/10 text-red-200"
          }`}
          style={{ fontFamily: "'VT323', monospace" }}
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : goods.length === 0 ? (
        <div className="text-cyan-300/60 text-xs tracking-[0.2em] py-10 text-center">OUT OF STOCK</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {goods.map((g) => {
            const busy = busyId === g.itemId;
            return (
              <div
                key={g.itemId}
                className="relative rounded-lg border-2 border-cyan-500/40 bg-cyan-500/[0.06] p-3 transition-all"
                style={{ minHeight: 140 }}
                data-testid={`utility-good-${g.itemId}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 flex items-center justify-center text-lg rounded bg-black/40 border border-cyan-400/40">
                    {g.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-cyan-100 text-xs font-bold tracking-widest truncate">{g.name}</div>
                    <div className="text-[8px] text-cyan-300/60 tracking-[0.2em]">{g.detail}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-3">
                  <div className="text-[11px] text-amber-300 tracking-[0.15em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    ƒ{g.priceFiat.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleBuy(g)}
                    className="px-2 py-1 rounded border text-[9px] tracking-[0.2em] border-cyan-400/50 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                    data-testid={`utility-buy-${g.itemId}`}
                  >
                    {busy ? "…" : "BUY"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A simple unit meter bar (current / capacity). */
function MeterBar({ value, max, hue }: { value: number; max: number; hue: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="h-2 w-full rounded bg-black/50 border border-white/10 overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${pct * 100}%`, background: hue }} />
    </div>
  );
}

/**
 * Refueling panel for the GAS PUMP. Charges FIAT at the utility's per-unit gas
 * price via /api/utility/refuel (which books the sale to the monopoly), then
 * credits the client-side meter through the provided callbacks. Electric and
 * pedal vehicles are clearly distinguished — they take no gas here.
 */
function RefuelSection({
  refuel,
  gasUnitPrice,
}: {
  refuel: RefuelProps;
  gasUnitPrice: number;
}) {
  const { isAuthenticated } = useAuth();
  const { vehicleInfo, homeGas = 0, homeGasCap = 100, onRefuelVehicle, onRefuelHome } = refuel;
  const [busy, setBusy] = useState<"vehicle" | "home" | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const doRefuel = useCallback(
    async (target: "vehicle" | "home", units: number, label: string) => {
      if (!isAuthenticated) { showToast("LOGIN REQUIRED", false); return; }
      if (units <= 0) { showToast("TANK ALREADY FULL", false); return; }
      setBusy(target);
      try {
        const res = await apiFetch("/api/utility/refuel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ units, target, label }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok) {
          const got = Number(j.units) || units;
          if (target === "vehicle") onRefuelVehicle?.(got);
          else onRefuelHome?.(got);
          showToast(`REFUELED · +${got} UNITS · ƒ${(Number(j.spentFiat) || units * gasUnitPrice).toLocaleString()}`);
        } else if (res.status === 402) {
          showToast(`INSUFFICIENT ƒ · NEED ƒ${(Number(j.required) || units * gasUnitPrice).toLocaleString()}`, false);
        } else {
          showToast(j.error ?? "REFUEL FAILED", false);
        }
      } catch {
        showToast("NETWORK ERROR", false);
      }
      setBusy(null);
    },
    [isAuthenticated, gasUnitPrice, onRefuelVehicle, onRefuelHome],
  );

  const fillUnits = vehicleInfo ? Math.ceil(vehicleInfo.cap - vehicleInfo.gas) : 0;
  const homeBuyUnits = Math.max(0, Math.min(20, homeGasCap - homeGas));

  return (
    <div className="mb-5 rounded-lg border-2 border-amber-500/40 bg-amber-500/[0.05] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] text-amber-300/80" style={{ fontFamily: "'VT323', monospace" }}>
          ▾ REFUEL · SPEND ƒ
        </div>
        <div className="text-[10px] tracking-[0.3em] text-amber-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          ƒ{gasUnitPrice}/unit
        </div>
      </div>

      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded border text-[10px] tracking-[0.25em] ${
            toast.ok
              ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
              : "border-red-400/50 bg-red-500/10 text-red-200"
          }`}
          style={{ fontFamily: "'VT323', monospace" }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Vehicle tank ── */}
      <div className="mb-4">
        {!vehicleInfo ? (
          <div className="text-amber-200/60 text-[11px] tracking-[0.15em] py-2">
            ⛽ NO VEHICLE — enter a gas vehicle to fill its tank.
          </div>
        ) : vehicleInfo.power === "electric" ? (
          <div className="rounded border border-sky-400/40 bg-sky-500/[0.07] px-3 py-2.5" data-testid="refuel-electric-notice">
            <div className="text-sky-200 text-[11px] tracking-[0.2em] font-bold">⚡ {vehicleInfo.label} · ELECTRIC</div>
            <div className="text-sky-300/70 text-[10px] tracking-[0.1em] mt-0.5">
              Runs on BATTERIES — no gas needed. Charge at a CHARGING STATION.
            </div>
          </div>
        ) : vehicleInfo.power === "manual" ? (
          <div className="rounded border border-emerald-400/40 bg-emerald-500/[0.07] px-3 py-2.5">
            <div className="text-emerald-200 text-[11px] tracking-[0.2em] font-bold">🚲 {vehicleInfo.label} · PEDAL</div>
            <div className="text-emerald-300/70 text-[10px] tracking-[0.1em] mt-0.5">
              Human powered — takes no fuel.
            </div>
          </div>
        ) : (
          <div data-testid="refuel-vehicle">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-amber-100 text-[11px] tracking-[0.2em] font-bold">⛽ {vehicleInfo.label} · GAS</div>
              <div className="text-amber-300/80 text-[10px] tracking-[0.15em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {Math.floor(vehicleInfo.gas)} / {vehicleInfo.cap} u
              </div>
            </div>
            <MeterBar value={vehicleInfo.gas} max={vehicleInfo.cap} hue="linear-gradient(90deg,#f59e0b,#fbbf24)" />
            <button
              type="button"
              disabled={busy === "vehicle" || fillUnits <= 0}
              onClick={() => doRefuel("vehicle", fillUnits, vehicleInfo.label)}
              className="mt-2.5 w-full px-3 py-2 rounded border text-[10px] tracking-[0.25em] border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
              data-testid="refuel-vehicle-btn"
            >
              {busy === "vehicle"
                ? "FILLING…"
                : fillUnits <= 0
                  ? "TANK FULL"
                  : `FILL TANK · +${fillUnits}u · ƒ${(fillUnits * gasUnitPrice).toLocaleString()}`}
            </button>
          </div>
        )}
      </div>

      {/* ── Home cooking-gas supply ── */}
      <div className="pt-3 border-t border-amber-500/15" data-testid="refuel-home">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-amber-100 text-[11px] tracking-[0.2em] font-bold">🍳 HOME GAS SUPPLY</div>
          <div className="text-amber-300/80 text-[10px] tracking-[0.15em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            {Math.floor(homeGas)} / {homeGasCap} u
          </div>
        </div>
        <MeterBar value={homeGas} max={homeGasCap} hue="linear-gradient(90deg,#fb923c,#f97316)" />
        <button
          type="button"
          disabled={busy === "home" || homeBuyUnits <= 0}
          onClick={() => doRefuel("home", homeBuyUnits, "home supply")}
          className="mt-2.5 w-full px-3 py-2 rounded border text-[10px] tracking-[0.25em] border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
          data-testid="refuel-home-btn"
        >
          {busy === "home"
            ? "FILLING…"
            : homeBuyUnits <= 0
              ? "SUPPLY FULL"
              : `BUY GAS · +${homeBuyUnits}u · ƒ${(homeBuyUnits * gasUnitPrice).toLocaleString()}`}
        </button>
        <div className="text-amber-200/50 text-[9px] tracking-[0.1em] mt-1.5">
          Home gas powers your stove — cook food at home to restore stamina.
        </div>
      </div>
    </div>
  );
}

/** Full-screen world overlay for a charging station or gas pump. */
export default function UtilityStation({ mode, onClose, refuel }: { mode: UtilityMode; onClose: () => void; refuel?: RefuelProps }) {
  const { cat } = useUtilityCatalog();
  const company = cat?.company;
  const Icon = mode === "charge" ? Zap : Fuel;
  const title = mode === "charge" ? "CHARGING STATION" : "GAS PUMP";
  const kana = mode === "charge" ? "充電所" : "ガソリンスタンド";

  return (
    <div className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="relative w-full max-w-3xl rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-b from-cyan-950/30 to-black overflow-hidden"
           style={{ boxShadow: "0 0 40px rgba(34,211,238,0.25)" }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-400/40">
              <Icon className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="text-cyan-200 text-sm tracking-[0.3em] truncate" style={{ fontFamily: "'VT323', monospace" }}>
                {title} <span className="text-red-400/70 text-[10px]">{kana}</span>
              </div>
              <div className="text-[9px] text-cyan-300/60 tracking-[0.3em] truncate">
                {company?.name ?? "PABLO POWER & GAS"} · {company?.kana ?? "電力・ガス公社"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-cyan-200/70 hover:text-white flex items-center gap-1 text-[10px] tracking-[0.3em]"
            data-testid="utility-close"
          >
            <X className="w-3.5 h-3.5" /> CLOSE
          </button>
        </div>

        {/* Branding / lore */}
        {company && (
          <div className="px-4 sm:px-6 py-3 border-b border-cyan-500/10 bg-black/40">
            <div className="text-cyan-300/90 text-[11px] italic tracking-wide mb-1">"{company.tagline}"</div>
            <div className="text-cyan-200/60 text-[10px] leading-snug">{company.lore}</div>
          </div>
        )}

        {/* Goods */}
        <div className="px-4 sm:px-6 py-5">
          {mode === "gas" && refuel && (
            <RefuelSection refuel={refuel} gasUnitPrice={cat?.gasUnitPriceFiat ?? 35} />
          )}
          <PowerGoodsGrid mode={mode} />
        </div>
      </div>
    </div>
  );
}
