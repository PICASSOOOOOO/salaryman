/**
 * /terrence-studio — TERRENCE'S house. A pixel-art / CSS-art recording
 * studio in the Akira pink/cyan-on-grime aesthetic. Three rooms in one
 * isometric scene:
 *
 *   1. CONTROL ROOM (centre, lower) — massive 32-channel SSL-style mixing
 *      console with VU meters, faders, knob banks, an outboard rack of
 *      compressors / EQs / reverbs, and a dual-monitor producer station.
 *   2. VOCAL BOOTH (right) — sealed glass cube, ON-AIR red light, mic on
 *      shock-mount + pop filter, headphones hanging on the stand.
 *   3. SOUTH BOOTH LOUNGE (lower-right) — leather couch, glass coffee
 *      table with a mic and a tape, gold records on the back wall.
 *
 * Two assistant pixel-bots (LANA + MOTHRA) sit at workstations off the
 * console; clicking either of them, the console, the mic, or the lounge
 * drops a focused intent into the TerrenceAssistDrawer so the player can
 * keep working with Terrence in-context.
 *
 * Owners get the full room + the always-open assist drawer. Non-owners
 * see the room behind a frosted overlay with a HIRE TERRENCE CTA.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Lock, Music2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import TerrenceAssistDrawer from '@/components/TerrenceAssistDrawer';

type Hotspot = 'console' | 'rack' | 'mic' | 'lounge' | 'lana' | 'mothra';

const HOTSPOT_INTENTS: Record<Hotspot, string> = {
  console: 'I\'m at the board. Talk me through where to start mixing this song.',
  rack:    'What\'s the move on the outboard rack? Suggest a chain for the lead vocal.',
  mic:     'I\'m about to track a vocal. Coach me on mic technique and gain staging.',
  lounge:  'Take a seat with me. What\'s the bigger creative direction for the next track?',
  lana:    'LANA — what did you flag in the session notes I should know?',
  mothra:  'MOTHRA — pull the reference mix, walk me through the spectrum.',
};

const TERRENCE_SLUG = 'music-bot';

export default function TerrenceStudio() {
  const [, navigate] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [intent, setIntent] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<'unknown' | 'owned' | 'unowned'>('unknown');

  // We replicate the small ownership probe from the drawer so we can render
  // the locked overlay (the drawer itself swallows the "unowned" state and
  // shows a HIRE TERRENCE pill — but here the whole room needs gating).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          apiFetch('/api/bots/marketplace/list'),
          apiFetch('/api/bots/marketplace/subscriptions'),
        ]);
        if (cancelled) return;
        const items = mRes.ok ? (await mRes.json())?.items ?? [] : [];
        const subs  = sRes.ok ? (await sRes.json())?.subscriptions ?? [] : [];
        const t = items.find((i: any) => i?.slug === TERRENCE_SLUG || i?.name === 'TERRENCE');
        const owned = !!t && subs.some((s: any) => s?.marketplaceItemId === t.id && s?.status === 'active');
        setOwnership(owned ? 'owned' : 'unowned');
      } catch { if (!cancelled) setOwnership('unowned'); }
    })();
    return () => { cancelled = true; };
  }, []);

  const click = (h: Hotspot) => {
    setIntent(HOTSPOT_INTENTS[h]);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden text-pink-100 font-mono"
         style={{ background: 'radial-gradient(ellipse at 50% 30%, #1c0d1a 0%, #0a0408 60%, #000 100%)' }}>
      {/* Header */}
      <header className="relative px-5 pt-4 pb-2 flex items-center justify-between">
        <button onClick={() => navigate('/pledge')} className="flex items-center gap-2 text-[10px] tracking-[0.4em] text-pink-200 hover:text-white">
          <ArrowLeft size={12}/> PIXEL AGENTS
        </button>
        <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] text-pink-300">
          <Music2 size={12}/> TERRENCE'S STUDIO — MINX CITY · LEVEL 02
        </div>
        <div className="text-[10px] tracking-[0.4em] text-cyan-300">
          {ownership === 'owned'   ? 'ON SESSION ●' :
           ownership === 'unknown' ? '...'         :
                                     'WALK-IN ONLY'}
        </div>
      </header>

      {/* Studio scene */}
      <div className="relative mx-auto mt-4 w-[min(1280px,98vw)] aspect-[16/9] rounded-md overflow-hidden border border-pink-500/30"
           style={{ background: 'linear-gradient(180deg, #1a0f18 0%, #0a0508 100%)', boxShadow: '0 0 80px rgba(236,72,153,0.18) inset' }}>
        {/* Back wall — gold records + plaques */}
        <div className="absolute top-0 left-0 right-0 h-[40%]" style={{ background: 'linear-gradient(180deg,#16101a,#0c080f)' }}>
          <div className="absolute inset-x-6 top-4 flex justify-around">
            {Array.from({ length: 9 }).map((_, i) => (
              <button key={i} type="button" onClick={() => click('lounge')} aria-label="Gold record"
                      className="relative w-12 h-12 rounded-full hover:scale-110 transition-transform"
                      style={{
                        background: `radial-gradient(circle at 35% 35%, #fcd34d 0%, #b45309 70%, #4a2607 100%)`,
                        boxShadow: '0 0 16px rgba(252,211,77,0.4), inset -2px -3px 4px rgba(0,0,0,0.6)',
                      }}>
                <span className="absolute inset-2 rounded-full" style={{ background: '#1a0f18' }} />
                <span className="absolute inset-[42%] rounded-full" style={{ background: '#fcd34d' }} />
              </button>
            ))}
          </div>
          {/* TEMPO-X neon sign */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 text-2xl tracking-[0.5em] font-bold"
               style={{ color: '#ec4899', textShadow: '0 0 12px #ec4899, 0 0 24px #ec4899, 0 0 40px #a21caf' }}>
            TEMPO-X
          </div>
          <div className="absolute top-32 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.6em]" style={{ color: '#06b6d4', textShadow: '0 0 6px #06b6d4' }}>
            BY TERRENCE · PICASSO PUBLISHING
          </div>
        </div>

        {/* Floor — perspective grid */}
        <div className="absolute inset-x-0 bottom-0 h-[60%]" style={{
          background: 'linear-gradient(180deg, #1a0c14 0%, #0a0408 100%)',
        }}>
          <div className="absolute inset-0 opacity-50" style={{
            background:
              'repeating-linear-gradient(90deg, rgba(236,72,153,0.18) 0 1px, transparent 1px 60px),' +
              'repeating-linear-gradient(0deg, rgba(6,182,212,0.10) 0 1px, transparent 1px 40px)',
            maskImage: 'linear-gradient(180deg, transparent 0%, black 30%)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 30%)',
          }} />
        </div>

        {/* === VOCAL BOOTH (top right) =================================== */}
        <button type="button" onClick={() => click('mic')} aria-label="Vocal booth"
                className="absolute right-6 top-6 w-[230px] h-[300px] rounded-md overflow-hidden hover:ring-2 hover:ring-pink-400/60 transition"
                style={{
                  background: 'linear-gradient(180deg, rgba(20,12,20,0.85) 0%, rgba(12,8,12,0.85) 100%)',
                  border: '2px solid #2a1a24',
                  boxShadow: '0 0 30px rgba(236,72,153,0.18) inset',
                }}>
          {/* Glass */}
          <div className="absolute inset-2 rounded" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(2px)',
          }} />
          {/* ON AIR light */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm font-mono text-[9px] tracking-[0.4em] text-white"
               style={{ background: '#dc2626', boxShadow: '0 0 14px #dc2626', animation: 'bbs-pulse 1.6s ease-in-out infinite' }}>
            ON AIR
          </div>
          {/* Mic stand */}
          <div className="absolute left-1/2 -translate-x-1/2 top-16 w-1 h-32 bg-zinc-700" />
          <div className="absolute left-1/2 -translate-x-1/2 top-14 w-12 h-12 rounded-md"
               style={{ background: 'linear-gradient(180deg,#3f3f46,#18181b)', boxShadow: '0 0 12px rgba(236,72,153,0.4)' }}>
            <div className="absolute inset-1 rounded-sm" style={{
              background: 'repeating-linear-gradient(0deg, #52525b 0 2px, #27272a 2px 4px)',
            }} />
          </div>
          {/* Pop filter */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[70px] w-16 h-16 rounded-full border-2 border-zinc-700"
               style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(1px)' }} />
          {/* Headphones */}
          <div className="absolute right-6 top-32 w-10 h-10">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-700" />
            <div className="absolute -bottom-1 left-1 w-3 h-4 rounded-md bg-zinc-700" />
            <div className="absolute -bottom-1 right-1 w-3 h-4 rounded-md bg-zinc-700" />
          </div>
          {/* Foam panels back wall */}
          <div className="absolute inset-x-2 bottom-2 h-20" style={{
            background:
              'repeating-conic-gradient(from 0deg at 8px 8px, #1a1015 0deg 90deg, #0c0810 90deg 180deg)',
            backgroundSize: '16px 16px',
            opacity: 0.6,
          }} />
          {/* Label */}
          <div className="absolute bottom-1 left-1 text-[8px] tracking-[0.4em] text-pink-300/70">VOCAL · BOOTH</div>
        </button>

        {/* === MIXING CONSOLE (centre lower) ============================== */}
        <button type="button" onClick={() => click('console')} aria-label="Mixing console"
                className="absolute left-1/2 -translate-x-1/2 bottom-[10%] w-[68%] hover:brightness-110 transition">
          <ConsoleArt />
        </button>

        {/* Producer chair behind the console */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-20 h-12 rounded-t-2xl"
             style={{ background: 'linear-gradient(180deg, #18181b, #09090b)', boxShadow: '0 -6px 12px rgba(0,0,0,0.5)' }} />

        {/* === OUTBOARD RACK (left) ======================================= */}
        <button type="button" onClick={() => click('rack')} aria-label="Outboard rack"
                className="absolute left-6 top-[28%] w-[160px] h-[260px] rounded hover:ring-2 hover:ring-cyan-400/60 transition"
                style={{
                  background: 'linear-gradient(180deg, #1a1015 0%, #0a0508 100%)',
                  border: '2px solid #2a1a24',
                  boxShadow: '0 0 18px rgba(6,182,212,0.15) inset',
                }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <RackUnit key={i} idx={i} />
          ))}
          <div className="absolute -bottom-5 left-2 text-[8px] tracking-[0.4em] text-cyan-300/70">RACK · 8U</div>
        </button>

        {/* === SOUTH BOOTH LOUNGE (right lower) =========================== */}
        <button type="button" onClick={() => click('lounge')} aria-label="South booth lounge"
                className="absolute right-6 bottom-[8%] w-[210px] h-[140px] rounded-md hover:ring-2 hover:ring-pink-400/60 transition text-left"
                style={{
                  background: 'linear-gradient(180deg, rgba(40,20,30,0.6), rgba(15,8,12,0.6))',
                  border: '1px solid rgba(236,72,153,0.25)',
                }}>
          {/* Couch back */}
          <div className="absolute inset-x-2 top-2 h-10 rounded-t-md"
               style={{ background: 'linear-gradient(180deg, #4a1d2a, #2a0d18)', boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.5)' }} />
          {/* Cushions */}
          <div className="absolute inset-x-2 top-12 h-6 flex gap-1 px-1">
            <div className="flex-1 rounded" style={{ background: 'linear-gradient(180deg, #6b1f30, #3a0d1a)' }} />
            <div className="flex-1 rounded" style={{ background: 'linear-gradient(180deg, #6b1f30, #3a0d1a)' }} />
            <div className="flex-1 rounded" style={{ background: 'linear-gradient(180deg, #6b1f30, #3a0d1a)' }} />
          </div>
          {/* Glass coffee table */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-[160px] h-[36px] rounded"
               style={{ background: 'linear-gradient(180deg, rgba(6,182,212,0.18), rgba(236,72,153,0.18))', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(2px)' }}>
            {/* Mic on the table */}
            <div className="absolute left-3 top-2 w-3 h-6 rounded-sm" style={{ background: '#3f3f46' }} />
            {/* Cassette */}
            <div className="absolute right-4 top-3 w-10 h-4 rounded-sm" style={{ background: 'linear-gradient(180deg,#fcd34d,#b45309)' }} />
          </div>
          {/* Label */}
          <div className="absolute -top-4 left-2 text-[8px] tracking-[0.4em] text-pink-300/70">SOUTH · BOOTH · LOUNGE</div>
        </button>

        {/* === ASSISTANTS ================================================== */}
        <button type="button" onClick={() => click('lana')} aria-label="Assistant LANA"
                className="absolute left-[16%] bottom-[22%] hover:translate-y-[-2px] transition"
                title="LANA — session notes assistant">
          <PixelBot accent="#ec4899" name="LANA" />
        </button>
        <button type="button" onClick={() => click('mothra')} aria-label="Assistant MOTHRA"
                className="absolute right-[20%] bottom-[26%] hover:translate-y-[-2px] transition"
                title="MOTHRA — reference & spectrum analyst">
          <PixelBot accent="#06b6d4" name="MOTHRA" />
        </button>

        {/* TERRENCE himself, between console + booth */}
        <div className="absolute left-[42%] bottom-[24%] pointer-events-none">
          <PixelBot accent="#fbbf24" name="TERRENCE" big />
        </div>

        {/* Locked overlay */}
        {ownership === 'unowned' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md" style={{ background: 'rgba(5,2,8,0.55)' }}>
            <Lock size={32} className="text-pink-300 mb-3" />
            <div className="text-pink-200 text-sm tracking-[0.4em]">TERRENCE NOT ON STAFF</div>
            <div className="text-zinc-400 text-[11px] mt-2 max-w-md text-center px-6">
              Hire TERRENCE from VendKing to step inside the studio, run the console, and pull him into HEMINGWAY + 1999 sessions.
            </div>
            <button onClick={() => navigate('/store/bots/vending')}
                    className="mt-5 px-5 py-2 text-[11px] tracking-[0.4em] text-pink-100 border border-pink-400 hover:bg-pink-500/20">
              ▸ HIRE TERRENCE
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 mx-auto w-[min(1280px,98vw)] flex items-center justify-between text-[10px] tracking-[0.4em] text-zinc-500 px-1">
        <span>▾ Click any element to talk to TERRENCE in context</span>
        <span>SSL // 32CH // ANALOG SUMMING</span>
      </div>

      {/* Live drawer — start open with the welcome intent */}
      {ownership === 'owned' && (
        <TerrenceStudioDrawer
          open={drawerOpen}
          setOpen={setDrawerOpen}
          intent={intent}
          onIntentConsumed={() => setIntent(null)}
        />
      )}

      <style>{`@keyframes bbs-pulse { 0%,100% { opacity: 0.55 } 50% { opacity: 1 } }`}</style>
    </div>
  );
}

// ─── Console + rack art (CSS-only) ─────────────────────────────────────────

function ConsoleArt() {
  const channels = 24;
  return (
    <div className="relative w-full h-44 rounded-md"
         style={{
           background: 'linear-gradient(180deg, #2a2a30 0%, #14141a 50%, #050507 100%)',
           border: '2px solid #1a1a22',
           boxShadow: '0 -8px 24px rgba(0,0,0,0.6), inset 0 2px 0 #3a3a40, 0 0 60px rgba(236,72,153,0.18)',
        }}>
      {/* Master section (right) */}
      <div className="absolute right-2 top-2 bottom-2 w-[140px] rounded border border-zinc-700/60 p-2"
           style={{ background: 'linear-gradient(180deg,#1a1a22,#08080c)' }}>
        <div className="text-[7px] tracking-[0.4em] text-pink-300 mb-1">MASTER</div>
        <div className="grid grid-cols-3 gap-1.5 mb-1">
          {Array.from({ length: 6 }).map((_, i) => <Knob key={i} hot={i % 2 === 0} />)}
        </div>
        <div className="flex gap-1 items-end h-14 px-1">
          <Fader val={0.78} hot />
          <Fader val={0.74} hot />
          <VuMeter />
          <VuMeter />
        </div>
      </div>
      {/* Channel strips */}
      <div className="absolute left-2 right-[150px] top-2 bottom-2 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${channels}, 1fr)` }}>
        {Array.from({ length: channels }).map((_, i) => (
          <ChannelStrip key={i} idx={i} />
        ))}
      </div>
    </div>
  );
}

function ChannelStrip({ idx }: { idx: number }) {
  const fadVal = 0.35 + Math.abs(Math.sin(idx * 0.7)) * 0.55;
  const lit = idx % 4 === 0;
  return (
    <div className="relative h-full flex flex-col items-center gap-0.5 py-0.5 rounded-sm"
         style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', border: '1px solid rgba(255,255,255,0.04)' }}>
      <Knob mini hot={lit} />
      <Knob mini hot={false} />
      <div className="flex-1 w-full flex items-end justify-center pb-0.5">
        <Fader val={fadVal} thin hot={lit} />
      </div>
      <div className="text-[5px] text-zinc-500" style={{ fontFamily: 'monospace' }}>{(idx + 1).toString().padStart(2, '0')}</div>
    </div>
  );
}

function Knob({ mini = false, hot = false }: { mini?: boolean; hot?: boolean }) {
  const size = mini ? 10 : 18;
  const angle = (Math.random() * 240 - 120);
  return (
    <div className="relative rounded-full" style={{
      width: size, height: size,
      background: 'radial-gradient(circle at 35% 30%, #4a4a52 0%, #1a1a20 80%)',
      border: '1px solid #0a0a10',
      boxShadow: hot ? '0 0 6px #ec489988' : 'inset 0 -1px 1px rgba(0,0,0,0.6)',
    }}>
      <span className="absolute left-1/2 top-1/2 origin-bottom" style={{
        width: 1, height: size / 2 - 1,
        background: hot ? '#ec4899' : '#94a3b8',
        transform: `translate(-50%, -100%) rotate(${angle}deg)`,
      }} />
    </div>
  );
}

function Fader({ val, hot = false, thin = false }: { val: number; hot?: boolean; thin?: boolean }) {
  const w = thin ? 4 : 6;
  return (
    <div className="relative h-full" style={{ width: w + 4 }}>
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0" style={{
        width: 2, background: '#0a0a10', boxShadow: 'inset 0 0 2px rgba(0,0,0,0.8)',
      }} />
      <div className="absolute left-1/2 -translate-x-1/2 rounded-sm" style={{
        bottom: `${val * 100}%`,
        width: w + 4, height: 8,
        background: hot
          ? 'linear-gradient(180deg, #fbcfe8 0%, #ec4899 100%)'
          : 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
        boxShadow: hot ? '0 0 6px #ec4899' : 'inset 0 1px 0 rgba(255,255,255,0.2)',
      }} />
    </div>
  );
}

function VuMeter() {
  return (
    <div className="relative h-full w-3 rounded-sm overflow-hidden" style={{ background: '#050507', border: '1px solid #1a1a22' }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const lit = i < 5 + Math.floor(Math.random() * 3);
        const colour = i >= 6 ? '#ef4444' : i >= 4 ? '#fbbf24' : '#10b981';
        return (
          <div key={i} className="absolute left-0 right-0" style={{
            bottom: `${i * 12 + 1}%`,
            height: '10%',
            background: lit ? colour : '#1a1a22',
            opacity: lit ? 0.95 : 0.4,
          }}/>
        );
      })}
    </div>
  );
}

