import { useMemo, useRef, Suspense, Component, type ReactNode, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLowGfx } from "@/lib/lowGfx";

/**
 * PabloNebula3D — fullscreen wave-field shader.
 *
 * The "nebula" is a single fullscreen quad rendered with a fluid-noise GLSL
 * fragment shader, giving the smooth, painterly Akira-vapor look. Color shifts
 * with `status` (which we treat as the AI's emotional state), and the wave
 * speed/amplitude shift along with it.
 *
 * Resolution: a mild retina ceiling so the shader is crisp on high-DPI
 * displays without trashing perf on low-end devices. The shader itself is
 * dpr-agnostic — it's evaluated per-pixel at whatever resolution the renderer
 * hands us.
 *
 * Variants: a second character (e.g. Mila) reuses this exact shader engine by
 * passing a `variant` (palette + 2D fallback colors) — no forking required.
 * Pablo's signature violet/magenta and Mila's cooler aqua/teal are the only
 * difference; the wave dynamics and motion are shared so both read as the same
 * living nebula, just tinted to whoever is speaking.
 *
 * Public API (props) is unchanged from the old component so callers don't need
 * to migrate; `variant` is optional and defaults to Pablo.
 */

export type NebulaStatus = "idle" | "listening" | "thinking" | "speaking";

// ─── Variant system (palette only) ───────────────────────────────────────────
// A NebulaVariant fully describes a character's nebula without touching the
// shader engine. `palette` drives the GLSL wave-field colors per status, and
// `fallback` drives the 2D CSS orb shown when WebGL is unavailable / reduced
// motion is on. Pass a different variant (see PABLO_VARIANT / MILA_VARIANT) to
// render a second character's nebula in the same engine.
export interface NebulaVariant {
  /** Per-status wave-field palette (linear RGB 0..1) for the GLSL shader. */
  palette: Record<NebulaStatus, { primary: THREE.Vector3; secondary: THREE.Vector3; accent: THREE.Vector3 }>;
  /** Per-status colors for the 2D CSS fallback orb. */
  fallback: Record<NebulaStatus, { core: string; halo: string; ring: string }>;
}

// ─── Pablo ────────────────────────────────────────────────────────────────────
// Each emotion contributes a primary + secondary + accent tint that the shader
// blends across the wave field. Idle = Akira violet/cyan, listening = oceanic
// cyan, thinking = warm amber, speaking = magenta neon (Pablo's signature pink).
const PABLO_PALETTE: Record<NebulaStatus, { primary: THREE.Vector3; secondary: THREE.Vector3; accent: THREE.Vector3 }> = {
  idle:      { primary: new THREE.Vector3(0.42, 0.20, 0.95), secondary: new THREE.Vector3(0.20, 0.55, 1.0),  accent: new THREE.Vector3(0.95, 0.50, 1.0) },
  listening: { primary: new THREE.Vector3(0.06, 0.70, 1.00), secondary: new THREE.Vector3(0.10, 0.95, 0.85), accent: new THREE.Vector3(0.40, 1.00, 0.95) },
  thinking:  { primary: new THREE.Vector3(1.00, 0.55, 0.05), secondary: new THREE.Vector3(0.95, 0.20, 0.40), accent: new THREE.Vector3(1.00, 0.85, 0.40) },
  speaking:  { primary: new THREE.Vector3(1.00, 0.18, 0.65), secondary: new THREE.Vector3(0.55, 0.10, 0.95), accent: new THREE.Vector3(1.00, 0.65, 0.90) },
};

const PABLO_FALLBACK: Record<NebulaStatus, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#a78bfa", halo: "#7c3aed", ring: "#4c1d95" },
  listening: { core: "#67e8f9", halo: "#06b6d4", ring: "#155e75" },
  thinking:  { core: "#fbbf24", halo: "#f59e0b", ring: "#78350f" },
  speaking:  { core: "#f0abfc", halo: "#d946ef", ring: "#86198f" },
};

/** Pablo's signature violet/magenta nebula — the default variant. */
export const PABLO_VARIANT: NebulaVariant = {
  palette: PABLO_PALETTE,
  fallback: PABLO_FALLBACK,
};

