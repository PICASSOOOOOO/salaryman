import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { getPabloHref } from "@/lib/app-navigation";

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
 * Pablo nebula shortcut for the top nav. Renders a tiny live version of
 * the fullscreen Pablo nebula shader; clicking opens Pablo's canonical
 * conversation surface. The separate ⌘K shortcut still opens app search.
 * This uses the same component as the fullscreen one (PabloNebula3D), so
 * the visual identity remains consistent.
 *
 * Falls back to the 2D CSS orb automatically if WebGL is unavailable
 * (handled inside PabloNebula3D), so this is safe in every browser.
 */
export function PabloNavButton({ size = 26 }: { size?: number }) {
  const [location, navigate] = useLocation();
  const [enhanced, setEnhanced] = useState(false);
  return (
    <button
      onClick={() => navigate(getPabloHref(location))}
      onPointerEnter={() => setEnhanced(true)}
      onFocus={() => setEnhanced(true)}
      onTouchStart={() => setEnhanced(true)}
      title="Open Pablo"
      aria-label="Open Pablo"
      data-testid="pablo-nav-nebula"
      className="relative inline-flex items-center justify-center rounded-full overflow-hidden hover:scale-110 active:scale-95 transition-transform shrink-0"
      style={{
        width: size,
        height: size,
        background: "rgba(0,0,0,0.35)",
        boxShadow: "0 0 8px rgba(236,72,153,0.35), 0 0 16px rgba(168,85,247,0.18)",
        border: "1px solid rgba(236,72,153,0.35)",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <Suspense fallback={<LightweightNebula size={size} />}>
          {enhanced ? <PabloNebula3D status="idle" size={size} /> : <LightweightNebula size={size} />}
        </Suspense>
      </span>
    </button>
  );
}

export default PabloNavButton;
