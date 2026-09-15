import { useMemo, useRef, Suspense, Component, type ReactNode, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLowGfx } from "@/lib/lowGfx";

/**
 * PabloNebula3D — Pablo's signature "emotion orb".
 *
 * A self-contained, glowing purple particle nebula: a spherical shell of
 * additively-blended point sprites wrapped around a bright pulsing core. This
 * is the ORIGINAL contained orb art (NOT a deep-space galaxy fly-through) — it
 * reads as a single living ball of light at any size, from the 16px chat tab
 * icon up to a full-bleed background.
 *
 * Emotion is expressed through MOTION, not just color. Every status drives a
 * visibly distinct animation via a custom vertex shader that displaces the
 * shell with travelling sine "waves of emotion":
 *   - idle      → slow calm breathing, gentle drift
 *   - listening → leans inward, quick attentive ripples
 *   - thinking  → busy, turbulent boil, fast multi-axis spin
 *   - speaking  → big expressive radial waves pulsing outward
 * Motion params are lerped toward the target state each frame so transitions
 * read as Pablo "shifting mood" rather than snapping.
 *
 * Variants: a second character (e.g. Mila) can reuse this exact engine by
 * passing a `variant` (palette + shape character) — no forking required.
 *
 * Hardened host: WebGL detection with a 2D CSS fallback orb underlayer (iOS
 * Safari can hand back a context that never paints), a latched 2D fallback on
 * context loss (mobile "black screen" bug), OS reduce-motion + low-GFX
 * support, a stable DPR range that doesn't remount the canvas on resize, and a
 * real pause-on-hidden via R3F's frameloop.
 */

export type NebulaStatus = "idle" | "listening" | "thinking" | "speaking";

// ─── Variant system (palette + shape) ────────────────────────────────────────
// A NebulaVariant fully describes a character's orb without touching the engine.
// `tint` drives the 3D particle colors per status, `fallback` drives the 2D CSS
// orb, and `shape` nudges the geometry so two characters look distinct even at
// the same status. Pass a different variant (see PABLO_VARIANT below) to render
// a second character's orb.
export interface NebulaVariant {
  /** Per-status RGB tint (0..1) for the 3D particle field + core. */
  tint: Record<NebulaStatus, [number, number, number]>;
  /** Per-status colors for the 2D CSS fallback orb. */
  fallback: Record<NebulaStatus, { core: string; halo: string; ring: string }>;
  /** Shape character — lets a variant look distinct without forking geometry. */
  shape?: {
    /** Y-axis squish. 1 = perfect sphere, <1 = oblate disc. */
    flatten?: number;
    /** Shell thickness as a fraction of radius (wispiness). */
    thickness?: number;
    /** Multiplier on wave amplitude (how pronounced the emotion waves are). */
    waveScale?: number;
  };
}

const PABLO_TINT: Record<NebulaStatus, [number, number, number]> = {
  idle:      [0.66, 0.40, 1.00],
  listening: [0.30, 0.85, 1.00],
  thinking:  [1.00, 0.58, 0.20],
  speaking:  [0.95, 0.40, 0.85],
};

const PABLO_FALLBACK: Record<NebulaStatus, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#a78bfa", halo: "#7c3aed", ring: "#4c1d95" },
  listening: { core: "#67e8f9", halo: "#06b6d4", ring: "#155e75" },
  thinking:  { core: "#fbbf24", halo: "#f59e0b", ring: "#78350f" },
  speaking:  { core: "#f0abfc", halo: "#d946ef", ring: "#86198f" },
};

/** Pablo's signature purple orb — the default variant. */
export const PABLO_VARIANT: NebulaVariant = {
  tint: PABLO_TINT,
  fallback: PABLO_FALLBACK,
  shape: { flatten: 1.0, thickness: 0.42, waveScale: 1.0 },
};

const MILA_TINT: Record<NebulaStatus, [number, number, number]> = {
  idle:      [0.10, 0.85, 0.70],
  listening: [0.30, 0.95, 0.55],
  thinking:  [0.45, 0.50, 1.00],
  speaking:  [0.15, 0.90, 0.80],
};

const MILA_FALLBACK: Record<NebulaStatus, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#5eead4", halo: "#14b8a6", ring: "#0f766e" },
  listening: { core: "#86efac", halo: "#22c55e", ring: "#166534" },
  thinking:  { core: "#a5b4fc", halo: "#6366f1", ring: "#3730a3" },
  speaking:  { core: "#67e8f9", halo: "#2dd4bf", ring: "#0e7490" },
};