// ─── Mila ────────────────────────────────────────────────────────────────────
// Mila's nebula reuses the exact same wave-field shader as Pablo's — it just
// wears a cooler aqua/teal-and-violet identity so the two characters read as
// distinct at a glance when the assistant swaps. This never touches Pablo's
// variant above; Mila's nebula only renders when the assistant IS Mila.
const MILA_PALETTE: Record<NebulaStatus, { primary: THREE.Vector3; secondary: THREE.Vector3; accent: THREE.Vector3 }> = {
  idle:      { primary: new THREE.Vector3(0.10, 0.85, 0.70), secondary: new THREE.Vector3(0.20, 0.95, 0.85), accent: new THREE.Vector3(0.50, 0.55, 1.00) },
  listening: { primary: new THREE.Vector3(0.30, 0.95, 0.55), secondary: new THREE.Vector3(0.15, 0.90, 0.75), accent: new THREE.Vector3(0.60, 1.00, 0.80) },
  thinking:  { primary: new THREE.Vector3(0.45, 0.50, 1.00), secondary: new THREE.Vector3(0.30, 0.65, 0.95), accent: new THREE.Vector3(0.65, 0.70, 1.00) },
  speaking:  { primary: new THREE.Vector3(0.15, 0.90, 0.80), secondary: new THREE.Vector3(0.20, 1.00, 0.92), accent: new THREE.Vector3(0.50, 1.00, 0.95) },
};

const MILA_FALLBACK: Record<NebulaStatus, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#5eead4", halo: "#14b8a6", ring: "#0f766e" },
  listening: { core: "#86efac", halo: "#22c55e", ring: "#166534" },
  thinking:  { core: "#a5b4fc", halo: "#6366f1", ring: "#3730a3" },
  speaking:  { core: "#67e8f9", halo: "#2dd4bf", ring: "#0e7490" },
};

/** Mila's nebula — same wave-field engine, a cooler aqua/teal identity. */
export const MILA_VARIANT: NebulaVariant = {
  palette: MILA_PALETTE,
  fallback: MILA_FALLBACK,
};

// ─── WebGL detection + 2D CSS fallback orb ────────────────────────────────────
function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

