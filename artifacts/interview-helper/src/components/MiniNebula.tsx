import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import type { NebulaStatus } from "@/components/PabloNebula3D";

const PabloNebula3D = lazy(() =>
  import("@/components/PabloNebula3D").then((m) => ({ default: m.PabloNebula3D })),
);

function LightweightNebula({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle, #e879f9 0%, #8b5cf6 38%, #312e81 68%, transparent 76%)",
        boxShadow: "0 0 8px rgba(236,72,153,.55)",
      }}
    />
  );
}

/**
 * MiniNebula — tiny version of the fullscreen Pablo nebula used as a
 * navigation affordance. Clicking it routes the user back into the
 * fullscreen nebula at /pablo (the "zoom in"). Same shader as the
 * fullscreen version, just rendered into a small box, so callers know
 * exactly what they're zooming into.
 *
 * Props:
 *  - size: pixel diameter of the orb (defaults to 26).
 *  - status: emotional state passed straight to the shader.
 *  - target: route to navigate to on click. Defaults to "/pablo".
 *  - title: native tooltip + aria label.
 */
export function MiniNebula({
  size = 26,
  status = "idle",
  target = "/pablo",
  title = "Open Pablo nebula",
}: {
  size?: number;
  status?: NebulaStatus;
  target?: string;
  title?: string;
}) {
  const [, navigate] = useLocation();
  const [enhanced, setEnhanced] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(target);
      }}
      onPointerEnter={() => setEnhanced(true)}
      onFocus={() => setEnhanced(true)}
      onTouchStart={() => setEnhanced(true)}
      title={title}
      aria-label={title}
      data-testid="mini-nebula"
      className="relative inline-flex items-center justify-center rounded-full overflow-hidden hover:scale-110 active:scale-95 transition-transform shrink-0"
      style={{
        width: size,
        height: size,
        background: "rgba(0,0,0,0.35)",
        boxShadow:
          "0 0 8px rgba(236,72,153,0.35), 0 0 16px rgba(168,85,247,0.18)",
        border: "1px solid rgba(236,72,153,0.35)",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        <Suspense fallback={<LightweightNebula size={size} />}>
          {enhanced ? <PabloNebula3D status={status} size={size} /> : <LightweightNebula size={size} />}
        </Suspense>
      </span>
    </button>
  );
}

export default MiniNebula;
