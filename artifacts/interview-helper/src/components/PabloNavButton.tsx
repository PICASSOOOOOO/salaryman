import { useLocation } from "wouter";
import { PabloNebula3D } from "@/components/PabloNebula3D";

/**
 * Pablo nebula shortcut for the top nav. Renders a tiny live version of
 * the fullscreen Pablo nebula shader; clicking zooms the user back into
 * the fullscreen experience at /pablo. Same component as the fullscreen
 * one (PabloNebula3D) so the visual matches what the user is opening.
 *
 * Falls back to the 2D CSS orb automatically if WebGL is unavailable
 * (handled inside PabloNebula3D), so this is safe in every browser.
 */
export function PabloNavButton({ size = 26 }: { size?: number }) {
  const [location, navigate] = useLocation();
  const here = location === "/pablo";

  return (
    <button
      onClick={() => navigate("/pablo")}
      title="PABLO — open the nebula"
      aria-label="Open Pablo nebula"
      aria-current={here ? "page" : undefined}
      data-testid="pablo-nav-nebula"
      className="relative inline-flex items-center justify-center rounded-full overflow-hidden hover:scale-110 active:scale-95 transition-transform shrink-0"
      style={{
        width: size,
        height: size,
        background: "rgba(0,0,0,0.35)",
        boxShadow: here
          ? "0 0 14px rgba(236,72,153,0.65), 0 0 24px rgba(168,85,247,0.35)"
          : "0 0 8px rgba(236,72,153,0.35), 0 0 16px rgba(168,85,247,0.18)",
        border: here
          ? "1px solid rgba(236,72,153,0.7)"
          : "1px solid rgba(236,72,153,0.35)",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <PabloNebula3D status="idle" size={size} />
      </span>
    </button>
  );
}

export default PabloNavButton;