/** Mila's cooler companion palette using the same emotion-orb engine. */
export const MILA_VARIANT: NebulaVariant = {
  tint: MILA_TINT,
  fallback: MILA_FALLBACK,
  shape: { flatten: 0.94, thickness: 0.48, waveScale: 0.9 },
};

// ─── Per-status emotion motion ───────────────────────────────────────────────
// The heart of "waves of emotion". Each field maps to a shader uniform (or the
// shell rotation) and is lerped toward the active status' target every frame.
interface Motion {
  rotSpeed: number;    // base shell rotation (rad/s)
  waveAmp: number;     // radial travelling-wave amplitude
  waveFreq: number;    // angular frequency of the waves
  waveSpeed: number;   // temporal speed of the waves
  turbulence: number;  // chaotic per-particle jitter
  breathAmp: number;   // global in/out breathing amplitude
  breathSpeed: number; // breathing speed
  spread: number;      // overall scale (lean in <1 / push out >1)
  corePulse: number;   // core pulse amplitude
  coreSpeed: number;   // core pulse speed
}

const MOTION: Record<NebulaStatus, Motion> = {
  // Calm, slow, barely-there breathing — Pablo at rest.
  idle:      { rotSpeed: 0.07, waveAmp: 0.045, waveFreq: 2.0, waveSpeed: 0.55, turbulence: 0.010, breathAmp: 0.055, breathSpeed: 0.9, spread: 1.00, corePulse: 0.06, coreSpeed: 1.0 },
  // Leans inward (spread<1) with quick high-frequency ripples — attentive.
  listening: { rotSpeed: 0.11, waveAmp: 0.060, waveFreq: 6.5, waveSpeed: 2.3, turbulence: 0.018, breathAmp: 0.030, breathSpeed: 1.7, spread: 0.91, corePulse: 0.05, coreSpeed: 1.8 },
  // Fast, chaotic boil + rapid spin — visibly "working".
  thinking:  { rotSpeed: 0.55, waveAmp: 0.095, waveFreq: 3.0, waveSpeed: 3.2, turbulence: 0.230, breathAmp: 0.040, breathSpeed: 1.3, spread: 1.02, corePulse: 0.10, coreSpeed: 2.6 },
  // Big, expressive radial waves pulsing outward in rhythm — Pablo emoting.
  speaking:  { rotSpeed: 0.15, waveAmp: 0.210, waveFreq: 2.0, waveSpeed: 2.5, turbulence: 0.030, breathAmp: 0.150, breathSpeed: 2.1, spread: 1.06, corePulse: 0.16, coreSpeed: 2.2 },
};

// ─── WebGL detection + 2D CSS fallback orb ────────────────────────────────────
function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

function NebulaFallback2D({
  status,
  size,
  variant,
  animate = true,
}: {
  status: NebulaStatus;
  size: number;
  variant: NebulaVariant;
  animate?: boolean;
}) {
  const c = variant.fallback[status] ?? variant.fallback.idle;
  const pulseSpeed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  // The bright center is CAPPED in px so a full-bleed orb (size ~1700) doesn't
  // turn into a giant flat white disc — it stays a small soft glow at any size.
  const coreGlow = Math.min(size * 0.18, 96);
  return (
    <div style={{ width: size, height: size, position: "relative", overflow: "hidden" }} aria-label="Pablo nebula (2D fallback)">
      {/* Soft purple body — the nebula glow. */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 20%, ${c.ring} 42%, transparent 68%)`,
        filter: `blur(${Math.max(4, size * 0.01)}px)`,
        opacity: 0.85,
        animation: animate ? `pablo-pulse ${pulseSpeed} ease-in-out infinite` : "none",
      }} />
      {/* Small, capped bright core so the orb reads as a glowing point of light. */}
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: coreGlow, height: coreGlow, borderRadius: "50%",
        background: `radial-gradient(circle, #fff 0%, ${c.core} 42%, transparent 74%)`,
        filter: "blur(3px)", opacity: 0.9, mixBlendMode: "screen",
      }} />
      <style>{`@keyframes pablo-pulse { 0%,100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.04); opacity: 0.95; } }`}</style>
    </div>
  );
}

class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[PabloNebula3D] WebGL failed, using 2D fallback:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ─── Procedural soft circular sprite (no asset needed) ────────────────────────
function makeSpriteTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.12)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Shared, lerped emotion uniforms ─────────────────────────────────────────
type OrbUniforms = {
  uTime: { value: number };
  uWaveAmp: { value: number };
  uWaveFreq: { value: number };
  uWaveSpeed: { value: number };
  uTurb: { value: number };
  uBreathAmp: { value: number };
  uBreathSpeed: { value: number };
  uSpread: { value: number };
  uViewport: { value: number };
  uColorCore: { value: THREE.Color };
  uColorEdge: { value: THREE.Color };
};