function RackUnit({ idx }: { idx: number }) {
  const types = ['COMP', 'EQ', 'REV', 'DLY', 'GATE', 'SAT', 'PRE', 'CONV'];
  const type = types[idx % types.length];
  const accent = idx % 3 === 0 ? '#ec4899' : idx % 3 === 1 ? '#06b6d4' : '#fbbf24';
  return (
    <div className="absolute left-2 right-2 rounded-sm" style={{
      top: 8 + idx * 32,
      height: 28,
      background: 'linear-gradient(180deg, #2a2a30, #14141a)',
      border: '1px solid #0a0a10',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 0 rgba(0,0,0,0.5)',
    }}>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[7px] tracking-[0.3em] text-zinc-300">{type}</div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 4px ${accent}` }} />
        <span className="w-3 h-3 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #4a4a52, #1a1a20)' }} />
        <span className="w-3 h-3 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #4a4a52, #1a1a20)' }} />
      </div>
    </div>
  );
}

// ─── Pixel-bot avatar ──────────────────────────────────────────────────────

function PixelBot({ accent, name, big = false }: { accent: string; name: string; big?: boolean }) {
  const s = big ? 1.5 : 1;
  return (
    <div className="relative" style={{ width: 36 * s, height: 56 * s }}>
      <div className="absolute left-1/2 -translate-x-1/2" style={{ width: 18 * s, height: 18 * s, top: 0, borderRadius: 4, background: '#3b3b46', boxShadow: `0 0 8px ${accent}` }}>
        {/* Visor */}
        <div className="absolute left-1 right-1 top-2 h-1.5 rounded-sm" style={{ background: accent, boxShadow: `0 0 4px ${accent}` }} />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2" style={{ width: 28 * s, height: 30 * s, top: 16 * s, borderRadius: 3, background: '#0e0e14', borderTop: `2px solid ${accent}` }}>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 px-1 text-[6px] tracking-[0.2em] rounded-sm" style={{ background: accent, color: '#000' }}>{name.slice(0, 6)}</div>
      </div>
      <div className="absolute" style={{ left: 4 * s, top: 18 * s, width: 4 * s, height: 22 * s, background: '#0e0e14', borderRadius: 2 }} />
      <div className="absolute" style={{ right: 4 * s, top: 18 * s, width: 4 * s, height: 22 * s, background: '#0e0e14', borderRadius: 2 }} />
      <div className="absolute" style={{ left: 10 * s, bottom: 0, width: 5 * s, height: 10 * s, background: '#0e0e14', borderRadius: 2 }} />
      <div className="absolute" style={{ right: 10 * s, bottom: 0, width: 5 * s, height: 10 * s, background: '#0e0e14', borderRadius: 2 }} />
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[7px] tracking-[0.3em]" style={{ color: accent }}>{name}</div>
    </div>
  );
}

