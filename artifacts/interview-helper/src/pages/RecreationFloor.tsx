import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BatteryCharging, Beer, Gamepad2, Trophy, X, Zap } from "lucide-react";
import { IsoOffice } from "@/components/IsoOffice";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityId, getActiveCityName } from "@/lib/city-defs";
import { getRecreationOfficeLayout } from "@/lib/office-property-layouts";
import ArcadeGame, { GAME_LIST } from "./ArcadeGames";
import { getTowerSpaceArtUrl } from "@/lib/tower-space-art";

type GameId = "arcade" | "pool" | "air-hockey" | "foosball" | "shuffleboard" | "bowling" | "darts";
type RecState = {
  stamina: number;
  effects: { kind: string; expiresAt: string; sourceItemId: string }[];
  activeSession: { id: string; gameId: GameId; sponsorId: string } | null;
  charges: Record<string, number>;
};
type Item = {
  id: string; name: string; category: string; price: number; stamina: number;
  effect: string | null; durationSec: number; maxCharges?: number;
};
type Game = { name: string; staminaCost: number; verb: string };
type Sponsor = { id: string; name: string; rewardBonus: number; discountPct: number };
type InventoryRow = { itemId: string; quantity: number };
type RecPayload = {
  rec: RecState; games: Record<GameId, Game>; items: Item[]; sponsors: Sponsor[];
  inventory: InventoryRow[]; wallet: { balance: number; spendable: number };
};

const GAME_IDS = new Set<GameId>(["arcade", "pool", "air-hockey", "foosball", "shuffleboard", "bowling", "darts"]);
const uuid = () => crypto.randomUUID();

