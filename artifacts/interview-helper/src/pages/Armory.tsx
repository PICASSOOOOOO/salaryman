import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch, apiUrl } from "@/lib/api-client";
import {
  Loader2, Check, Shield, Sword, Sparkles, Cpu, Wand2, Heart, Dumbbell, Shirt,
  ShoppingBag, Archive, Coins, CreditCard, X, ChevronRight, Battery,
} from "lucide-react";

const ACCENT = "#38bdf8"; // CRT cyan

interface ItemStats {
  attack?: number;
  defense?: number;
  magic?: number;
  tech?: number;
}

interface CatalogItem {
  id: string;
  type: string;
  vehicleKind?: string;
  name: string;
  blurb: string;
  techTier: number;
  rarity: string;
  equipSlot: string | null;
  stats: ItemStats;
  priceFiat: number;
  priceUsd: number | null;
  icon: string;
  consumable?: boolean;
  installTargets?: string[];
  useEffect?: { stamina?: number; workIncomePct?: number; workIncomeUses?: number; skillGrant?: string };
}

interface InstallTarget {
  targetType: string;
  targetId: string;
  label: string;
  capacity: number;
}

interface InstalledRow {
  id: number;
  targetType: string;
  targetId: string;
  slotNo: number;
  itemId: string;
}

const TARGET_TYPE_LABEL: Record<string, string> = {
  home: "Home",
  vehicle: "Vehicle",
  bot: "Bot",
  companion: "Companion",
};

interface GearStats {
  attack: number;
  defense: number;
  magic: number;
  tech: number;
}
interface PhysicalStats { health: number; maxHealth: number; stamina: number; strength: number }

const TYPE_LABEL: Record<string, string> = {
  all: "All",
  weapons: "Weapons",
  armor: "Armor",
  defense: "Defense",
  tech: "Tech",
  clothes: "Clothes",
  equipment: "Equipment",
  vehicle: "Vehicles",
  furniture: "Furniture",
  decor: "Decor",
  battery: "Batteries",
  fuel: "Fuel",
  material: "Materials",
};

const RARITY_COLOR: Record<string, string> = {
  common: "#94a3b8",
  expensive: "#34d399",
  rare: "#38bdf8",
  very_rare: "#a78bfa",
  legendary: "#fbbf24",
};

const STAT_META: { key: keyof ItemStats; label: string; icon: typeof Sword }[] = [
  { key: "attack", label: "ATK", icon: Sword },
  { key: "defense", label: "DEF", icon: Shield },
  { key: "magic", label: "MAG", icon: Wand2 },
  { key: "tech", label: "TEC", icon: Cpu },
];

function fmtFiat(n: number): string {
  return "\u0192" + n.toLocaleString();
}

function activeSlot(): number {
  try {
    return parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function StatPills({ stats }: { stats: ItemStats }) {
  const present = STAT_META.filter((m) => (stats[m.key] ?? 0) > 0);
  if (present.length === 0) return <span className="text-[10px] text-slate-500">No combat stats</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((m) => {
        const Icon = m.icon;
        return (
          <span
            key={m.key}
            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold"
            style={{ borderColor: `${ACCENT}55`, color: ACCENT, background: `${ACCENT}11` }}
          >
            <Icon className="h-3 w-3" />
            {m.label} {stats[m.key]}
          </span>
        );
      })}
    </div>
  );
}

