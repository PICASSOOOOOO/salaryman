/**
 * OfficeStage — the cinematic, "high-end game" office.
 *
 * Replaces the old imported pixel-agents engine (LiveOffice / PixelOffice —
 * little sprites wandering a chunky 8-bit room) with the same Nano Banana
 * art the rest of SALARYMAN uses: a full-bleed `scene_office` still with
 * slow Ken-Burns drift, layered neon-noir lighting, and the crew rendered
 * as the moody hand-lit character portraits (char_pablo / char_jean_claw /
 * char_salaryman) — one consistent painted art style.
 *
 * One component, two looks:
 *   variant="live" — the player's personal office (/office)
 *   variant="cctv" — the surveillance feed (/office/surveillance): green
 *                    duotone, REC dot, timestamp.
 *
 * Purely presentational. The caller owns the roster + activity state and
 * passes a flat `crew` list; OfficeStage just dresses it.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useArtAsset } from "@/lib/art";

export type CrewKind = "pablo" | "jean" | "generic";

export interface OfficeCrewMember {
  id: number;
  label: string;
  role?: string | null;
  active?: boolean;
  /** Tool/verb to show while active, e.g. "Edit", "Grep". */
  tool?: string | null;
  kind?: CrewKind;
}

interface Props {
  crew: OfficeCrewMember[];
  height: number;
  variant?: "live" | "cctv";
  /** Overlay HUD (e.g. the computer toggle) drawn above the scene. */
  children?: React.ReactNode;
  /** Caption shown bottom-left under the crew band. */
  caption?: string;
}

/** Pick the portrait for a crew member. Everyone uses the same painted
 *  "char_*" portrait set (Pablo, Jean, and the salaryman) so the whole floor
 *  reads as ONE consistent art style. Mixing in the pixel-art cutscene
 *  portraits made the crew look mismatched and "all over the place". */
function portraitKey(m: OfficeCrewMember): string {
  if (m.kind === "pablo") return "char_pablo";
  if (m.kind === "jean") return "char_jean_claw";
  return "char_salaryman";
}

