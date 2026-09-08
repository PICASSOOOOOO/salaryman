/**
 * CutsceneRunner — pixel-art talking-heads cutscene with typewriter dialogue
 * and end-of-scene comms-channel handoff buttons.
 *
 * Drop-in usage:
 *   <CutsceneRunner cutscene={getCutscene("lobby-receptionist")!} />
 *
 * The runner pulls partner art via useArtAsset() (Pro-baked) and the
 * player's over-the-shoulder portrait via the "cutscene_player_default" key.
 * The end buttons resolve to the canonical comms routes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useArtAsset } from "@/lib/art";
import {
  type Cutscene,
  type CutsceneAction,
  type CutsceneActionKind,
  resolveActionHref,
} from "@/lib/cutscenes";

interface Props {
  cutscene: Cutscene;
  /** Override the player portrait art key (defaults to cutscene_player_default). */
  playerArtKey?: string;
  /** Called after the player closes the cutscene (button or final dismiss). */
  onClose?: () => void;
}

const TYPE_SPEED_MS = 22; // per character
const ACTION_ICON: Record<CutsceneActionKind, string> = {
  video:    "▶",
  text:     "✉",
  phone:    "☏",
  email:    "✦",
  terminal: "▣",
  dismiss:  "✕",
};
const ACTION_TINT: Record<CutsceneActionKind, string> = {
  video:    "border-cyan-400/60 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20",
  text:     "border-pink-400/60 bg-pink-500/10 text-pink-100 hover:bg-pink-500/20",
  phone:    "border-emerald-400/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
  email:    "border-amber-400/60 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  terminal: "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20",
  dismiss:  "border-zinc-500/60 bg-zinc-700/30 text-zinc-200 hover:bg-zinc-700/50",
};

export default function CutsceneRunner({ cutscene, playerArtKey = "cutscene_player_default", onClose }: Props) {
  const [, setLocation] = useLocation();
  const partnerUrl = useArtAsset(cutscene.partner.artKey, 4000, { retryOnFail: true });
  const playerUrl = useArtAsset(playerArtKey, 4000, { retryOnFail: true });

  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const skipRef = useRef(false);
  const skipAllPendingRef = useRef(false);

  const currentLine = cutscene.lines[lineIdx];
  const isFinalLine = lineIdx >= cutscene.lines.length - 1;
  const fullyTyped = currentLine ? charIdx >= currentLine.text.length : true;
  const isComplete = isFinalLine && fullyTyped;

  // Typewriter effect
  useEffect(() => {
    if (!currentLine) return;
    if (charIdx >= currentLine.text.length) return;
    const t = setTimeout(() => {
      setCharIdx(i => i + 1);
    }, skipRef.current ? 0 : TYPE_SPEED_MS);
    return () => clearTimeout(t);
  }, [charIdx, currentLine]);

  // Reset typing on line change; if a skip-all was requested, snap to end
  useEffect(() => {
    const snapLen = skipAllPendingRef.current
      ? (cutscene.lines[lineIdx]?.text.length ?? 0)
      : 0;
    setCharIdx(snapLen);
    skipRef.current = false;
    skipAllPendingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdx]);

  function skipAll() {
    const lastIdx = cutscene.lines.length - 1;
    skipAllPendingRef.current = true;
    setLineIdx(lastIdx);
  }

  function advance() {
    if (!currentLine) return;
    if (!fullyTyped) {
      // Snap to end of current line
      skipRef.current = true;
      setCharIdx(currentLine.text.length);
      return;
    }
    if (!isFinalLine) {
      setLineIdx(i => i + 1);
    }
  }

  function handleAction(action: CutsceneAction) {
    const href = resolveActionHref(action);
    onClose?.();
    if (href.startsWith("http")) {
      window.location.href = href;
    } else {
      setLocation(href);
    }
  }

  // Spacebar / Enter to advance — guard against key-repeat machine-gunning
  // through several short lines on a single long press.
  const lastKeyAt = useRef(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        const now = performance.now();
        if (now - lastKeyAt.current < 180) return;
        lastKeyAt.current = now;
        advance();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        setLocation("/office");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdx, charIdx, fullyTyped, isFinalLine]);

  const accent = cutscene.partner.accent ?? "#ec4899";
  const visibleText = useMemo(() => currentLine?.text.slice(0, charIdx) ?? "", [currentLine, charIdx]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="cutscene-runner">
      {/* Vignette + grain backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(20,0,30,0.0) 30%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Title card */}
      <div className="relative px-6 pt-4 pb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-zinc-400">
        <span style={{ color: accent }}>▌ {cutscene.title.toUpperCase()}</span>
        <div className="flex items-center gap-3">
          {!isComplete && (
            <button
              type="button"
              onClick={skipAll}
              className="hover:text-zinc-200 transition-colors"
              data-testid="cutscene-skip"
            >
              SKIP ▸▸
            </button>
          )}
          <button
            type="button"
            onClick={() => { onClose?.(); setLocation("/office"); }}
            className="hover:text-zinc-200 transition-colors"
            data-testid="cutscene-close"
          >
            ESC ▸ EXIT
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 flex items-end justify-between px-4 sm:px-12 pb-[34vh] overflow-hidden">
        {/* PARTNER (left) */}
        <CharacterPlate
          url={partnerUrl}
          name={cutscene.partner.name}
          role={cutscene.partner.role}
          accent={accent}
          side="left"
          active={currentLine?.speaker === "partner"}
        />

        {/* PLAYER (right) — over-the-shoulder, mirrored & dimmed */}
        <CharacterPlate
          url={playerUrl}
          name="YOU"
          role="Salaryman"
          accent="#ffffff"
          side="right"
          active={currentLine?.speaker === "player"}
          mirrored
        />
      </div>

      {/* Dialogue box pinned to bottom */}
      <div className="absolute left-0 right-0 bottom-0 px-4 sm:px-12 pb-6">
        {!isComplete ? (
          <button
            type="button"
            onClick={advance}
            className="w-full text-left rounded-2xl border-2 px-6 py-5 backdrop-blur-md transition-all"
            style={{
              borderColor: accent,
              background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(10,5,20,0.92) 100%)",
              boxShadow: `0 0 24px ${accent}40, inset 0 0 32px rgba(0,0,0,0.4)`,
            }}
            data-testid="cutscene-advance"
          >
            <div className="text-[10px] tracking-[0.4em] mb-2" style={{ color: accent }}>
              {currentLine?.speaker === "partner" ? `▌ ${cutscene.partner.name}` : "▌ YOU"}
            </div>
            <div
              className="text-lg sm:text-xl text-zinc-100 leading-relaxed min-h-[3.5rem] whitespace-pre-wrap"
              style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}
            >
              {visibleText}
              {!fullyTyped && <span className="inline-block w-2 h-5 ml-1 align-middle" style={{ background: accent }} />}
            </div>
            <div className="mt-3 text-[10px] tracking-[0.3em] text-zinc-500">
              {fullyTyped
                ? (isFinalLine ? "▾ CHOOSE" : "▸ CONTINUE  (SPACE)")
                : "▸ TAP / SPACE TO SKIP"}
            </div>
          </button>
        ) : (
          <ActionPalette actions={cutscene.actions} onPick={handleAction} accent={accent} />
        )}
      </div>
    </div>
  );
}

