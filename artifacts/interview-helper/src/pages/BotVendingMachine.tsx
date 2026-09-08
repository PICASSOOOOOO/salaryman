/**
 * /store/bots/vending — pixel-art bot vending machine. Six glass slots,
 * each holding a marketplace bot capsule. Click a slot to activate that
 * bot (uses the existing /api/bots/marketplace/activate route, which the
 * Bot Factory page already drives). If activation requires checkout the
 * server returns a redirect URL we forward to.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import BotBirthSequence from "@/components/BotBirthSequence";

interface MarketplaceItem {
  id: number;
  name: string;
  description?: string | null;
  personality?: string | null;
  monthlyPriceCents?: number | null;
  imageUrl?: string | null;
  category?: string | null;
}

interface SubRow { marketplaceItemId: number; status: string }

const SLOT_COUNT = 6;

export default function BotVendingMachine() {
  const [, navigate] = useLocation();
  const machineUrl = useArtAsset("vending_machine_iso", 4000, { retryOnFail: true });

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Replicant-decant cinematic. Set to the bot that was just activated; the
  // <BotBirthSequence/> overlay drives the player to /bots when it ends.
  const [birth, setBirth] = useState<{ name: string; specialty?: string; category?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          apiFetch("/api/bots/marketplace/list"),
          apiFetch("/api/bots/marketplace/subscriptions"),
        ]);
        if (cancelled) return;
        if (!mRes.ok) throw new Error(`marketplace ${mRes.status}`);
        const mData = await mRes.json();
        setItems(Array.isArray(mData?.items) ? mData.items : Array.isArray(mData) ? mData : []);
        if (sRes.ok) {
          const sData = await sRes.json();
          setSubs(Array.isArray(sData?.subscriptions) ? sData.subscriptions : []);
        }
      } catch (e: any) {
        setError(e?.message ?? "Could not load VendKing.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const slots = useMemo(() => {
    const owned = new Set(subs.filter(s => s.status === "active").map(s => s.marketplaceItemId));
    // Show owned bots first so the player feels the machine is "stocked" with their lineup,
    // then fill remaining slots with the cheapest unowned items.
    const ownedItems = items.filter(i => owned.has(i.id));
    const unowned = items
      .filter(i => !owned.has(i.id))
      .sort((a, b) => (a.monthlyPriceCents ?? 0) - (b.monthlyPriceCents ?? 0));
    const ordered = [...ownedItems, ...unowned].slice(0, SLOT_COUNT);
    while (ordered.length < SLOT_COUNT) ordered.push(null as any);
    return ordered.map((it, idx) => ({ idx, item: it as MarketplaceItem | null, owned: it && owned.has(it.id) }));
  }, [items, subs]);

  async function dispense(item: MarketplaceItem, idx: number) {
    setBusySlot(idx);
    setFlash(null);
    try {
      const res = await apiFetch("/api/bots/marketplace/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplaceItemId: item.id }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.checkoutUrl) {
          window.location.href = body.checkoutUrl;
          return;
        }
        setFlash(`▾ DISPENSING ${item.name.toUpperCase()}…`);
        // Roll the replicant decant cinematic. The overlay drives navigation
        // when the player taps CLEAR (or auto-skips with ESC).
        setBirth({
          name: item.name,
          specialty: item.personality?.split(/\.|—/)[0]?.trim() || item.description?.slice(0, 60) || undefined,
          category: item.category || undefined,
        });
        return;
      }
      if (res.status === 402 || res.status === 409) {
        // Needs checkout — try Stripe path
        const ch = await apiFetch("/api/stripe/create-bot-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketplaceItemId: item.id }),
        });
        if (ch.ok) {
          const body = await ch.json();
          if (body?.url) { window.location.href = body.url; return; }
        }
      }
      setFlash(`▾ ERROR — ${res.status}`);
    } catch (e: any) {
      setFlash(`▾ ERROR — ${e?.message ?? "unknown"}`);
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative overflow-hidden">
      {/* Pink floor reflection */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{ background: "linear-gradient(0deg, rgba(236,72,153,0.18) 0%, transparent 100%)" }}
      />

      <header className="relative px-6 pt-4 pb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/bots")}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2"
        >
          <ArrowLeft className="w-3 h-3" /> BOT FACTORY
        </button>
        <div className="text-pink-300 tracking-[0.5em]" style={{ fontFamily: "var(--font-sans)" }}>
          ▌ FRESH BOTS — VendKing ▌
        </div>
        <button
          type="button"
          onClick={() => navigate("/office")}
          className="text-cyan-200/70 text-[10px] tracking-[0.4em] hover:text-white"
        >
          EXIT TO OFFICE ▸
        </button>
      </header>

      <div className="relative px-4 sm:px-12 py-6 grid lg:grid-cols-[420px_1fr] gap-8 items-start">
        {/* The machine itself */}
        <div className="relative mx-auto w-full max-w-sm aspect-[3/4] rounded-2xl border-2 border-pink-500/50 overflow-hidden bg-gradient-to-b from-pink-950/40 to-black"
          style={{ boxShadow: "0 0 32px rgba(236,72,153,0.4), inset 0 0 32px rgba(0,0,0,0.6)" }}
        >
          {machineUrl ? (
            <img src={machineUrl} alt="VendKing Bots" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-pink-500/60 text-xs tracking-[0.4em]">
              ▌ COMPOSING ▌
            </div>
          )}
          {flash && (
            <div className="absolute bottom-0 inset-x-0 px-4 py-3 bg-black/90 border-t-2 border-cyan-400 text-cyan-200 text-xs text-center tracking-[0.25em]"
              style={{ fontFamily: "var(--font-sans)" }}>
              {flash}
            </div>
          )}
        </div>

        {/* Slot grid */}
        <div>
          <div className="text-[10px] tracking-[0.4em] text-pink-300/70 mb-3" style={{ fontFamily: "var(--font-sans)" }}>
            ▾ INSERT FLORINS · CHOOSE A SLOT
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-pink-400" /></div>
          ) : error ? (
            <div className="text-pink-400/80 text-sm">{error}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slots.map(({ idx, item, owned }) => (
                <button
                  key={idx}
                  type="button"
                  disabled={!item || busySlot !== null}
                  onClick={() => item && dispense(item, idx)}
                  data-testid={`vending-slot-${idx}`}
                  className={`relative rounded-lg border-2 p-3 text-left transition-all ${
                    item
                      ? owned
                        ? "border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20"
                        : "border-pink-400/40 bg-pink-500/10 hover:bg-pink-500/25 hover:scale-[1.02]"
                      : "border-zinc-700 bg-zinc-900/40 cursor-not-allowed"
                  }`}
                  style={{ minHeight: 130 }}
                >
                  {item ? (
                    <>
                      <div className="aspect-square w-full mb-2 rounded border border-pink-500/30 overflow-hidden bg-black/60 flex items-center justify-center">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
                          : <div className="text-pink-400 text-[9px] tracking-widest">▌ BOT ▌</div>}
                      </div>
                      <div className="text-pink-100 text-xs font-bold tracking-widest">{item.name}</div>
                      <div className="text-[9px] text-pink-300/60 truncate">{item.category ?? "Bot"}</div>
                      <div className={`mt-1 text-[10px] tracking-widest ${owned ? "text-cyan-300" : "text-pink-300"}`}>
                        {owned
                          ? "✓ ACTIVATED"
                          : item.monthlyPriceCents
                            ? `${(item.monthlyPriceCents / 100).toFixed(0)}F / MO`
                            : "FREE TIER"}
                      </div>
                      {busySlot === idx && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-md">
                          <Loader2 className="w-5 h-5 animate-spin text-pink-300" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-[10px] tracking-[0.3em]">
                      EMPTY SLOT
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 px-3 py-2 rounded border border-pink-400/30 bg-black/60 text-pink-200/80 text-xs leading-snug">
            <span className="text-pink-400 mr-2">PABLO:</span>
            "Each capsule's a sealed bot. Activate one and they wake up in your office. Don't shake the machine."
          </div>
        </div>
      </div>

      {birth && (
        <BotBirthSequence
          botName={birth.name}
          specialty={birth.specialty}
          category={birth.category}
          onComplete={() => { setBirth(null); navigate("/bots"); }}
        />
      )}
    </div>
  );
}