export default function OfficeStage({
  crew,
  height,
  variant = "live",
  children,
  caption,
}: Props) {
  const sceneUrl = useArtAsset("scene_office", 4000, { retryOnFail: true });
  const cctv = variant === "cctv";

  // Order: principals first, then active crew, then idle.
  const ordered = [...crew].sort((a, b) => {
    const rank = (m: OfficeCrewMember) =>
      m.kind === "pablo" ? 0 : m.kind === "jean" ? 1 : m.active ? 2 : 3;
    return rank(a) - rank(b);
  });

  return (
    <div
      className="relative w-full overflow-hidden rounded-none border border-[#5cd5d0]/20 bg-[#081017] select-none sm:rounded-sm"
      style={{
        height,
        background:
          "radial-gradient(100% 80% at 50% 0%, #1a2a2d 0%, #0a1117 54%, #060a0e 100%)",
        boxShadow: cctv
          ? "inset 0 0 0 1px rgba(92,213,208,.28)"
          : "inset 0 0 0 1px rgba(196,126,63,.24)",
      }}
      data-testid={cctv ? "office-stage-cctv" : "office-stage"}
    >
      {/* Nano Banana background still — slow Ken-Burns so the room breathes. */}
      {sceneUrl && (
        <motion.img
          src={sceneUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: cctv ? 0.92 : 1, scale: 1.14 }}
          transition={{
            opacity: { duration: 1 },
            scale: {
              duration: 26,
              ease: "linear",
              repeat: Infinity,
              repeatType: "mirror",
            },
          }}
          style={{
            filter: cctv
              ? "saturate(0.45) hue-rotate(75deg) brightness(0.9) contrast(1.05)"
              : "saturate(0.92) contrast(1.08)",
          }}
        />
      )}

      {/* CSS fallback room while Nano Banana composes the still. */}
      {!sceneUrl && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-3/5"
            style={{
              background: "linear-gradient(180deg,#1a1f2c 0%,#11141b 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-2/5"
            style={{
              background:
                "repeating-linear-gradient(0deg,#14171f 0 34px,#11141b 34px 68px)",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.45em] text-pink-300/40">
            COMPOSING OFFICE…
          </div>
        </>
      )}

      {/* Warm practical light keeps the office authored rather than dashboard-flat. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: cctv
            ? "radial-gradient(ellipse at 50% 40%, rgba(92,213,208,.15), transparent 62%)"
            : "radial-gradient(ellipse at 16% 16%, rgba(92,213,208,.14), transparent 48%), radial-gradient(ellipse at 84% 28%, rgba(196,126,63,.18), transparent 52%)",
        }}
      />
      {/* Cinematic vignette + floor haze so portraits feel grounded. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 30%, transparent 40%, rgba(0,0,0,.55) 100%), linear-gradient(180deg, transparent 45%, rgba(3,4,8,.9) 100%)",
        }}
      />
      {cctv && <CctvHud />}

      {/* Editorial scene marker: a small authored frame around the still. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-5 sm:top-4">
        <div>
          <div
            className={`font-mono text-[9px] uppercase tracking-[.22em] ${cctv ? "text-[#8de1dc]/80" : "text-[#f0c18e]/80"}`}
          >
            PICASSO ORG · {cctv ? "SECURITY FEED" : "FLOOR 66"}
          </div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-[.18em] text-white/40">
            {cctv ? "CAMERA 01 / CONTINUOUS" : "THE ROOM IS OPEN"}
          </div>
        </div>
        <div className="hidden border-l border-white/20 pl-3 text-right font-mono text-[8px] uppercase tracking-[.16em] text-white/40 sm:block">
          <div>{String(ordered.length).padStart(2, "0")} ON FLOOR</div>
          <div className="mt-1 text-[#c47e3f]/80">
            {cctv ? "ARCHIVE / LIVE" : "LOCAL / LIVE"}
          </div>
        </div>
      </div>

      {/* Crew band — the floor of portraits. */}
      <div className="absolute inset-x-0 bottom-0 border-t border-white/[.08] bg-[linear-gradient(180deg,rgba(4,9,13,.02),rgba(4,9,13,.92)_35%,rgba(4,9,13,.98))] px-3 pb-4 pt-12 sm:px-5">
        <div className="flex items-end gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-1">
          {ordered.map((m, i) => (
            <CrewPortrait key={m.id} member={m} index={i} cctv={cctv} />
          ))}
          {ordered.length === 0 && (
            <div className="text-[10px] tracking-[0.35em] text-zinc-500 py-6">
              FLOOR EMPTY · NO CREW ON SHIFT
            </div>
          )}
        </div>
        {caption && (
          <div
            className={`mt-2 text-[9px] tracking-[0.35em] ${cctv ? "text-emerald-300/60" : "text-cyan-200/50"}`}
          >
            {caption}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

function CrewPortrait({
  member,
  index,
  cctv,
}: {
  member: OfficeCrewMember;
  index: number;
  cctv: boolean;
}) {
  const url = useArtAsset(portraitKey(member), 4000, { retryOnFail: true });
  const principal = member.kind === "pablo" || member.kind === "jean";
  const active = !!member.active;

  // Featured principals stand a little taller than the rank-and-file.
  const w = principal ? 116 : 96;
  const accent =
    member.kind === "pablo"
      ? "#e0a36b"
      : member.kind === "jean"
        ? "#8de1dc"
        : active
          ? cctv
            ? "#8de1dc"
            : "#d7ba83"
          : "#526268";

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: w }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      data-testid={`crew-portrait-${member.id}`}
    >
      <div
        className="relative w-full overflow-hidden rounded-md"
        style={{
          aspectRatio: "3 / 4",
          border: `1px solid ${accent}`,
          boxShadow: active
            ? `0 0 18px ${accent}66, inset 0 0 24px rgba(0,0,0,.55)`
            : "inset 0 0 24px rgba(0,0,0,.6)",
          background: "#06070b",
        }}
      >
        {url ? (
          <img
            src={url}
            alt={member.label}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            style={{
              filter: cctv
                ? `saturate(0.4) hue-rotate(75deg) ${active ? "" : "brightness(0.65)"}`
                : active
                  ? "saturate(1.05)"
                  : "saturate(0.55) brightness(0.7)",
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[8px] tracking-[0.3em] text-zinc-600">
            …
          </div>
        )}
        {/* Bottom scrim for the nameplate. */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(3,4,8,.95))",
          }}
        />
        {/* Status pip. */}
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{
            background: accent,
            boxShadow: active ? `0 0 8px ${accent}` : "none",
            animation: active ? "office-pip 1.4s ease-in-out infinite" : "none",
          }}
        />
      </div>
      {/* Nameplate. */}
      <div className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 text-center">
        <div
          className="text-[9px] sm:text-[10px] tracking-[0.12em] truncate"
          style={{
            color: principal ? accent : "#e4e4e7",
            fontFamily: "var(--font-sans)",
          }}
        >
          {member.label.toUpperCase()}
        </div>
        <div
          className="text-[7px] tracking-[0.2em] truncate"
          style={{ color: active ? `${accent}cc` : "#71717a" }}
        >
          {active ? `▸ ${member.tool || "ON TASK"}` : "STANDBY"}
        </div>
      </div>
      <style>{`@keyframes office-pip{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
    </motion.div>
  );
}

/** Surveillance-only chrome: REC, live timestamp, and camera label. */
function CctvHud() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const ts = now.toISOString().replace("T", " ").slice(0, 19);
  return (
    <>
      <div className="absolute top-2.5 left-3 flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-emerald-300/80 pointer-events-none">
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-red-500"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        REC · CAM 01
      </div>
      <div className="absolute top-2.5 right-3 text-[9px] tracking-[0.25em] text-emerald-300/70 pointer-events-none">
        {ts} UTC
      </div>
    </>
  );
}