function makeOrbUniforms(): OrbUniforms {
  const m = MOTION.idle;
  return {
    uTime: { value: 0 },
    uWaveAmp: { value: m.waveAmp },
    uWaveFreq: { value: m.waveFreq },
    uWaveSpeed: { value: m.waveSpeed },
    uTurb: { value: m.turbulence },
    uBreathAmp: { value: m.breathAmp },
    uBreathSpeed: { value: m.breathSpeed },
    uSpread: { value: m.spread },
    uViewport: { value: 800 },
    uColorCore: { value: new THREE.Color() },
    uColorEdge: { value: new THREE.Color() },
  };
}

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime, uWaveAmp, uWaveFreq, uWaveSpeed, uTurb, uBreathAmp, uBreathSpeed, uSpread, uViewport;
  uniform float uLayerSize;
  varying float vCrest;
  void main() {
    vec3 dir = normalize(position);
    float baseR = length(position);
    float ph = aSeed * 6.2831853;
    // Two crossing travelling waves over the shell = visible "waves of emotion".
    float wave = sin(dir.y * uWaveFreq + uTime * uWaveSpeed + ph);
    wave += 0.5 * sin(dir.x * uWaveFreq * 0.7 - uTime * uWaveSpeed * 0.8 + ph * 1.7);
    // Per-particle chaotic jitter for the "thinking" boil.
    float turb = uTurb * sin(uTime * 3.0 + ph * 12.0) * sin(uTime * 1.7 + ph * 7.0);
    // Global in/out breathing.
    float breath = uBreathAmp * sin(uTime * uBreathSpeed);
    float r = baseR * uSpread + uWaveAmp * wave + turb + breath;
    vec3 p = dir * r;
    vCrest = wave;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uLayerSize * (uViewport / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorCore, uColorEdge;
  uniform float uLayerOpacity;
  varying float vCrest;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // Wave crests glow toward the bright core color; troughs sit at edge color.
    vec3 col = mix(uColorEdge, uColorCore, clamp(vCrest * 0.5 + 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, a * uLayerOpacity);
  }
`;

// ─── A single particle shell (one additive layer of the orb) ─────────────────
function ParticleShell({
  shared,
  count,
  radius,
  thickness,
  flatten,
  waveScale,
  pointSize,
  layerOpacity,
}: {
  shared: OrbUniforms;
  count: number;
  radius: number;
  thickness: number;
  flatten: number;
  waveScale: number;
  pointSize: number;
  layerOpacity: number;
}) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform direction on the sphere.
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      // Shell thickness: bias particles toward the surface for a crisp orb edge.
      const r = radius * (1 + (Math.pow(Math.random(), 1.5) - 0.5) * thickness);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta) * flatten;
      const dz = Math.cos(phi);
      positions[i * 3 + 0] = dx * r;
      positions[i * 3 + 1] = dy * r;
      positions[i * 3 + 2] = dz * r;
      seeds[i] = Math.random();
      // Mostly small motes, a few bright sparks.
      sizes[i] = (Math.random() < 0.05 ? 1.8 + Math.random() * 1.4 : 0.5 + Math.random() * 0.8) * pointSize;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [count, radius, thickness, flatten, pointSize]);

  // Share the lerped emotion uniform objects (by reference) so one driver
  // update animates every layer; add per-layer opacity/size/wave-scale knobs.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...shared,
          uLayerOpacity: { value: layerOpacity },
          uLayerSize: { value: 1 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [shared, layerOpacity],
  );

  // Fold the variant's wave-scale into this layer by scaling its amplitude
  // reference each frame (cheap; keeps a single source of truth in `shared`).
  useFrame(() => {
    material.uniforms.uWaveAmp.value = shared.uWaveAmp.value * waveScale;
  });

  return <points geometry={geometry} material={material} />;
}

// ─── Glowing pulsing core (inner sun + halo sprite) ──────────────────────────
function Core({ shared, status }: { shared: OrbUniforms; status: NebulaStatus }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const innerMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const midMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const sprite = useMemo(makeSpriteTexture, []);

  const haloMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: sprite,
        color: new THREE.Color(1, 1, 1),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.95,
      }),
    [sprite],
  );

  // Track the lerped pulse params toward the active status.
  const pulse = useRef({ amp: MOTION.idle.corePulse, speed: MOTION.idle.coreSpeed });

  useFrame((state, delta) => {
    const target = MOTION[status];
    const k = Math.min(1, delta * 3);
    pulse.current.amp += (target.corePulse - pulse.current.amp) * k;
    pulse.current.speed += (target.coreSpeed - pulse.current.speed) * k;

    const t = state.clock.elapsedTime * pulse.current.speed;
    const p = 1 + Math.sin(t * 2) * pulse.current.amp;
    if (sphereRef.current) sphereRef.current.scale.setScalar(p);
    if (haloRef.current) {
      const h = 1.3 + Math.sin(t * 2.4) * (0.2 + pulse.current.amp * 1.4);
      haloRef.current.scale.set(h, h, 1);
      haloMat.opacity = 0.38 + Math.sin(t * 2.4) * 0.14;
    }
    // Core glow follows the lerped particle color.
    const core = shared.uColorCore.value;
    const edge = shared.uColorEdge.value;
    haloMat.color.copy(edge);
    if (innerMatRef.current) {
      innerMatRef.current.color.copy(core).lerp(new THREE.Color(1, 1, 1), 0.3);
    }
    if (midMatRef.current) midMatRef.current.color.copy(edge);
  });

  return (
    <group>
      {/* Outer halo sprite (always faces camera) */}
      <sprite ref={haloRef} material={haloMat} />
      {/* Inner bright sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshBasicMaterial ref={innerMatRef} />
      </mesh>
      {/* Mid glow shell */}
      <mesh>
        <sphereGeometry args={[0.4, 24, 24]} />
        <meshBasicMaterial
          ref={midMatRef}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── Emotion driver: lerps the shared uniforms toward the active status ──────
function MotionDriver({
  shared,
  groupRef,
  status,
  variant,
}: {
  shared: OrbUniforms;
  groupRef: React.RefObject<THREE.Group | null>;
  status: NebulaStatus;
  variant: NebulaVariant;
}) {
  const { size } = useThree();
  const rot = useRef(MOTION.idle.rotSpeed);

  // Targets recomputed when status/variant change.
  const targetCore = useMemo(() => {
    const t = variant.tint[status];
    return new THREE.Color(t[0], t[1], t[2]).lerp(new THREE.Color(1, 1, 1), 0.6);
  }, [status, variant]);
  const targetEdge = useMemo(() => {
    const t = variant.tint[status];
    return new THREE.Color(t[0], t[1], t[2]);
  }, [status, variant]);

  // Seed colors on first run so the orb doesn't flash black.
  useEffect(() => {
    if (shared.uColorCore.value.r === 0 && shared.uColorCore.value.g === 0 && shared.uColorCore.value.b === 0) {
      shared.uColorCore.value.copy(targetCore);
      shared.uColorEdge.value.copy(targetEdge);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const m = MOTION[status];
    const k = Math.min(1, delta * 3); // ~0.25s ease toward the new mood
    shared.uTime.value = state.clock.elapsedTime;
    shared.uViewport.value = size.height * 0.5;
    shared.uWaveAmp.value += (m.waveAmp - shared.uWaveAmp.value) * k;
    shared.uWaveFreq.value += (m.waveFreq - shared.uWaveFreq.value) * k;
    shared.uWaveSpeed.value += (m.waveSpeed - shared.uWaveSpeed.value) * k;
    shared.uTurb.value += (m.turbulence - shared.uTurb.value) * k;
    shared.uBreathAmp.value += (m.breathAmp - shared.uBreathAmp.value) * k;
    shared.uBreathSpeed.value += (m.breathSpeed - shared.uBreathSpeed.value) * k;
    shared.uSpread.value += (m.spread - shared.uSpread.value) * k;
    shared.uColorCore.value.lerp(targetCore, k);
    shared.uColorEdge.value.lerp(targetEdge, k);

    rot.current += (m.rotSpeed - rot.current) * k;
    if (groupRef.current) {
      groupRef.current.rotation.y += rot.current * delta;
      groupRef.current.rotation.x += rot.current * 0.28 * delta;
      // A little extra wobble while thinking (driven by turbulence).
      groupRef.current.rotation.z += shared.uTurb.value * 0.5 * delta;
    }
  });

  return null;
}

// ─── Real pause-on-hidden ─────────────────────────────────────────────────────
function FramePause() {
  const { set, invalidate } = useThree();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const hidden = document.hidden;
      set({ frameloop: hidden ? "never" : "always" });
      if (!hidden) invalidate();
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      set({ frameloop: "always" });
    };
  }, [set, invalidate]);
  return null;
}

// ─── The orb scene (inside <Canvas>) ─────────────────────────────────────────
function OrbScene({
  status,
  variant,
  lowGfx,
}: {
  status: NebulaStatus;
  variant: NebulaVariant;
  lowGfx: boolean;
}) {
  const shared = useMemo(makeOrbUniforms, []);
  const groupRef = useRef<THREE.Group>(null);
  const shape = variant.shape ?? {};
  const flatten = shape.flatten ?? 1.0;
  const thickness = shape.thickness ?? 0.42;
  const waveScale = shape.waveScale ?? 1.0;

  // Particle budget — leaner on mobile / low-GFX so weak GPUs keep ~60fps.
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const budget = lowGfx ? 0.4 : isMobile ? 0.6 : 1;
  const mainCount = Math.floor(5200 * budget);
  const hazeCount = Math.floor(2200 * budget);

  return (
    <>
      <FramePause />
      <MotionDriver shared={shared} groupRef={groupRef} status={status} variant={variant} />
      <group ref={groupRef}>
        {/* Dense inner shell — the body of the orb. Kept dim per-particle so
            additive overlap renders as rich purple structure instead of
            blowing out to a flat white disc. */}
        <ParticleShell
          shared={shared}
          count={mainCount}
          radius={1.45}
          thickness={thickness}
          flatten={flatten}
          waveScale={waveScale}
          pointSize={0.015}
          layerOpacity={0.55}
        />
        {/* Sparse outer haze — soft glow feathering past the edge. */}
        <ParticleShell
          shared={shared}
          count={hazeCount}
          radius={1.7}
          thickness={thickness * 1.6}
          flatten={flatten}
          waveScale={waveScale * 0.7}
          pointSize={0.032}
          layerOpacity={0.2}
        />
      </group>
      <Core shared={shared} status={status} />
    </>
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
  // Latched once the GPU drops the WebGL context. Without this the canvas
  // stayed black forever and the user lost the entire intro screen ("screen
  // goes black" bug). Now we permanently swap in the 2D fallback.
  const [contextLost, setContextLost] = useState(false);
  // Honour the OS-level "reduce motion" preference: a fullscreen animated 3D
  // scene is a textbook offender. Static 2D orb is the friendlier default.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setHasWebGL(webglAvailable());
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
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

  // Snapshot the DPR range ONCE at mount. Reading window.innerWidth on every
  // render and feeding the dpr prop a different tuple across the 640px
  // breakpoint used to remount the entire <Canvas> on resize/orientation
  // change — recreating the WebGL context. Now the dpr range is stable.
  const dprRange = useMemo<[number, number]>(() => {
    if (typeof window === "undefined") return [1, 1.5];
    return window.innerWidth < 640 ? [1, 1.25] : [1, 1.75];
  }, []);

  if (hasWebGL === false || contextLost || reduceMotion || lowGfx) {
    return <NebulaFallback2D status={status} size={size} variant={variant} animate={!reduceMotion} />;
  }
  if (hasWebGL === null) {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <WebGLErrorBoundary fallback={<NebulaFallback2D status={status} size={size} variant={variant} />}>
      <div style={{ width: size, height: size, position: "relative" }}>
        {/* Paint-safety underlayer. iOS Safari can return a working WebGL
            context from getContext() and then silently fail to draw — no
            error event, no boundary trip, the canvas just stays blank. The 2D
            orb sits below the canvas: when WebGL paints, the canvas covers
            this layer; when WebGL doesn't, the user still sees a glowing orb. */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.32, filter: "blur(6px)" }}>
          <NebulaFallback2D status={status} size={size} variant={variant} />
        </div>
        <Canvas
          dpr={dprRange}
          camera={{ position: [0, 0, 3.7], fov: 45, near: 0.1, far: 100 }}
          // No `powerPreference: "high-performance"` — that flag forces
          // discrete GPUs on hybrid laptops, which causes the OS to swap
          // GPUs when battery saver kicks in and drops the WebGL context.
          gl={{ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            // When the GPU yanks the context (mobile background, low memory,
            // tab switch, HMR thrash), preventDefault keeps the browser from
            // auto-swapping in a corrupted canvas, and we promote the 2D
            // fallback for the rest of the session.
            const onLost = (e: Event) => {
              e.preventDefault();
              console.warn("[PabloNebula3D] WebGL context lost — falling back to 2D nebula");
              setContextLost(true);
            };
            canvas.addEventListener("webglcontextlost", onLost);
          }}
        >
          <Suspense fallback={null}>
            <OrbScene status={status} variant={variant} lowGfx={lowGfx} />
          </Suspense>
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}