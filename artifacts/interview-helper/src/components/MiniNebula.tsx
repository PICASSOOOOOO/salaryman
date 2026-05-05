import { useLocation } from "wouter";
import { PabloNebula3D, type NebulaStatus } from "@/components/PabloNebula3D";

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
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(target);
      }}
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
        <PabloNebula3D status={status} size={size} />
      </span>
    </button>
  );
}

export default MiniNebula;