export default function Armory() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const onInventory = location.startsWith("/armory/inventory");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loadout, setLoadout] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<GearStats>({ attack: 0, defense: 0, magic: 0, tech: 0 });
  const [physical, setPhysical] = useState<PhysicalStats>({ health: 100, maxHealth: 100, stamina: 100, strength: 10 });
  const [inventoryView, setInventoryView] = useState<"items" | "attributes">("items");
  const [activeType, setActiveType] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [storedIds, setStoredIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [installTargets, setInstallTargets] = useState<InstallTarget[]>([]);
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [installPicker, setInstallPicker] = useState<string | null>(null);

  const slot = activeSlot();

  const byId = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const it of catalog) m.set(it.id, it);
    return m;
  }, [catalog]);

  const load = useCallback(async () => {
    try {
      const reqs: Promise<Response>[] = [apiFetch("/api/items/catalog")];
      if (isAuthenticated) {
        reqs.push(apiFetch(`/api/items/inventory?slot=${slot}`));
        reqs.push(apiFetch(`/api/items/loadout?slot=${slot}`));
        reqs.push(apiFetch(`/api/items/storage?slot=${slot}`));
        reqs.push(apiFetch(`/api/items/install-targets?slot=${slot}`));
        reqs.push(apiFetch(`/api/items/installed?slot=${slot}`));
      }
      const [catRes, invRes, loadoutRes, storageRes, targetsRes, installedRes] = await Promise.all(reqs);
      const cat = await catRes.json();
      setCatalog(cat.items ?? []);
      if (invRes && invRes.ok) {
        const inv = await invRes.json();
        setOwnedIds(new Set<string>(inv.itemIds ?? []));
        const qty: Record<string, number> = {};
        for (const r of (inv.rows ?? []) as Array<{ itemId: string; quantity: number }>) {
          qty[r.itemId] = r.quantity;
        }
        setQuantities(qty);
      }
      if (loadoutRes && loadoutRes.ok) {
        const lo = await loadoutRes.json();
        setLoadout(lo.loadout ?? {});
        if (lo.stats) setStats(lo.stats);
        if (lo.physical) setPhysical(lo.physical);
      }
      if (storageRes && storageRes.ok) {
        const st = await storageRes.json();
        setStoredIds(new Set<string>(st.itemIds ?? []));
      }
      if (targetsRes && targetsRes.ok) {
        const tg = await targetsRes.json();
        setInstallTargets(tg.targets ?? []);
      }
      if (installedRes && installedRes.ok) {
        const ins = await installedRes.json();
        setInstalled(ins.rows ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, slot]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      setNotice("Purchase complete — gear added to your inventory.");
      load();
    } else if (params.get("purchase") === "cancel") {
      setNotice("Checkout canceled — no charge made.");
    }
  }, [load]);

  // Signal the in-world combat loop (WorldPlay) to reload the equipped stats.
  const signalGearChange = () => {
    try {
      localStorage.setItem("sm_gear_rev", String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const buyFiat = async (item: CatalogItem) => {
    if (!isAuthenticated) {
      window.location.href = apiUrl("/auth/login");
      return;
    }
    setBusy(item.id);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot }),
      });
      const data = await res.json();
      if (data.owned) {
        if (item.consumable) {
          // Stackable — refresh counts/targets so the new quantity shows.
          await load();
          setNotice(`${item.name} acquired${data.granted ? "" : ` for ${fmtFiat(item.priceFiat)}`}.`);
        } else {
          setOwnedIds((prev) => new Set(prev).add(item.id));
          setNotice(data.alreadyOwned ? `${item.name} already owned.` : `${item.name} acquired for ${fmtFiat(item.priceFiat)}.`);
        }
      } else if (res.status === 402) {
        setNotice(`Not enough florins — need ${fmtFiat(data.required)} (you have ${fmtFiat(data.spendable ?? 0)}).`);
      } else {
        setNotice(data.error ?? "Purchase failed.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const buyCard = async (item: CatalogItem) => {
    if (!isAuthenticated) {
      window.location.href = apiUrl("/auth/login");
      return;
    }
    setBusy(item.id);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.owned) {
        setOwnedIds((prev) => new Set(prev).add(item.id));
        setNotice(`${item.name} already owned.`);
      } else {
        setNotice(data.error ?? "Card checkout is unavailable right now.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const equip = async (item: CatalogItem) => {
    if (!item.equipSlot) return;
    setBusy(item.id);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setLoadout(data.loadout ?? {});
        if (data.stats) setStats(data.stats);
        signalGearChange();
        setNotice(`${item.name} equipped.`);
      } else {
        setNotice(data.error ?? "Failed to equip.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const unequip = async (equipSlot: string) => {
    setBusy(`unequip:${equipSlot}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/unequip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipSlot, slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setLoadout(data.loadout ?? {});
        if (data.stats) setStats(data.stats);
        signalGearChange();
      } else {
        setNotice(data.error ?? "Failed to unequip.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  // Home locker: stash an owned item (server moves the ownership row from
  // inventory → storage). Storage is keyed by user, not city, so it follows the
  // player everywhere.
  const deposit = async (item: CatalogItem) => {
    setBusy(`store:${item.id}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/storage/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setOwnedIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
        setStoredIds((prev) => new Set(prev).add(item.id));
        setNotice(`${item.name} stored in your home locker.`);
      } else {
        setNotice(data.error ?? "Couldn't store that item.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (item: CatalogItem) => {
    setBusy(`take:${item.id}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/storage/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setStoredIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
        setOwnedIds((prev) => new Set(prev).add(item.id));
        setNotice(`${item.name} taken from your locker.`);
      } else {
        setNotice(data.error ?? "Couldn't withdraw that item.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const install = async (item: CatalogItem, target: InstallTarget) => {
    setBusy(`install:${item.id}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot, targetType: target.targetType, targetId: target.targetId }),
      });
      const data = await res.json();
      if (data.ok) {
        setInstallPicker(null);
        await load();
        setNotice(`${item.name} installed into ${target.label}.`);
      } else {
        setNotice(data.error ?? "Failed to install.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (row: InstalledRow) => {
    setBusy(`uninstall:${row.id}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, targetType: row.targetType, targetId: row.targetId, slotNo: row.slotNo }),
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        setNotice("Item removed and returned to your stash.");
      } else {
        setNotice(data.error ?? "Failed to remove.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const consume = async (item: CatalogItem) => {
    setBusy(`consume:${item.id}`);
    setNotice("");
    try {
      const res = await apiFetch("/api/items/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot, qty: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await load();
        setNotice(data.workIncomeBoost
          ? `${item.name} activated: +${data.workIncomeBoost.percent}% for ${data.workIncomeBoost.remainingJobs} jobs.`
          : `${item.name} used${typeof data.energy === "number" ? ` — stamina is now ${data.energy}/100` : ""}.`);
      } else setNotice(data.error ?? "Could not use item.");
    } finally {
      setBusy(null);
    }
  };

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const it of catalog) set.add(it.type);
    const ordered = Object.keys(TYPE_LABEL).filter((t) => t === "all" || set.has(t));
    return ordered;
  }, [catalog]);

  const equippedSet = useMemo(() => new Set(Object.values(loadout)), [loadout]);

  const storeItems = useMemo(
    () => (activeType === "all" ? catalog : catalog.filter((i) => i.type === activeType)),
    [catalog, activeType],
  );

  // Carried gear excludes consumables — those get their own stacked section.
  const inventoryItems = useMemo(
    () => catalog.filter((i) => ownedIds.has(i.id) && !i.consumable),
    [catalog, ownedIds],
  );

  // Held consumables: any consumable with a positive quantity.
  const consumableItems = useMemo(
    () => catalog.filter((i) => i.consumable && (quantities[i.id] ?? 0) > 0),
    [catalog, quantities],
  );

  const storedItems = useMemo(
    () => catalog.filter((i) => storedIds.has(i.id) && !i.consumable),
    [catalog, storedIds],
  );

  return (
    <div className="min-h-full bg-black text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-xl font-bold tracking-widest" style={{ color: ACCENT }}>
              <Shield className="h-5 w-5" />
              ARMORY
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">Quartermaster — gear that really changes the fight. Slot #{slot}.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-2">
          <button
            onClick={() => navigate("/armory")}
            className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-bold transition"
            style={
              !onInventory
                ? { borderColor: ACCENT, color: "#000", background: ACCENT }
                : { borderColor: `${ACCENT}44`, color: ACCENT, background: "transparent" }
            }
          >
            <ShoppingBag className="h-3.5 w-3.5" /> STORE
          </button>
          <button
            onClick={() => navigate("/armory/inventory")}
            className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-bold transition"
            style={
              onInventory
                ? { borderColor: ACCENT, color: "#000", background: ACCENT }
                : { borderColor: `${ACCENT}44`, color: ACCENT, background: "transparent" }
            }
          >
            <Archive className="h-3.5 w-3.5" /> INVENTORY
          </button>
        </div>

        {/* Equipped stat summary */}
        {isAuthenticated && (
          <div
            className="mb-5 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4"
            style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}08` }}
          >
            {STAT_META.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.key} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color: ACCENT }} />
                  <div>
                    <div className="font-mono text-lg font-bold leading-none" style={{ color: ACCENT }}>
                      +{stats[m.key as keyof GearStats]}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{m.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 flex items-center justify-between rounded border px-3 py-2 text-xs"
              style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}11`, color: ACCENT }}
            >
              <span>{notice}</span>
              <button onClick={() => setNotice("")} className="text-slate-400 hover:text-slate-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : onInventory ? (
          /* ─── INVENTORY ─── */
          <div>
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button onClick={() => setInventoryView("items")} className={`rounded border px-3 py-2 text-xs font-bold ${inventoryView === "items" ? "border-cyan-300 bg-cyan-300 text-black" : "border-white/15 text-zinc-300"}`}>ITEMS</button>
              <button onClick={() => setInventoryView("attributes")} className={`rounded border px-3 py-2 text-xs font-bold ${inventoryView === "attributes" ? "border-cyan-300 bg-cyan-300 text-black" : "border-white/15 text-zinc-300"}`}>ATTRIBUTES</button>
            </div>
            {inventoryView === "attributes" ? (
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    [Heart, "HEALTH", `${physical.health}/${physical.maxHealth}`],
                    [Dumbbell, "STRENGTH", physical.strength],
                    [Sparkles, "STAMINA", `${physical.stamina}/100`],
                    [Shield, "PROTECTION", stats.defense],
                  ].map(([Icon, label, value]) => {
                    const StatIcon = Icon as typeof Heart;
                    return <div key={String(label)} className="rounded border border-cyan-400/20 bg-cyan-400/5 p-4"><StatIcon className="mb-2 h-4 w-4 text-cyan-300" /><div className="text-[10px] tracking-widest text-zinc-500">{label as string}</div><strong className="text-xl text-cyan-100">{String(value)}</strong></div>;
                  })}
                </div>
                <div className="rounded border border-white/10 bg-white/[.025] p-4">
                  <h2 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-zinc-200"><Shirt className="h-4 w-4 text-cyan-300" /> WORN</h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {["outfit", "armor", "accessory", "weapon"].map((slotName) => {
                      const item = byId.get(loadout[slotName]);
                      return <div key={slotName} className="flex items-center justify-between border border-white/10 p-3"><span className="text-[10px] uppercase tracking-widest text-zinc-500">{slotName}</span><strong className="text-xs text-zinc-200">{item ? `${item.icon} ${item.name}` : "EMPTY"}</strong></div>;
                    })}
                  </div>
                </div>
              </section>
            ) : (
            <>
            {/* Equipped loadout strip */}
            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-400">Equipped</h2>
            {Object.keys(loadout).length === 0 ? (
              <p className="mb-6 text-xs text-slate-500">Nothing equipped. Equip gear below to boost your stats.</p>
            ) : (
              <div className="mb-6 flex flex-wrap gap-2">
                {Object.entries(loadout).map(([eqSlot, itemId]) => {
                  const it = byId.get(itemId);
                  if (!it) return null;
                  return (
                    <div
                      key={eqSlot}
                      className="flex items-center gap-2 rounded border px-2.5 py-1.5"
                      style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}0d` }}
                    >
                      <span className="text-lg">{it.icon}</span>
                      <div className="leading-tight">
                        <div className="text-xs font-semibold">{it.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{eqSlot}</div>
                      </div>
                      <button
                        onClick={() => unequip(eqSlot)}
                        disabled={busy === `unequip:${eqSlot}`}
                        className="ml-1 rounded p-1 text-slate-400 hover:text-red-400 disabled:opacity-50"
                        title="Unequip"
                      >
                        {busy === `unequip:${eqSlot}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-400">
              Owned ({inventoryItems.length})
            </h2>
            {inventoryItems.length === 0 ? (
              <p className="text-xs text-slate-500">
                You don't own any gear yet.{" "}
                <button onClick={() => navigate("/armory")} className="underline" style={{ color: ACCENT }}>
                  Visit the store
                </button>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {inventoryItems.map((item) => {
                  const isEquipped = equippedSet.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border p-3"
                      style={{ borderColor: isEquipped ? ACCENT : "#1e293b", background: "#0a0f17" }}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{item.icon}</span>
                          <div>
                            <div className="text-sm font-semibold">{item.name}</div>
                            <div className="text-[10px] uppercase tracking-wider" style={{ color: RARITY_COLOR[item.rarity] ?? "#94a3b8" }}>
                              {item.rarity.replace(/_/g, " ")} · T{item.techTier}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <StatPills stats={item.stats} />
                      </div>
                      {item.equipSlot ? (
                        isEquipped ? (
                          <button
                            onClick={() => unequip(item.equipSlot!)}
                            disabled={busy === `unequip:${item.equipSlot}`}
                            className="w-full rounded border py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                            style={{ borderColor: "#334155" }}
                          >
                            {busy === `unequip:${item.equipSlot}` ? "..." : "UNEQUIP"}
                          </button>
                        ) : (
                          <button
                            onClick={() => equip(item)}
                            disabled={busy === item.id}
                            className="w-full rounded py-1.5 text-xs font-bold text-black disabled:opacity-50"
                            style={{ background: ACCENT }}
                          >
                            {busy === item.id ? "..." : "EQUIP"}
                          </button>
                        )
                      ) : (
                        <div className="text-center text-[10px] text-slate-500">Placed item (not equippable)</div>
                      )}
                      {!isEquipped && (
                        <button
                          onClick={() => deposit(item)}
                          disabled={busy === `store:${item.id}`}
                          className="mt-1.5 flex w-full items-center justify-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-50"
                        >
                          {busy === `store:${item.id}` ? "..." : <>Store in home locker <Archive className="h-3 w-3" /></>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Consumables — stackable supplies, some installable into things you own */}
            <h2 className="mb-2 mt-8 flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-slate-400">
              <Battery className="h-3.5 w-3.5" /> Consumables ({consumableItems.length})
            </h2>
            <p className="mb-3 max-w-prose text-[11px] text-slate-500">
              Stackable supplies. Some can be installed into a home, vehicle, bot, or companion you own.
            </p>
            {consumableItems.length === 0 ? (
              <p className="text-xs text-slate-500">No consumables held. Buy batteries, fuel, or materials in the store.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {consumableItems.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const eligible = (item.installTargets ?? []).length > 0
                    ? installTargets.filter((t) => (item.installTargets ?? []).includes(t.targetType))
                    : [];
                  const picking = installPicker === item.id;
                  return (
                    <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: "#1e293b", background: "#0a0f17" }}>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{item.icon}</span>
                          <div>
                            <div className="text-sm font-semibold">{item.name}</div>
                            <div className="text-[10px] uppercase tracking-wider" style={{ color: RARITY_COLOR[item.rarity] ?? "#94a3b8" }}>
                              {TYPE_LABEL[item.type] ?? item.type} · T{item.techTier}
                            </div>
                          </div>
                        </div>
                        <span className="rounded px-2 py-0.5 font-mono text-sm font-bold" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
                          ×{qty}
                        </span>
                      </div>
                      {item.useEffect ? (
                        <button
                          onClick={() => consume(item)}
                          disabled={busy === `consume:${item.id}`}
                          className="w-full rounded bg-amber-300 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                        >
                          {busy === `consume:${item.id}` ? "USING…" : "USE"}
                        </button>
                      ) : (item.installTargets ?? []).length > 0 ? (
                        picking ? (
                          <div className="space-y-1.5">
                            {eligible.length === 0 ? (
                              <p className="text-[11px] text-slate-500">You don't own anything to install this into yet.</p>
                            ) : (
                              eligible.map((t) => (
                                <button
                                  key={`${t.targetType}:${t.targetId}`}
                                  onClick={() => install(item, t)}
                                  disabled={busy === `install:${item.id}`}
                                  className="flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
                                  style={{ borderColor: "#334155" }}
                                >
                                  <span>{t.label}</span>
                                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{TARGET_TYPE_LABEL[t.targetType] ?? t.targetType}</span>
                                </button>
                              ))
                            )}
                            <button onClick={() => setInstallPicker(null)} className="w-full text-[10px] text-slate-500 hover:text-slate-300">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setInstallPicker(item.id)}
                            className="w-full rounded py-1.5 text-xs font-bold text-black"
                            style={{ background: ACCENT }}
                          >
                            INSTALL
                          </button>
                        )
                      ) : (
                        <div className="text-center text-[10px] text-slate-500">Crafting material (not installable)</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Installed — consumables currently powering your things */}
            {installed.length > 0 && (
              <>
                <h2 className="mb-2 mt-8 flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-slate-400">
                  <Cpu className="h-3.5 w-3.5" /> Installed ({installed.length})
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {installed.map((row) => {
                    const it = byId.get(row.itemId);
                    const tgt = installTargets.find((t) => t.targetType === row.targetType && t.targetId === row.targetId);
                    return (
                      <div key={row.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: `${ACCENT}44`, background: "#0a0f17" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{it?.icon ?? "🔋"}</span>
                          <div className="leading-tight">
                            <div className="text-xs font-semibold">{it?.name ?? row.itemId}</div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              {TARGET_TYPE_LABEL[row.targetType] ?? row.targetType}: {tgt?.label ?? row.targetId}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => uninstall(row)}
                          disabled={busy === `uninstall:${row.id}`}
                          className="rounded p-1 text-slate-400 hover:text-red-400 disabled:opacity-50"
                          title="Remove"
                        >
                          {busy === `uninstall:${row.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Home locker — a safe at home; contents follow the player across cities */}
            <h2 className="mb-2 mt-8 flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-slate-400">
              <Archive className="h-3.5 w-3.5" /> Home Locker ({storedItems.length})
            </h2>
            <p className="mb-3 max-w-prose text-[11px] text-slate-500">
              A safe kept at home. Items in here are held no matter which city you're in — stash gear in one city,
              pull it out in another. Stored items aren't carried and can't be equipped until you withdraw them.
            </p>
            {storedItems.length === 0 ? (
              <p className="text-xs text-slate-500">Your locker is empty. Use “Store in home locker” on any owned item to stash it.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {storedItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: "#1e293b", background: "#0a0f17" }}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <div className="text-sm font-semibold">{item.name}</div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: RARITY_COLOR[item.rarity] ?? "#94a3b8" }}>
                          {item.rarity.replace(/_/g, " ")} · T{item.techTier}
                        </div>
                      </div>
                    </div>
                    <div className="mb-3"><StatPills stats={item.stats} /></div>
                    <button
                      onClick={() => withdraw(item)}
                      disabled={busy === `take:${item.id}`}
                      className="w-full rounded py-1.5 text-xs font-bold text-black disabled:opacity-50"
                      style={{ background: ACCENT }}
                    >
                      {busy === `take:${item.id}` ? "..." : "WITHDRAW"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            </>
            )}
          </div>
        ) : (
          /* ─── STORE ─── */
          <div>
            {/* Type filter */}
            <div className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className="shrink-0 whitespace-nowrap rounded border px-2.5 py-1 font-mono text-[11px] font-bold transition"
                  style={
                    activeType === t
                      ? { borderColor: ACCENT, color: "#000", background: ACCENT }
                      : { borderColor: "#1e293b", color: "#94a3b8", background: "transparent" }
                  }
                >
                  {TYPE_LABEL[t] ?? t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {storeItems.map((item) => {
                const owned = ownedIds.has(item.id);
                const heldQty = item.consumable ? (quantities[item.id] ?? 0) : 0;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col rounded-lg border p-3"
                    style={{ borderColor: "#1e293b", background: "#0a0f17" }}
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {item.name}
                          {item.priceUsd != null && <Sparkles className="h-3 w-3 shrink-0" style={{ color: "#fbbf24" }} />}
                          {item.consumable && heldQty > 0 && (
                            <span className="ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
                              ×{heldQty}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: RARITY_COLOR[item.rarity] ?? "#94a3b8" }}>
                          {item.rarity.replace(/_/g, " ")} · T{item.techTier} · {TYPE_LABEL[item.type] ?? item.type}
                        </div>
                      </div>
                    </div>
                    <p className="mb-2 text-[11px] leading-snug text-slate-400">{item.blurb}</p>
                    <div className="mb-3">
                      <StatPills stats={item.stats} />
                    </div>

                    <div className="mt-auto">
                      {owned && !item.consumable ? (
                        <div
                          className="flex items-center justify-center gap-1.5 rounded border py-1.5 text-xs font-bold"
                          style={{ borderColor: `${ACCENT}55`, color: ACCENT }}
                        >
                          <Check className="h-3.5 w-3.5" /> OWNED
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => buyFiat(item)}
                            disabled={busy === item.id}
                            className="flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-bold text-black disabled:opacity-50"
                            style={{ background: ACCENT }}
                          >
                            {busy === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Coins className="h-3.5 w-3.5" /> {fmtFiat(item.priceFiat)}
                              </>
                            )}
                          </button>
                          {item.priceUsd != null && (
                            <button
                              onClick={() => buyCard(item)}
                              disabled={busy === item.id}
                              className="flex items-center justify-center gap-1.5 rounded border py-1.5 text-xs font-bold disabled:opacity-50"
                              style={{ borderColor: "#fbbf24", color: "#fbbf24" }}
                            >
                              <CreditCard className="h-3.5 w-3.5" /> ${item.priceUsd} card
                            </button>
                          )}
                        </div>
                      )}
                      {owned && item.equipSlot && (
                        <button
                          onClick={() => navigate("/armory/inventory")}
                          className="mt-1.5 flex w-full items-center justify-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                        >
                          Equip in inventory <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
