/**
 * Unified SALARYMAN vending machine.
 *
 * One pixel/cyberpunk machine for working FLORIN-only (ƒ) supplies.
 * Real-money goods (bots/Pixel Agents, subscriptions, pledges) live exclusively
 * in the Pledge Store (/pledge) — this machine never touches USD/Stripe.
 *
 * Usage:
 *   <Route path="/vending"><VendingMachine /></Route>
 *   <VendingMachine onClose={() => setOverlay(false)} />   // in-world overlay
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import { VEND_FOOD_ITEMS, parseFoodEffect, type VendFoodItem } from "@/lib/vending-food";
import { PowerGoodsGrid } from "./UtilityStation";

type TabId = "work" | "fitout";

interface VendingMachineProps {
  onClose?: () => void;
  /** Optional override of the default landing tab. */
  initialTab?: TabId;
}
const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "work", label: "WORK GEAR", sub: "安全" },
  { id: "fitout", label: "FLOOR FIT-OUT", sub: "BUILD" },
];

export default function VendingMachine({ onClose, initialTab = "work" }: VendingMachineProps) {
  const [, navigate] = useLocation();
  const machineUrl = useArtAsset("vending_machine_iso", 4000, { retryOnFail: true });
  const [tab, setTab] = useState<TabId>(initialTab);
  const fromOffice =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("from") === "office";

  // Supplies are an in-building service. The outside city is deliberately
  // locked while the tower/office experience is being mastered.
  const exitLabel = "OFFICE";
  const exitTo = "/office";
  const exit = () => (onClose ? onClose() : navigate(exitTo));

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative overflow-hidden">
      {/* Pink floor reflection (carry over the BotVendingMachine look) */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{ background: "linear-gradient(0deg, rgba(236,72,153,0.18) 0%, transparent 100%)" }}
      />

      <header className="relative px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={exit}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0"
          data-testid="vending-back"
        >
          <ArrowLeft className="w-3 h-3" /> {onClose ? "CLOSE" : exitLabel}
        </button>
        <div className="text-pink-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center" style={{ fontFamily: "var(--font-sans)" }}>
          ▌ VendKing <span className="text-red-400">自販機</span> ▌
        </div>
        <div className="shrink-0 w-[1px]" aria-hidden />
      </header>

      {/* Tab bar */}
      <div className="relative px-4 sm:px-6 mt-2 flex gap-1.5 border-b border-pink-500/20 overflow-x-auto scrollbar-hide">
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-testid={`vending-tab-${t.id}`}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 -mb-px border-b-2 text-[10px] tracking-[0.3em] transition-colors ${
                active
                  ? "border-pink-400 text-pink-200 bg-pink-500/10"
                  : "border-transparent text-pink-200/40 hover:text-pink-200/80"
              }`}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {t.label}
              <span className="ml-1 text-red-400/70 text-[8px] tracking-[0.2em]">{t.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mx-4 mt-3 sm:mx-6 flex flex-col gap-2 rounded border border-cyan-400/30 bg-cyan-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-cyan-100">Looking for property? Realty handles working office rentals and purchases.</span>
        <button
          type="button"
          onClick={() => navigate(fromOffice ? "/store/realty?from=office" : "/store/realty")}
          className="flex shrink-0 items-center justify-center gap-2 rounded border border-cyan-400/50 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-cyan-100 hover:bg-cyan-500/15"
          data-testid="vending-open-realty"
        >
          PROPERTY <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="relative px-4 sm:px-8 py-5 grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* The machine itself — the same iso art the bot version uses */}
        <div
          className="relative mx-auto w-full max-w-xs aspect-[3/4] rounded-2xl border-2 border-pink-500/50 overflow-hidden bg-gradient-to-b from-pink-950/40 to-black"
          style={{ boxShadow: "0 0 32px rgba(236,72,153,0.4), inset 0 0 32px rgba(0,0,0,0.6)" }}
        >
          {machineUrl ? (
            <img src={machineUrl} alt="VendKing" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-pink-500/60 text-xs tracking-[0.4em]">
              ▌ COMPOSING ▌
            </div>
          )}
          <div
            className="absolute bottom-0 inset-x-0 px-3 py-2 bg-black/85 border-t-2 border-cyan-400/60 text-cyan-200 text-[10px] text-center tracking-[0.25em]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            ▾ INSERT FLORINS · CHOOSE A SLOT
          </div>
        </div>

        {/* Active tab pane */}
        <div className="min-w-0">
          {tab === "work" && <WorkGearTab />}
          {tab === "fitout" && <TowerFitoutTab />}
        </div>
      </div>
    </div>
  );
}

type TowerFitoutUpgrade = "secure_access" | "extra_desk" | "extra_terminal";
type TowerFloorState = {
  id: number;
  city: string;
  floorNumber: number;
  archetype: string;
  officeCount: number;
  upgrades: string[];
};
type TowerUnitState = { unitNumber: number; status: string };

function TowerFitoutTab() {
  const { isAuthenticated } = useAuth();
  const [floor, setFloor] = useState<TowerFloorState | null>(null);
  const [units, setUnits] = useState<TowerUnitState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setFloor(null);
      setNotice("SIGN IN TO MANAGE FLOOR FIT-OUTS");
      return;
    }
    const current = await apiFetch("/api/shadow-tower/floors/current", { credentials: "include" });
    if (!current.ok) {
      setFloor(null);
      setUnits([]);
      setNotice("ACQUIRE A SHADOW TOWER FLOOR FIRST");
      return;
    }
    const body = await current.json();
    if (!body.canManage || !body.floor) {
      setFloor(null);
      setUnits([]);
      setNotice("FLOOR OWNER OR ORG SETTINGS ACCESS REQUIRED");
      return;
    }
    setFloor(body.floor);
    const unitResponse = await apiFetch(`/api/shadow-tower/floors/${body.floor.city}/${body.floor.floorNumber}/units`, { credentials: "include" });
    if (unitResponse.ok) setUnits((await unitResponse.json()).units ?? []);
    setNotice("");
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const purchaseUpgrade = async (upgrade: TowerFitoutUpgrade) => {
    if (!floor || busy) return;
    setBusy(upgrade);
    const response = await apiFetch(`/api/shadow-tower/floors/${floor.id}/upgrades`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upgrade, requestId: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => ({}));
    setNotice(response.ok ? `${upgrade.replaceAll("_", " ").toUpperCase()} INSTALLED IN THE FLOOR PLAN` : (body.error ?? "FIT-OUT PURCHASE FAILED"));
    if (response.ok) await load();
    setBusy(null);
  };

  const expandSuite = async (unitNumber: number) => {
    if (!floor || busy) return;
    setBusy(`suite-${unitNumber}`);
    const response = await apiFetch(`/api/shadow-tower/floors/${floor.id}/units/${unitNumber}/expand`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => ({}));
    setNotice(response.ok ? `SUITE ${unitNumber} PURCHASED · FLOOR PLAN EXPANDED` : (body.error ?? "SUITE PURCHASE FAILED"));
    if (response.ok) await load();
    setBusy(null);
  };

  if (!floor) {
    return <div className="border border-amber-300/25 bg-amber-300/5 p-4 text-sm text-amber-100">
      <strong className="tracking-[.2em]">FLOOR FIT-OUT</strong>
      <p className="mt-2 text-xs text-zinc-400">{notice || "ACQUIRE A FLOOR TO OPEN THE FIT-OUT CATALOG."}</p>
      <button type="button" onClick={() => window.location.assign(`${import.meta.env.BASE_URL}store/realty`)} className="mt-3 border border-cyan-300/40 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-100">OPEN REALTY</button>
    </div>;
  }

  const nextSuite = floor.officeCount < 4
    ? units.find((unit) => unit.unitNumber === floor.officeCount + 1) ?? { unitNumber: floor.officeCount + 1, status: "under_construction" }
    : undefined;
  const deskCount = floor.upgrades.filter((upgrade) => /^extra_desk(?:_[2-4])?$/.test(upgrade)).length;
  const terminalCount = floor.upgrades.filter((upgrade) => /^extra_terminal(?:_[2-4])?$/.test(upgrade)).length;
  const nextDesk = deskCount < 4 ? `extra_desk${deskCount ? `_${deskCount + 1}` : ""}` as TowerFitoutUpgrade : null;
  const nextTerminal = terminalCount < 4 ? `extra_terminal${terminalCount ? `_${terminalCount + 1}` : ""}` as TowerFitoutUpgrade : null;
  const upgradeCards = [
    !floor.upgrades.includes("secure_access") ? { key: "secure_access" as const, title: "SECURE ACCESS", detail: "Upgrade the floor entry lock." } : null,
    nextDesk ? { key: nextDesk, title: `ADDITIONAL DESK ${deskCount + 1}`, detail: "Adds one server-planned workstation." } : null,
    nextTerminal ? { key: nextTerminal, title: `ADDITIONAL TERMINAL ${terminalCount + 1}`, detail: "Adds one connected terminal." } : null,
  ].filter(Boolean) as Array<{ key: TowerFitoutUpgrade; title: string; detail: string }>;

  return <div>
    <div className="mb-3 border border-cyan-400/25 bg-cyan-400/5 p-3">
      <div className="text-xs font-bold tracking-[.18em] text-cyan-100">FLOOR {floor.floorNumber} · {floor.city.replace("_", " ").toUpperCase()}</div>
      <p className="mt-1 text-[10px] text-zinc-500">Suite 1 starts as the founder&apos;s furnished executive office. Every suite, desk, and terminal below is a separate server-priced purchase.</p>
    </div>
    {notice && <div className="mb-3 border border-cyan-400/30 bg-cyan-400/5 p-2 text-[10px] tracking-widest text-cyan-100">{notice}</div>}
    <div className="grid gap-2 sm:grid-cols-2">
      {upgradeCards.map((item) => <article key={item.key} className="border border-white/10 bg-white/[.03] p-3">
        <strong className="text-sm text-pink-100">{item.title}</strong>
        <p className="mt-1 text-[11px] text-zinc-500">{item.detail} Price and settlement are checked by the server.</p>
        <button type="button" disabled={busy != null} onClick={() => void purchaseUpgrade(item.key)} className="mt-3 w-full border border-pink-400/40 py-2 text-[10px] font-bold tracking-widest text-pink-100 disabled:opacity-40">{busy === item.key ? "SETTLING…" : "BUY FROM VENDKING"}</button>
      </article>)}
      {nextSuite && <article className="border border-amber-300/25 bg-amber-300/5 p-3">
        <strong className="text-sm text-amber-100">EXECUTIVE SUITE {nextSuite.unitNumber}</strong>
        <p className="mt-1 text-[11px] text-zinc-500">Unlocks the next physical office address. It appears in the shared hallway plan after settlement.</p>
        <button type="button" disabled={busy != null} onClick={() => void expandSuite(nextSuite.unitNumber)} className="mt-3 w-full border border-amber-300/40 py-2 text-[10px] font-bold tracking-widest text-amber-100 disabled:opacity-40">{busy === `suite-${nextSuite.unitNumber}` ? "SETTLING…" : "BUY SUITE FROM VENDKING"}</button>
      </article>}
    </div>
    {!upgradeCards.length && !nextSuite && <p className="border border-dashed border-white/10 p-4 text-center text-[10px] tracking-widest text-zinc-500">ALL AVAILABLE FIT-OUT INVENTORY INSTALLED</p>}
  </div>;
}

interface WorkItem {
  id: string; name: string; blurb: string; type: string; icon: string; priceFiat: number;
  consumable?: boolean;
  useEffect?: { stamina?: number; workIncomePct?: number; workIncomeUses?: number; skillGrant?: string };
}

function activeSlot(): number {
  try { return parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0; } catch { return 0; }
}

function WorkGearTab() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const slot = activeSlot();

  const load = useCallback(async () => {
    const requests: Promise<Response>[] = [apiFetch("/api/items/vending-catalog")];
    if (isAuthenticated) requests.push(apiFetch(`/api/items/inventory?slot=${slot}`));
    const [catalogRes, inventoryRes] = await Promise.all(requests);
    if (catalogRes.ok) setItems((await catalogRes.json()).items ?? []);
    if (inventoryRes?.ok) {
      const rows = (await inventoryRes.json()).rows ?? [];
      setQuantities(Object.fromEntries(rows.map((row: { itemId: string; quantity: number }) => [row.itemId, row.quantity])));
    }
  }, [isAuthenticated, slot]);

  useEffect(() => { void load(); }, [load]);

  const buy = async (item: WorkItem) => {
    if (!isAuthenticated) { setNotice("SIGN IN TO BUY"); return; }
    setBusy(item.id);
    const res = await apiFetch("/api/items/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, slot, source: "tower_vending" }),
    });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok ? `${item.name.toUpperCase()} ADDED TO INVENTORY` : (data.error ?? "PURCHASE FAILED"));
    if (res.ok) await load();
    setBusy(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-[.2em] text-cyan-100"><ShieldCheck className="h-4 w-4" /> TOWER WORK SUPPLIES</div>
          <p className="mt-1 text-[11px] text-zinc-500">Six useful supplies. Every purchase changes stamina, work income, or protection.</p>
        </div>
        <button onClick={() => window.location.assign(`${import.meta.env.BASE_URL}armory/inventory`)} className="border border-cyan-400/40 px-3 py-2 text-[10px] font-bold tracking-[.15em] text-cyan-100">INVENTORY</button>
      </div>
      {notice && <div className="mb-3 border border-cyan-400/30 bg-cyan-400/5 p-2 text-[10px] tracking-widest text-cyan-100">{notice}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="flex items-center gap-3 rounded border border-white/10 bg-white/[.03] p-3">
            <span className="text-2xl">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <strong className="text-sm text-zinc-100">{item.name}</strong>
              <p className="text-[11px] text-zinc-500">{item.blurb}</p>
            </div>
            <div className="text-right">
              {item.useEffect?.stamina && <div className="mb-1 text-[9px] font-bold text-amber-300">+{item.useEffect.stamina} STAMINA</div>}
              {item.useEffect?.workIncomePct && <div className="mb-1 text-[9px] font-bold text-emerald-300">+{item.useEffect.workIncomePct}% × {item.useEffect.workIncomeUses} JOBS</div>}
              {(quantities[item.id] ?? 0) > 0 && <div className="mb-1 text-[9px] text-zinc-500">HELD ×{quantities[item.id]}</div>}
              <button disabled={busy === item.id} onClick={() => void buy(item)} className="rounded border border-pink-400/40 px-2 py-1.5 text-[10px] font-bold text-pink-100 disabled:border-white/10 disabled:text-zinc-600">
                {busy === item.id ? "…" : `ƒ${item.priceFiat.toLocaleString()}`}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
// ───────────────────────────── FOOD TAB ─────────────────────────────────────
// PABLO FRESH food & drink. Prices come from the shared display catalog, while
// the server resolves the authoritative price and commits wallet debit + effect
// in one transaction.

interface SalarymanSave {
  slotIndex: number;
  charName: string;
  charClass: string;
  level: number;
  salary: number;
  lastZone: string;
  playtime: number;
  data: Record<string, unknown>;
  lastSavedAt?: string;
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function FoodTab() {
  const { isAuthenticated } = useAuth();
  const [save, setSave] = useState<SalarymanSave | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [saveRes, bankRes] = await Promise.all([
        apiFetch("/api/salaryman/saves", { credentials: "include" }),
        apiFetch("/api/cosmetics/balance", { credentials: "include" }),
      ]);
      if (saveRes.ok) {
        const j = await saveRes.json();
        const saves: SalarymanSave[] = j.saves ?? [];
        if (saves.length > 0) {
          const sorted = [...saves].sort(
            (a, b) => new Date(b.lastSavedAt ?? 0).getTime() - new Date(a.lastSavedAt ?? 0).getTime(),
          );
          setSave(sorted[0]);
        }
      }
      if (bankRes.ok) {
        const bank = await bankRes.json();
        setBalance(num(bank.spendable, num(bank.balance)));
      }
    } catch { /* surfaced via toast on action */ }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const handleBuy = async (item: VendFoodItem) => {
    if (!isAuthenticated) { showToast("LOGIN REQUIRED", false); return; }
    if (!save) { showToast("NO CHARACTER — CREATE ONE FIRST", false); return; }
    if (balance < item.price) { showToast("INSUFFICIENT FIAT", false); return; }

    setBusyId(item.id);

    const fx = parseFoodEffect(item.effect);
    try {
      const res = await apiFetch("/api/vending/food/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId: item.id, slotIndex: save.slotIndex, requestId: crypto.randomUUID() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        if (j.data && typeof j.data === "object") setSave((prior) => prior ? { ...prior, data: j.data } : prior);
        if (typeof j.spendable === "number") setBalance(j.spendable);
        else if (typeof j.newBalance === "number") setBalance(j.newBalance);
        const energyGain = fx.energy > 0 ? ` · STAMINA +${fx.energy}` : "";
        showToast(`${item.name} CONSUMED${energyGain}`);
      } else if (res.status === 401) {
        showToast("LOGIN REQUIRED", false);
      } else {
        showToast(j.error ?? "TRANSACTION FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  };

  const energyNow = save ? Math.floor(num(save.data.energy, 100)) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="text-[10px] tracking-[0.4em] text-pink-300/70" style={{ fontFamily: "var(--font-sans)" }}>
          ▾ PABLO FRESH · EAT TO RESTORE STAMINA
        </div>
        <div className="flex items-center gap-3">
          {energyNow != null && (
            <div className="flex items-center gap-1 text-[10px] tracking-[0.3em] text-cyan-300" title="Your current stamina">
              <Zap className="w-3 h-3" /> STAMINA {energyNow}/100
            </div>
          )}
          <div className="text-[10px] tracking-[0.3em] text-amber-300" style={{ fontFamily: "var(--font-sans)" }}>
            BAL · ƒ{balance.toLocaleString()}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded border text-[10px] tracking-[0.25em] ${
            toast.ok
              ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
              : "border-red-400/50 bg-red-500/10 text-red-200"
          }`}
          style={{ fontFamily: "var(--font-sans)" }}
          data-testid="food-toast"
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-pink-400" /></div>
      ) : !isAuthenticated ? (
        <div className="text-pink-300/60 text-xs tracking-[0.2em] py-10 text-center">LOGIN TO BUY FOOD</div>
      ) : !save ? (
        <div className="text-pink-300/60 text-xs tracking-[0.2em] py-10 text-center">CREATE A CHARACTER TO BUY FOOD</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {VEND_FOOD_ITEMS.map(item => {
            const fx = parseFoodEffect(item.effect);
            const canAfford = balance >= item.price;
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="relative rounded-lg border-2 p-3 transition-all flex flex-col"
                style={{
                  borderColor: fx.energy > 0 ? "rgba(56,189,248,.45)" : "rgba(236,72,153,.4)",
                  background: fx.energy > 0 ? "rgba(56,189,248,.06)" : "rgba(236,72,153,.06)",
                  minHeight: 150,
                }}
                data-testid={`food-${item.id}`}
              >
                <div className="text-cyan-100 text-xs font-bold tracking-widest mb-1 truncate" style={{ fontFamily: "var(--font-sans)" }}>
                  {item.name}
                </div>
                {fx.energy > 0 && (
                  <div className="inline-flex items-center gap-1 self-start mb-1.5 px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-[8px] tracking-[0.2em]">
                    <Zap className="w-2.5 h-2.5" /> STAMINA +{fx.energy}
                  </div>
                )}
                <div className="text-[10px] text-pink-200/70 leading-snug mb-2 line-clamp-3 flex-1">{item.desc}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-amber-300 tracking-[0.15em]" style={{ fontFamily: "var(--font-sans)" }}>
                    ƒ{item.price.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    disabled={busy || !canAfford}
                    onClick={() => handleBuy(item)}
                    data-testid={`food-buy-${item.id}`}
                    className={`px-2 py-1 rounded border text-[9px] tracking-[0.2em] ${
                      canAfford
                        ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"
                        : "border-zinc-700 bg-zinc-900/60 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    {busy ? "…" : canAfford ? "BUY" : "LOW ƒ"}
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
// ─────────────────────────── COSMETICS TAB ──────────────────────────────────
// Ported from pages/CosmeticStore.tsx (catalog + balance + inventory + buy/equip).

interface CosmeticItem {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCrypto: number;
  rarity: string;
  colorHex?: string;
  iconEmoji?: string;
}
interface PlayerCosmetic { cosmeticId: string; equipped: boolean }

const RARITY_COLOR: Record<string, string> = {
  common: "#aaaaaa",
  uncommon: "#55cc44",
  rare: "#4488ff",
  epic: "#cc44ff",
  legendary: "#ffaa00",
};

function CosmeticsTab() {
  const { isAuthenticated } = useAuth();
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [inventory, setInventory] = useState<PlayerCosmetic[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        apiFetch("/api/cosmetics/catalog"),
        isAuthenticated ? apiFetch("/api/cosmetics/balance", { credentials: "include" }) : Promise.resolve(null),
      ]);
      if (cRes.ok) setCatalog((await cRes.json()).items ?? []);
      if (bRes?.ok) setBalance((await bRes.json()).balance ?? 0);
      if (isAuthenticated) {
        const invRes = await apiFetch("/api/cosmetics/inventory", { credentials: "include" });
        if (invRes.ok) setInventory((await invRes.json()).inventory ?? []);
      }
    } catch { /* swallow — surface via toast on action */ }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const ownedSet = new Set(inventory.map(i => i.cosmeticId));
  const equippedSet = new Set(inventory.filter(i => i.equipped).map(i => i.cosmeticId));

  const handleBuy = async (item: CosmeticItem) => {
    if (!isAuthenticated) { showToast("LOGIN REQUIRED", false); return; }
    setBusyId(item.id);
    try {
      const res = await apiFetch("/api/cosmetics/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cosmeticId: item.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof j.spendable === "number") setBalance(j.spendable);
        else if (typeof j.newBalance === "number") setBalance(j.newBalance);
        setInventory(prev => [...prev, { cosmeticId: item.id, equipped: false }]);
        showToast(`ACQUIRED · ${item.name.toUpperCase()}`);
      } else if (res.status === 402) {
        showToast("INSUFFICIENT FIAT", false);
      } else if (res.status === 409) {
        showToast("ALREADY OWNED", false);
      } else {
        showToast(j.error ?? "TRANSACTION FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  };

  const handleEquip = async (item: CosmeticItem, currentlyEquipped: boolean) => {
    if (!isAuthenticated) return;
    setBusyId(item.id);
    try {
      const res = await apiFetch("/api/cosmetics/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cosmeticId: item.id, equipped: !currentlyEquipped }),
      });
      if (res.ok) {
        const newEquipped = !currentlyEquipped;
        setInventory(prev => prev.map(i => {
          if (i.cosmeticId === item.id) return { ...i, equipped: newEquipped };
          // Same-category items get auto-unequipped on the server.
          if (newEquipped) {
            const sameCat = catalog.find(c => c.id === i.cosmeticId)?.category === item.category;
            if (sameCat) return { ...i, equipped: false };
          }
          return i;
        }));
        showToast(newEquipped ? "EQUIPPED" : "UNEQUIPPED");
      } else {
        showToast("EQUIP FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] text-pink-300/70" style={{ fontFamily: "var(--font-sans)" }}>
          ▾ COSMETIC EXCHANGE · SPEND FIAT
        </div>
        <div className="text-[10px] tracking-[0.3em] text-amber-300" style={{ fontFamily: "var(--font-sans)" }}>
          BAL · ƒ{balance.toLocaleString()}
        </div>
      </div>

      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded border text-[10px] tracking-[0.25em] ${
            toast.ok
              ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
              : "border-red-400/50 bg-red-500/10 text-red-200"
          }`}
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-pink-400" /></div>
      ) : catalog.length === 0 ? (
        <div className="text-pink-300/60 text-xs tracking-[0.2em] py-10 text-center">NO COSMETICS IN STOCK</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {catalog.map(item => {
            const owned = ownedSet.has(item.id);
            const equipped = equippedSet.has(item.id);
            const rarityColor = RARITY_COLOR[item.rarity] ?? "#aaaaaa";
            const canAfford = balance >= item.priceCrypto;
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="relative rounded-lg border-2 p-3 transition-all"
                style={{
                  borderColor: equipped ? rarityColor : owned ? "rgba(56,189,248,.4)" : "rgba(236,72,153,.4)",
                  background: equipped
                    ? `${rarityColor}14`
                    : owned ? "rgba(56,189,248,.06)" : "rgba(236,72,153,.06)",
                  minHeight: 150,
                }}
                data-testid={`cosmetic-${item.id}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-lg rounded"
                    style={{ background: item.colorHex ?? "#222", border: `1px solid ${rarityColor}55` }}
                  >
                    {item.iconEmoji ?? "✦"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-pink-100 text-xs font-bold tracking-widest truncate" style={{ color: rarityColor }}>{item.name}</div>
                    <div className="text-[8px] text-pink-300/60 tracking-[0.2em]">{item.category.toUpperCase()} · {item.rarity.toUpperCase()}</div>
                  </div>
                </div>
                <div className="text-[10px] text-pink-200/70 leading-snug mb-2 line-clamp-3">{item.description}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-amber-300 tracking-[0.15em]" style={{ fontFamily: "var(--font-sans)" }}>
                    ƒ{item.priceCrypto.toLocaleString()}
                  </div>
                  {owned ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEquip(item, equipped)}
                      className={`px-2 py-1 rounded border text-[9px] tracking-[0.2em] ${
                        equipped
                          ? "border-red-400/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          : "border-cyan-400/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                      }`}
                    >
                      {busy ? "…" : equipped ? "UNEQUIP" : "EQUIP"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !canAfford}
                      onClick={() => handleBuy(item)}
                      className={`px-2 py-1 rounded border text-[9px] tracking-[0.2em] ${
                        canAfford
                          ? "border-pink-400/50 bg-pink-500/15 text-pink-100 hover:bg-pink-500/25"
                          : "border-zinc-700 bg-zinc-900/60 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      {busy ? "…" : canAfford ? "BUY" : "LOW ƒ"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// End of the working VendKing supply surface.