interface CharProps {
  url: string | null;
  name: string;
  role: string;
  accent: string;
  side: "left" | "right";
  active: boolean;
  mirrored?: boolean;
}

function CharacterPlate({ url, name, role, accent, side, active, mirrored }: CharProps) {
  return (
    <div
      className={`relative flex flex-col items-center transition-all duration-500 ${
        active ? "opacity-100 translate-y-0" : "opacity-50 translate-y-2 saturate-50"
      }`}
      style={{
        width: "min(38vw, 420px)",
        filter: active ? `drop-shadow(0 0 24px ${accent}80)` : "none",
      }}
    >
      <div
        className="relative w-full overflow-hidden rounded-3xl border-2"
        style={{
          aspectRatio: "3 / 4",
          borderColor: active ? accent : "#3f3f46",
          background: "linear-gradient(180deg, rgba(20,10,30,0.6) 0%, rgba(0,0,0,0.9) 100%)",
        }}
      >
        {url ? (
          <img
            src={url}
            alt={name}
            className="w-full h-full object-cover"
            style={{
              imageRendering: "pixelated",
              transform: mirrored ? "scaleX(-1)" : "none",
            }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[9px] tracking-[0.4em]">
            ▌ COMPOSING ▌
          </div>
        )}
      </div>
      <div
        className={`absolute -bottom-2 px-3 py-1.5 rounded-md border-2 backdrop-blur-sm text-center ${
          side === "left" ? "left-2" : "right-2"
        }`}
        style={{
          borderColor: accent,
          background: "rgba(0,0,0,0.9)",
        }}
      >
        <div
          className="text-xs sm:text-sm font-bold tracking-[0.3em]"
          style={{ color: accent, fontFamily: "var(--font-sans)" }}
        >
          {name}
        </div>
        <div className="text-[9px] tracking-[0.2em] text-zinc-400 -mt-0.5">{role}</div>
      </div>
    </div>
  );
}

function ActionPalette({
  actions,
  onPick,
  accent,
}: {
  actions: CutsceneAction[];
  onPick: (a: CutsceneAction) => void;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl border-2 px-5 py-4 backdrop-blur-md"
      style={{
        borderColor: accent,
        background: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(10,5,20,0.95) 100%)",
        boxShadow: `0 0 32px ${accent}50, inset 0 0 24px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="text-[10px] tracking-[0.4em] mb-3" style={{ color: accent }}>
        ▾ CHOOSE A CHANNEL
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {actions.map((a, i) => (
          <button
            key={`${a.kind}-${i}`}
            type="button"
            onClick={() => onPick(a)}
            data-testid={`cutscene-action-${a.kind}`}
            aria-label={`${a.kind}: ${a.label}`}
            className={`px-3 py-3 rounded-lg border-2 text-xs tracking-[0.2em] font-bold transition-all hover:scale-[1.03] ${ACTION_TINT[a.kind]}`}
            style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.15em", fontSize: "1rem" }}
          >
            <span className="mr-2 text-base" aria-hidden="true">{ACTION_ICON[a.kind]}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