function NebulaFallback2D({ status, size, variant, animate = true }: { status: NebulaStatus; size: number; variant: NebulaVariant; animate?: boolean }) {
  const c = variant.fallback[status] ?? variant.fallback.idle;
  const pulseSpeed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  return (
    <div style={{ width: size, height: size, position: "relative" }} aria-label="Pablo nebula (2D fallback)">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 28%, ${c.ring} 55%, transparent 78%)`,
        filter: "blur(2px)",
        // When the user has prefers-reduced-motion the orb is fully static —
        // otherwise we'd be honoring "reduce motion" by swapping a moving
        // shader for a slightly slower-moving CSS pulse, which isn't really
        // honoring it at all.
        animation: animate ? `pablo-pulse ${pulseSpeed} ease-in-out infinite` : "none",
      }} />
      <style>{`@keyframes pablo-pulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }`}</style>
    </div>
  );
}

class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[PabloNebula3D] WebGL failed, using 2D fallback:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ─── Wave dynamics per emotion: the larger / faster, the more agitated ───────
// Shared across variants — emotion motion is the same; only the palette
// differs per character.
const STATUS_DYNAMICS: Record<NebulaStatus, { speed: number; amplitude: number; complexity: number }> = {
  idle:      { speed: 0.10, amplitude: 0.55, complexity: 1.0 },
  listening: { speed: 0.22, amplitude: 0.80, complexity: 1.4 },
  thinking:  { speed: 0.28, amplitude: 0.95, complexity: 1.8 },
  speaking:  { speed: 0.38, amplitude: 1.10, complexity: 1.6 },
};

// ─── The shader: fluid wave field over a fullscreen quad ─────────────────────
const WAVE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec3  uPrimary;
  uniform vec3  uSecondary;
  uniform vec3  uAccent;
  uniform float uSpeed;
  uniform float uAmplitude;
  uniform float uComplexity;

  // Cheap 2D hash + value noise + fbm. Good enough for a smooth liquid look
  // without an external noise texture.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  // 4 octaves. Visually nearly identical to 5 for this domain-warped setup but
  // ~20% less GPU work per pixel — measurable on integrated GPUs and the
  // difference between "smooth" and "context lost" on phones.
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      v += amp * vnoise(p);
      p *= 2.05;
      amp *= 0.52;
    }
    return v;
  }

  void main() {
    // Square aspect so the wave field is round, not stretched.
    vec2 uv = vUv - 0.5;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;

    float t = uTime * uSpeed;

    // Two domain-warped noise fields drifting in opposite directions create
    // rolling waves that interleave instead of grid artifacts.
    vec2 q = vec2(
      fbm(uv * (1.6 * uComplexity) + vec2(t, -t * 0.7)),
      fbm(uv * (1.6 * uComplexity) + vec2(-t * 0.5, t * 0.9))
    );
    vec2 r = vec2(
      fbm(uv * (2.4 * uComplexity) + 4.0 * q + vec2(1.7, 9.2) + t),
      fbm(uv * (2.4 * uComplexity) + 4.0 * q + vec2(8.3, 2.8) - t * 0.6)
    );
    float n = fbm(uv * 1.9 + r * uAmplitude);

    // Soft circular vignette so the field reads as a contained "orb of waves".
    float d = length(uv);
    float vignette = smoothstep(0.95, 0.15, d);

    // Color ramp: primary → secondary → accent driven by the noise value.
    vec3 col = mix(uPrimary, uSecondary, smoothstep(0.25, 0.75, n));
    col = mix(col, uAccent, smoothstep(0.65, 1.0, n + r.x * 0.3));

    // Inner core glow + outer rim hot-spot for that nebula-painted look.
    float core = smoothstep(0.55, 0.0, d) * 0.6;
    col += uAccent * core;

    float alpha = vignette * (0.55 + n * 0.5);
    alpha = clamp(alpha, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

function WaveField({ status, variant }: { status: NebulaStatus; variant: NebulaVariant }) {
  const { size, set, invalidate } = useThree();
  const palette = variant.palette[status] ?? variant.palette.idle;
  const dyn = STATUS_DYNAMICS[status];

  // Real pause-on-hidden: flip R3F's frameloop between 'always' and 'never'
  // when the tab visibility changes. With the default 'always' frameloop,
  // returning early from useFrame still leaves R3F issuing render() every
  // frame. Switching frameloop to 'never' actually stops the rAF loop and the
  // per-frame draw, which is what saves battery and reduces the chance of the
  // GPU evicting our context while we're backgrounded. We also invalidate()
  // once on return so the canvas paints a fresh frame immediately instead of
  // holding the last stale image.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const hidden = document.hidden;
      set({ frameloop: hidden ? "never" : "always" });
      if (!hidden) invalidate();
    };
    apply(); // sync to current state at mount
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      // Restore the default in case some other consumer takes over.
      set({ frameloop: "always" });
    };
  }, [set, invalidate]);

  // Targets we lerp the uniforms toward so emotion (and persona) changes glide
  // instead of popping. Refs so we don't re-allocate the vector each frame.
  const targets = useRef({
    primary: palette.primary.clone(),
    secondary: palette.secondary.clone(),
    accent: palette.accent.clone(),
    speed: dyn.speed,
    amplitude: dyn.amplitude,
    complexity: dyn.complexity,
  });

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: WAVE_VERTEX,
      fragmentShader: WAVE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uPrimary: { value: palette.primary.clone() },
        uSecondary: { value: palette.secondary.clone() },
        uAccent: { value: palette.accent.clone() },
        uSpeed: { value: dyn.speed },
        uAmplitude: { value: dyn.amplitude },
        uComplexity: { value: dyn.complexity },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new emotion/persona targets when status or variant changes.
  useEffect(() => {
    targets.current.primary.copy(palette.primary);
    targets.current.secondary.copy(palette.secondary);
    targets.current.accent.copy(palette.accent);
    targets.current.speed = dyn.speed;
    targets.current.amplitude = dyn.amplitude;
    targets.current.complexity = dyn.complexity;
  }, [status, variant, palette, dyn]);

  // Keep resolution uniform in sync with canvas size for crisp rendering.
  useEffect(() => {
    (material.uniforms.uResolution.value as THREE.Vector2).set(size.width, size.height);
  }, [size.width, size.height, material]);

  useFrame((_, delta) => {
    // No need to gate on visibility here — the visibilitychange effect above
    // flips R3F's frameloop to 'never' when the tab is hidden, so useFrame
    // doesn't fire at all in that case.
    material.uniforms.uTime.value += delta;
    // Smooth lerp toward target color/dynamics. ~0.25/sec feels organic.
    const k = 1 - Math.exp(-delta * 2.5);
    (material.uniforms.uPrimary.value as THREE.Vector3).lerp(targets.current.primary, k);
    (material.uniforms.uSecondary.value as THREE.Vector3).lerp(targets.current.secondary, k);
    (material.uniforms.uAccent.value as THREE.Vector3).lerp(targets.current.accent, k);
    material.uniforms.uSpeed.value += (targets.current.speed - material.uniforms.uSpeed.value) * k;
    material.uniforms.uAmplitude.value += (targets.current.amplitude - material.uniforms.uAmplitude.value) * k;
    material.uniforms.uComplexity.value += (targets.current.complexity - material.uniforms.uComplexity.value) * k;
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

// ─── Main exported nebula scene ───────────────────────────────────────────────
export function PabloNebula3D({
  status,
  size,
  variant = PABLO_VARIANT,
}: {
  status: NebulaStatus;
  size: number;
  variant?: NebulaVariant;
}) {
  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);
  const [lowGfx] = useLowGfx();
  // Latched once the GPU drops the WebGL context. Without this we used to just
  // preventDefault() and warn — the canvas stayed black forever and the user
  // lost the entire intro screen ("screen goes black" bug). Now we permanently
  // swap in the 2D fallback so the page is never blank.
  const [contextLost, setContextLost] = useState(false);
  // Honour the OS-level "reduce motion" preference: a fullscreen animated
  // shader is a textbook offender. Static 2D pulse is the friendlier default
  // for those users (and slightly cheaper for everyone else who hits this path).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setHasWebGL(webglAvailable());
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    // Modern browsers expose addEventListener; older Safari (<14) only has the
    // deprecated addListener / removeListener pair. We honor the OS setting on
    // both so reduce-motion users on legacy iOS still get the static fallback
    // when they toggle it during a session.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    const legacy = mq as MediaQueryList & {
      addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, []);

  // Snapshot mobile flag ONCE at mount. Reading window.innerWidth on every
  // render, and feeding the dpr prop a different tuple across the 640px
  // breakpoint, used to remount the entire <Canvas> on resize/orientation
  // change — recreating the WebGL context. Now the dpr range is stable.
  const dprRange = useMemo<[number, number]>(() => {
    if (typeof window === "undefined") return [1, 1.5];
    return window.innerWidth < 640 ? [1, 1.25] : [1, 2];
  }, []);

  if (hasWebGL === false || contextLost || reduceMotion || lowGfx) {
    // When the user has prefers-reduced-motion the fallback orb stops pulsing
    // entirely — otherwise we'd be replacing one moving thing with another,
    // which doesn't actually honor the OS preference.
    return <NebulaFallback2D status={status} size={size} variant={variant} animate={!reduceMotion} />;
  }
  if (hasWebGL === null) {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <WebGLErrorBoundary fallback={<NebulaFallback2D status={status} size={size} variant={variant} />}>
      <div style={{ width: size, height: size, position: "relative" }}>
        {/* Paint-safety underlayer. iOS Safari can return a working WebGL
            context from getContext() and then silently fail to draw — no error
            event, no boundary trip, the canvas just stays blank. Reported as
            "Pablo nebula is a black screen on mobile". The 2D orb sits below
            the canvas: when WebGL paints, the canvas covers this layer; when
            WebGL doesn't paint, the user still sees a glowing orb instead of a
            void. */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <NebulaFallback2D status={status} size={size} variant={variant} />
        </div>
        <Canvas
          dpr={dprRange}
          orthographic
          camera={{ position: [0, 0, 1], near: 0, far: 2 }}
          // No `powerPreference: "high-performance"` — that flag forces discrete
          // GPUs on hybrid laptops, which causes the OS to swap GPUs when
          // battery saver kicks in and drops the WebGL context. Default lets the
          // browser pick the integrated GPU, which is plenty for this shader and
          // far more stable.
          gl={{ antialias: false, alpha: true, failIfMajorPerformanceCaveat: false }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            // When the GPU yanks the context (mobile background, low memory, tab
            // switch, even just HMR thrash in dev), preventDefault keeps the
            // browser from auto-swapping in a corrupted canvas, and we promote
            // the 2D fallback for the rest of the session.
            const onLost = (e: Event) => {
              e.preventDefault();
              console.warn("[PabloNebula3D] WebGL context lost — falling back to 2D nebula");
              setContextLost(true);
            };
            canvas.addEventListener("webglcontextlost", onLost);
            // Listener cleanup happens implicitly: on context loss we remount
            // into the 2D fallback (this Canvas unmounts), and the canvas DOM
            // node is GC'd alongside it.
          }}
        >
          <Suspense fallback={null}>
            <WaveField status={status} variant={variant} />
          </Suspense>
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}