// ─── Drawer wrapper that auto-sends a hotspot intent ───────────────────────

function TerrenceStudioDrawer({
  open, setOpen, intent, onIntentConsumed,
}: { open: boolean; setOpen: (v: boolean) => void; intent: string | null; onIntentConsumed: () => void }) {
  // We don't programmatically inject the intent into the drawer's state
  // (the drawer owns its messages); instead we render a tiny hint chip
  // inside the studio layout so the player knows what they last clicked.
  // This keeps the drawer component fully self-contained and reusable.
  useEffect(() => {
    if (!intent) return;
    const t = setTimeout(onIntentConsumed, 4000);
    return () => clearTimeout(t);
  }, [intent, onIntentConsumed]);

  return (
    <>
      {intent && (
        <div className="fixed bottom-[calc(min(540px,72vh)+24px)] right-4 z-50 max-w-[360px] px-3 py-2 rounded-md font-mono text-[10px] tracking-[0.2em] text-pink-100"
             style={{ background: 'rgba(10,10,18,0.9)', border: '1px solid rgba(236,72,153,0.4)' }}>
          <span className="text-pink-300">▸ HINT TO TERRENCE: </span>{intent}
        </div>
      )}
      <TerrenceAssistDrawer
        surface="studio"
        getContext={() => ({ genre: 'rap', bpm: 90, timeSignature: '4/4' })}
        defaultOpen
        externalTrigger={{ open, setOpen }}
      />
    </>
  );
}
