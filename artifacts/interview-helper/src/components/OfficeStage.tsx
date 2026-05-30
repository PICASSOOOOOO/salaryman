/**
 * OfficeStage — the cinematic, "high-end game" office.
 *
 * Replaces the old imported pixel-agents engine (LiveOffice / PixelOffice —
 * little sprites wandering a chunky 8-bit room) with the same Nano Banana
 * art the rest of SALARYMAN uses: a full-bleed `scene_office` still with
 * slow Ken-Burns drift, layered neon-noir lighting, and the crew rendered
 * as the moody hand-lit character portraits (char_pablo / char_jean_claw /
 * char_salaryman / cutscene_player_default).
 *
 * One component, two looks:
 *   variant="live" — the player's personal office (/office)
 *   variant="cctv" — the surveillance feed (/office/surveillance): green
 *                    duotone, scan sweep, REC dot, timestamp.
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

/** Pick the portrait for a crew member. Principals get their hero art; the
 *  rest alternate between the exhausted salaryman and the over-the-shoulder
 *  operative so a full floor doesn't read as clones. */
function portraitKey(m: OfficeCrewMember): string {
  if (m.kind === "pablo") return "char_pablo";
  if (m.kind === "jean") return "char_jean_claw";
  return m.id % 2 === 0 ? "char_salaryman" : "cutscene_player_default";
}

export default function OfficeStage({
  crew,
  height,
  variant = "live",
  children,
  caption,
}: Props) {
  const sceneUrl = useArtAsset("scene_office");
  const cctv = variant === "cctv";

  // Order: principals first, then active crew, then idle.
  const ordered = [...crew].sort((a, b) => {
    const rank = (m: OfficeCrewMember) =>
      m.kind === "pablo" ? 0 : m.kind === "jean" ? 1 : m.active ? 2 : 3;
    return rank(a) - rank(b);
  });

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg select-none"
      style={{
        height,
        background:
          "radial-gradient(120% 90% at 50% 0%, #11141b 0%, #06070b 70%)",
        boxShadow: cctv
          ? "inset 0 0 0 1px rgba(16,185,129,.25)"
          : "inset 0 0 0 1px rgba(56,189,248,.18)",
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
            scale: { duration: 26, ease: "linear", repeat: Infinity, repeatType: "mirror" },
          }}
          style={{
            filter: cctv
              ? "saturate(0.45) hue-rotate(75deg) brightness(0.9) contrast(1.05)"
              : "saturate(1.05) contrast(1.05)",
          }}
        />
      )}

      {/* CSS fallback room while Nano Banana composes the still. */}
      {!sceneUrl && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-3/5"
            style={{ background: "linear-gradient(180deg,#1a1f2c 0%,#11141b 100%)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-2/5"
            style={{ background: "repeating-linear-gradient(0deg,#14171f 0 34px,#11141b 34px 68px)" }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.45em] text-pink-300/40">
            COMPOSING OFFICE…
          </div>
        </>
      )}

      {/* Neon-noir lighting wash. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: cctv
            ? "radial-gradient(ellipse at 50% 40%, rgba(16,185,129,.12), transparent 60%)"
            : "radial-gradient(ellipse at 18% 20%, rgba(34,211,238,.16), transparent 55%), radial-gradient(ellipse at 84% 30%, rgba(236,72,153,.18), transparent 55%)",
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
      {/* Scanlines — heavier on the surveillance feed. */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: cctv ? 0.4 : 0.18,
          background: `repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px ${cctv ? "3px" : "4px"})`,
        }}
      />

      {cctv && <CctvHud />}

      {/* Crew band — the floor of portraits. */}
      <div className="absolute inset-x-0 bottom-0 px-3 sm:px-5 pb-4 pt-10">
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
  const url = useArtAsset(portraitKey(member));
  const principal = member.kind === "pablo" || member.kind === "jean";
  const active = !!member.active;

  // Featured principals stand a little taller than the rank-and-file.
  const w = principal ? 116 : 96;
  const accent = member.kind === "pablo"
    ? "#f472b6"
    : member.kind === "jean"
      ? "#22d3ee"
      : active
        ? (cctv ? "#34d399" : "#a3e635")
        : "#3f3f46";

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: w }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: [0, principal ? -4 : -2.5, 0] }}
      transition={{
        opacity: { duration: 0.5, delay: index * 0.05 },
        y: { duration: 5 + (index % 4), ease: "easeInOut", repeat: Infinity, delay: index * 0.25 },
      }}
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
          style={{ background: "linear-gradient(180deg, transparent, rgba(3,4,8,.95))" }}
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
          style={{ color: principal ? accent : "#e4e4e7", fontFamily: "'Share Tech Mono', monospace" }}
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

/** Surveillance-only chrome: REC, live timestamp, cam label, scan sweep. */
function CctvHud() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const ts = now.toISOString().replace("T", " ").slice(0, 19);
  return (
    <>
      <motion.div
        className="absolute inset-x-0 h-16 pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent, rgba(16,185,129,.12), transparent)" }}
        animate={{ top: ["-12%", "100%"] }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />
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