export default function RecreationFloor() {
  const { isAuthenticated } = useAuth();
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [payload, setPayload] = useState<RecPayload | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [classicGameId, setClassicGameId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"game" | "bar" | null>(null);
  const [result, setResult] = useState<{ outcome: string; score: number; rewardFiat: number; sponsor: Sponsor } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("WALK TO A STATION · PRESS E OR TAP");
  const [now, setNow] = useState(Date.now());
  const layout = useMemo(() => getRecreationOfficeLayout(getActiveCityId() === "huda_city" ? "huda_city" : "minx_city"), []);

  const load = useCallback(async (slot?: number) => {
    let activeSlot = slot ?? slotIndex;
    if (activeSlot == null) {
      const savesRes = await apiFetch("/api/salaryman/saves", { credentials: "include" });
      if (!savesRes.ok) return;
      const saves = (await savesRes.json()).saves ?? [];
      if (!saves.length) { setMessage("CREATE A CHARACTER BEFORE ENTERING REC"); return; }
      activeSlot = saves.sort((a: { lastSavedAt?: string }, b: { lastSavedAt?: string }) =>
        new Date(b.lastSavedAt ?? 0).getTime() - new Date(a.lastSavedAt ?? 0).getTime())[0].slotIndex;
      setSlotIndex(activeSlot);
    }
    const response = await apiFetch(`/api/recreation/state?slot=${activeSlot}`, { credentials: "include" });
    if (response.ok) setPayload(await response.json());
  }, [slotIndex]);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);

  const activeEffects = payload?.rec.effects.filter((effect) => new Date(effect.expiresAt).getTime() > now) ?? [];
  const hasEffect = (kind: string) => activeEffects.some((effect) => effect.kind === kind);
  const inventoryCount = (id: string) => payload?.inventory.find((row) => row.itemId === id)?.quantity ?? 0;

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await apiFetch(path, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, slotIndex, requestId: uuid() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "REC terminal rejected the action");
      return data;
    } finally { setBusy(false); }
  };

  const startGame = async (gameId: GameId) => {
    setResult(null); setMessage(`CONNECTING TO ${payload?.games[gameId].name.toUpperCase() ?? gameId}`);
    try {
      const data = await post("/api/recreation/games/start", { gameId });
      setPayload((prior) => prior ? { ...prior, rec: data.rec } : prior);
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "GAME FAILED"); }
  };
  const finishGame = async () => {
    const session = payload?.rec.activeSession;
    if (!session) return;
    try {
      const data = await post("/api/recreation/games/finish", { sessionId: session.id });
      setPayload((prior) => prior ? {
        ...prior, rec: data.rec,
        wallet: data.wallet ? { balance: data.wallet.newBalance, spendable: data.wallet.spendable } : prior.wallet,
      } : prior);
      setResult(data.settled);
      setMessage(`${data.settled.outcome} · ${data.settled.score} PTS`);
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "ROUND FAILED"); }
  };
  const chargeClassicArcade = async (gameId: string) => {
    try {
      const data = await post("/api/recreation/arcade/charge", { gameId });
      setPayload((prior) => prior ? {
        ...prior,
        wallet: data.wallet ? { balance: data.wallet.newBalance, spendable: data.wallet.spendable } : prior.wallet,
      } : prior);
      const priceFiat = Number(data.priceFiat ?? GAME_LIST.find((game) => game.id === gameId)?.priceFiat ?? 0);
      setMessage(`${gameId.replace(/_/g, " ").toUpperCase()} · ƒ${priceFiat} INSERTED`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message.toUpperCase() : "ARCADE CHARGE FAILED");
      return false;
    }
  };
  const purchase = async (item: Item) => {
    try {
      const data = await post("/api/recreation/bar/purchase", { itemId: item.id });
      setMessage(`${item.name} ADDED · ƒ${data.price}`);
      await load(slotIndex!);
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "PURCHASE FAILED"); }
  };
  const consume = async (item: Item) => {
    try {
      const data = await post("/api/recreation/bar/consume", { itemId: item.id });
      setPayload((prior) => prior ? { ...prior, rec: data.rec } : prior);
      setMessage(`${item.name} USED · STAMINA RESTORED`);
      await load(slotIndex!);
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "USE FAILED"); }
  };
  const recharge = async (item: Item) => {
    try {
      await post("/api/recreation/bar/recharge", { itemId: item.id });
      setMessage(`${item.name} RECHARGED · ƒ500`);
      await load(slotIndex!);
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "RECHARGE FAILED"); }
  };

  const stations = useMemo(() => layout.stations.map((station) => ({
    ...station,
    onInteract: () => {
      const id = station.id.replace(/^rec-/, "") as GameId;
      if (GAME_IDS.has(id)) { setSelectedGame(id); setPanel("game"); setResult(null); void startGame(id); }
      else if (station.id === "rec-bar" || station.id === "rec-vending") setPanel("bar");
      else if (station.id === "rec-elevator") window.location.assign("/office");
    },
  })), [layout, payload, slotIndex]);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#080b12] text-white grid place-items-center"><Link href="/sign-in" className="border border-cyan-400 px-5 py-3">LOG IN TO ENTER REC</Link></div>;
  return (
    <div className="h-[100dvh] bg-[#060912] text-zinc-100 flex flex-col overflow-hidden" data-testid="recreation-floor">
      <header className="h-14 shrink-0 border-b border-cyan-400/20 bg-[#090d17]/95 px-3 sm:px-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black tracking-[.24em] text-cyan-300 flex items-center gap-2"><Gamepad2 className="w-4 h-4" /> RECREATION · REC</div>
          <div className="text-[10px] text-zinc-500 truncate">{getActiveCityName().toUpperCase()} · PUBLIC SHADOW TOWER FLOOR · {message}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-28 sm:w-40">
            <div className="flex justify-between text-[9px] tracking-wider"><span>STAMINA</span><span data-testid="rec-stamina">{payload?.rec.stamina ?? "—"}/100</span></div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-lime-500 to-cyan-400 transition-all" style={{ width: `${payload?.rec.stamina ?? 0}%` }} /></div>
          </div>
          <span className="hidden sm:block text-amber-300 font-mono">ƒ{payload?.wallet.spendable?.toLocaleString() ?? "—"}</span>
          <button onClick={() => setPanel("bar")} className="p-2 border border-amber-400/30 rounded" aria-label="Open REC bar"><Beer className="w-4 h-4 text-amber-300" /></button>
          <Link href="/office" className="px-2 py-1 text-zinc-400 hover:text-white">EXIT</Link>
        </div>
      </header>
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[radial-gradient(circle_at_50%_15%,#1c2642,#080b12_60%)]">
        <div className="absolute top-3 left-3 z-10 flex gap-1 flex-wrap max-w-[70%]">
          {activeEffects.map((effect) => <span key={`${effect.kind}-${effect.expiresAt}`} className="rounded-full border border-fuchsia-400/40 bg-black/70 px-2 py-1 text-[9px] text-fuchsia-200">
            {effect.kind.replace("_", " ").toUpperCase()} · {Math.max(0, Math.ceil((new Date(effect.expiresAt).getTime() - now) / 1000))}s
          </span>)}
        </div>
        <div className="h-full transition-transform duration-700" style={{
          transform: `${hasEffect("orientation") ? "rotate(180deg)" : ""} ${hasEffect("size_pulse") ? `scale(${1 + Math.sin(now / 350) * .025})` : ""}`,
          filter: hasEffect("color_shift") ? `hue-rotate(${(now / 20) % 360}deg) saturate(1.4)` : hasEffect("focus") ? "contrast(1.14) saturate(.85)" : undefined,
        }}>
          <IsoOffice layout={layout} viewportWidth={window.innerWidth} viewportHeight={window.innerHeight - 56}
            playable followCam premium stations={stations} rooms={layout.rooms} deskColCount={layout.deskCols}
            deskRowCount={layout.deskRows} capsuleCount={0} suppressLabels={window.innerWidth < 680}
            frozen={!!panel} playerName="REC GUEST"
            backdropSrc={getTowerSpaceArtUrl("recreation")}
            lighting="warm" hallwayStyle="gallery" hallwaySignage="RECREATION · LIVE FLOOR" />
        </div>
      </div>

      {panel && <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4">
        <section className="w-full sm:max-w-2xl max-h-[88dvh] overflow-y-auto border border-cyan-400/30 bg-[#0b101c] shadow-2xl sm:rounded-xl">
          <div className="sticky top-0 bg-[#0b101c]/95 border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <h2 className="font-black tracking-[.18em] text-cyan-200">{panel === "bar" ? "REC BAR + VENDING" : selectedGame ? payload?.games[selectedGame].name.toUpperCase() : "GAME"}</h2>
            <button onClick={() => { setPanel(null); setClassicGameId(null); }} className="p-2" aria-label="Close REC panel"><X className="w-4 h-4" /></button>
          </div>
          {panel === "game" && selectedGame && <div className="p-5 text-center space-y-5">
            <div className="text-xs text-zinc-400">SERVER SESSION · COST {payload?.games[selectedGame].staminaCost} STAMINA</div>
            <div className="mx-auto w-36 h-36 rounded-full border-4 border-cyan-400/50 grid place-items-center bg-cyan-500/5 shadow-[0_0_40px_rgba(34,211,238,.15)]">
              {result ? <div><Trophy className="w-10 h-10 mx-auto text-amber-300" /><strong className="text-3xl">{result.score}</strong><div className="text-[10px]">{result.outcome}</div></div>
                : <Gamepad2 className="w-14 h-14 text-cyan-300" />}
            </div>
            {result ? <div className="space-y-1"><p className="text-amber-300">SPONSORED BY {result.sponsor.name}</p><p className="text-lg">REWARD: ƒ{result.rewardFiat}</p>
              <button disabled={busy} onClick={() => void startGame(selectedGame)} className="mt-3 bg-cyan-300 text-black font-black px-6 py-3 rounded">PLAY AGAIN</button></div>
              : <button data-testid={`play-${selectedGame}`} disabled={busy || !payload?.rec.activeSession} onClick={() => void finishGame()}
                className="w-full bg-cyan-300 disabled:bg-zinc-700 text-black font-black px-6 py-4 rounded tracking-widest">
                {busy ? "SETTLING…" : payload?.games[selectedGame].verb}
              </button>}
            <p className="text-[10px] text-zinc-500">Outcomes are deterministic and settled once. No cash-out. Sponsor rewards are in-game FIAT only.</p>
            <div data-testid="classic-arcade-section" className="border-t border-fuchsia-400/20 pt-5 text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black tracking-[.18em] text-fuchsia-200">CLASSIC ARCADE</p>
                  <p className="mt-1 text-[10px] text-zinc-500">FOUR CABINETS · ƒ10–ƒ100 PER RUN · HIGH SCORES STAY LOCAL</p>
                </div>
                <Gamepad2 className="w-5 h-5 shrink-0 text-fuchsia-300" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {GAME_LIST.map((classicGame) => (
                  <button
                    key={classicGame.id}
                    type="button"
                    data-testid={`classic-${classicGame.id}`}
                    onClick={() => setClassicGameId(classicGame.id)}
                    className="rounded border border-white/10 bg-black/20 p-3 text-left transition hover:border-fuchsia-300/70 hover:bg-fuchsia-400/10"
                  >
                    <span className="block text-xs font-black" style={{ color: classicGame.color }}>{classicGame.label}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-zinc-500">{classicGame.desc}</span>
                    <span className="mt-2 block text-[9px] font-bold tracking-widest text-fuchsia-200">INSERT ƒ{classicGame.priceFiat}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>}
          {panel === "bar" && <div className="p-4 grid sm:grid-cols-2 gap-3">
            {payload?.items.map((item) => {
              const owned = inventoryCount(item.id); const charges = payload.rec.charges[item.id] ?? 0;
              return <article key={item.id} className="rounded-lg border border-white/10 bg-white/[.03] p-3">
                <div className="flex justify-between gap-2"><strong className="text-sm">{item.name}</strong><span className="text-amber-300">ƒ{item.price}</span></div>
                <div className="mt-1 text-[10px] text-zinc-500 uppercase">{item.category.replace("_", " ")} · +{item.stamina} stamina{item.effect ? ` · ${item.effect.replace("_", " ")}` : ""}</div>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy} onClick={() => void purchase(item)} className="flex-1 rounded bg-cyan-300 px-3 py-2 text-xs font-bold text-black">BUY</button>
                  <button disabled={busy || owned < 1 || (item.maxCharges != null && charges < 1)} onClick={() => void consume(item)} className="flex-1 rounded border border-lime-400/40 px-3 py-2 text-xs text-lime-300">
                    USE · {owned}{item.maxCharges != null ? ` (${charges}/${item.maxCharges})` : ""}
                  </button>
                  {item.maxCharges != null && <button disabled={busy || owned < 1 || charges >= item.maxCharges} onClick={() => void recharge(item)} className="rounded border border-fuchsia-400/40 p-2 text-fuchsia-300" title="Recharge for ƒ500"><BatteryCharging className="w-4 h-4" /></button>}
                </div>
              </article>;
            })}
          </div>}
        </section>
      </div>}
      {classicGameId && panel === "game" && <ArcadeGame
        gameId={classicGameId}
        priceFiat={GAME_LIST.find((game) => game.id === classicGameId)?.priceFiat ?? 10}
        onExit={() => setClassicGameId(null)}
        onDeductFiat={() => chargeClassicArcade(classicGameId)}
        salary={payload?.wallet.spendable ?? 0}
      />}
      <footer className="h-8 shrink-0 border-t border-white/10 px-3 flex items-center justify-between text-[9px] text-zinc-500">
        <span>WASD / ARROWS · E / ENTER · TAP-TO-MOVE</span><span className="flex items-center gap-1"><Zap className="w-3 h-3" /> STAMINA REGENERATES SERVER-SIDE</span>
      </footer>
    </div>
  );
}