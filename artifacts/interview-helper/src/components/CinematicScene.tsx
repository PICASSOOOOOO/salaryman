import { useEffect, useState } from "react";
import { useArtAsset } from "@/lib/art";
import { useLowGfx } from "@/lib/lowGfx";

export type CinematicSceneKind = "front-door" | "arrival-office" | "arrival-city";

const SCENES: Record<CinematicSceneKind, {
  artKey: string;
  palette: string;
  horizon: string;
  artPosition: string;
}> = {
  "front-door": {
    artKey: "intro_pablo_frontdoor_v2",
    palette: "radial-gradient(ellipse at 50% 52%, rgba(146,68,255,.46) 0%, rgba(75,22,132,.32) 29%, rgba(7,4,20,.96) 75%)",
    horizon: "linear-gradient(90deg, transparent 0 4%, rgba(236,72,153,.4) 4.3% 4.6%, transparent 4.9% 18%, rgba(34,211,238,.38) 18.3% 18.6%, transparent 18.9% 100%)",
    artPosition: "center",
  },
  "arrival-office": {
    artKey: "intro_arrival_office_v2",
    palette: "radial-gradient(ellipse at 50% 44%, rgba(25,117,146,.42) 0%, rgba(51,19,83,.5) 46%, rgba(3,6,12,.98) 90%)",
    horizon: "linear-gradient(90deg, rgba(56,189,248,.25) 0 1px, transparent 1px 15%, rgba(236,72,153,.24) 15% 15.2%, transparent 15.2% 54%, rgba(56,189,248,.25) 54% 54.2%, transparent 54.2%)",
    artPosition: "center",
  },
  "arrival-city": {
    artKey: "intro_arrival_city_v2",
    palette: "radial-gradient(ellipse at 48% 44%, rgba(188,53,150,.35) 0%, rgba(20,87,124,.3) 37%, rgba(3,6,12,.98) 88%)",
    horizon: "linear-gradient(90deg, transparent 0 10%, rgba(34,211,238,.38) 10.2% 10.5%, transparent 10.8% 42%, rgba(244,114,182,.38) 42.2% 42.5%, transparent 42.8% 100%)",
    artPosition: "center 58%",
  },
};

/**
 * A media-independent cinematic plate shared by the public Pablo entrance and
 * the first-login arrival tour. The animated CSS layers are the guaranteed
 * first paint; neutral art is a progressive enhancement, never the only scene.
 */
export function CinematicScene({
  scene,
  testId,
}: {
  scene: CinematicSceneKind;
  testId?: string;
}) {
  const config = SCENES[scene];
  const artUrl = useArtAsset(config.artKey, 4000, { retryOnFail: true });
  const [artFailed, setArtFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [lowGfx] = useLowGfx();

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const motionEnabled = !lowGfx && !reduceMotion;
  const artVisible = Boolean(artUrl && !artFailed);

  return (
    <div
      aria-hidden="true"
      data-testid={testId ?? `cinematic-scene-${scene}`}
      data-motion={motionEnabled ? "active" : "reduced"}
      data-asset-state={artVisible ? "ready" : artFailed ? "failed" : "loading"}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        isolation: "isolate",
        background: config.palette,
      }}
    >
      {/* A designed first paint. Never allow an asset fetch, image error, or
          reduced-motion preference to turn an intro into a blank frame. */}
      <div
        style={{
          position: "absolute",
          inset: "-12%",
          opacity: 0.9,
          backgroundImage: `${config.horizon}, repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 9.5%), repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 11px)`,
          transformOrigin: "center",
          animation: motionEnabled ? "cinematic-drift 18s ease-in-out infinite alternate" : "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.78,
          background: "linear-gradient(118deg, transparent 18%, rgba(56,189,248,.26) 18.2% 18.4%, transparent 18.7% 43%, rgba(236,72,153,.24) 43.2% 43.4%, transparent 43.8% 69%, rgba(167,139,250,.24) 69.2% 69.4%, transparent 69.8%), linear-gradient(0deg, rgba(3,6,12,.7), transparent 57%)",
          mixBlendMode: "screen",
          transformOrigin: "bottom center",
          animation: motionEnabled ? "cinematic-light-sweep 15s ease-in-out infinite alternate" : "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-12%",
          right: "-12%",
          bottom: "-24%",
          height: "56%",
          opacity: 0.66,
          background: "repeating-linear-gradient(90deg, rgba(5,8,20,.96) 0 7%, rgba(19,24,54,.86) 7.3% 10%, rgba(4,5,14,.98) 10.3% 18%)",
          clipPath: "polygon(0 54%, 6% 36%, 12% 61%, 18% 22%, 26% 50%, 33% 13%, 41% 58%, 49% 29%, 58% 47%, 65% 16%, 74% 52%, 82% 26%, 90% 57%, 100% 34%, 100% 100%, 0 100%)",
          transform: motionEnabled ? "translateX(-1.5%)" : "none",
          animation: motionEnabled ? "cinematic-city-pan 24s linear infinite alternate" : "none",
        }}
      />
      {artVisible && (
        <img
          src={artUrl ?? undefined}
          alt=""
          onError={() => setArtFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: config.artPosition,
            opacity: 0.7,
            filter: "saturate(1.08) contrast(1.06)",
            mixBlendMode: "screen",
            animation: motionEnabled ? "cinematic-art-breathe 12s ease-in-out infinite alternate" : "none",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 18%, rgba(3,6,12,.28) 56%, rgba(3,6,12,.9) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 4px)",
          mixBlendMode: "screen",
          opacity: 0.62,
        }}
      />
      <style>{`
        @keyframes cinematic-drift {
          from { transform: scale(1.02) translate3d(-1%, -1%, 0); }
          to { transform: scale(1.1) translate3d(1%, 1%, 0); }
        }
        @keyframes cinematic-city-pan {
          from { transform: translateX(-2%) scale(1.02); }
          to { transform: translateX(2%) scale(1.07); }
        }
        @keyframes cinematic-art-breathe {
          from { transform: scale(1.02); opacity: .58; }
          to { transform: scale(1.08); opacity: .76; }
        }
        @keyframes cinematic-light-sweep {
          from { transform: translateX(-2%) skewX(-1deg); opacity: .54; }
          to { transform: translateX(2%) skewX(1deg); opacity: .84; }
        }
      `}</style>
    </div>
  );
}
