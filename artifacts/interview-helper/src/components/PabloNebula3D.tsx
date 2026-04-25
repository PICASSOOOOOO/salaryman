import { useMemo, useRef, Suspense, Component, type ReactNode, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * PabloNebula3D — fullscreen wave-field shader.
 *
 * Replaces the older particle/orb implementation. The "nebula" is now a
 * single fullscreen quad rendered with a fluid-noise GLSL fragment shader,
 * giving the smooth, painterly Akira-vapor look the spec calls for. Color
 * shifts with `status` (which we now treat as the AI's emotional state),
 * and the wave speed/amplitude shift along with it.
 *
 * Resolution: dpr={[1.75, 2.5]} so the shader is sampled at near-4K on
 * retina displays without trashing perf on low-end devices. The shader
 * itself is dpr-agnostic — it's evaluated per-pixel at whatever resolution
 * the renderer hands us.
 *
 * Public API (props) is unchanged from the old component so callers don't
 * need to migrate.
 */

export type NebulaStatus = "idle" | "listening" | "thinking" | "speaking";

// ─── WebGL detection + 2D CSS fallback orb (unchanged) ────────────────────────
function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

const FALLBACK_COLORS: Record<NebulaStatus, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#a78bfa", halo: "#7c3aed", ring: "#4c1d95" },
  listening: { core: "#67e8f9", halo: "#06b6d4", ring: "#155e75" },
  thinking:  { core: "#fbbf24", halo: "#f59e0b", ring: "#78350f" },
  speaking:  { core: "#f0abfc", halo: "#d946ef", ring: "#86198f" },
};

function NebulaFallback2D({ status, size }: { status: NebulaStatus; size: number }) {
  const c = FALLBACK_COLORS[status];
  const pulseSpeed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  return (
    <div style={{ width: size, height: size, position: "relative" }} aria-label="Pablo nebula (2D fallback)">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 28%, ${c.ring} 55%, transparent 78%)`,
        filter: "blur(2px)", animation: `pablo-pulse ${pulseSpeed} ease-in-out infinite`,
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

// ─── Per-emotion palettes (THREE.Vector3 = linear RGB 0..1) ───────────────────
//
// Each emotion contributes a primary + secondary tint that the shader blends
// across the wave field. Idle = Akira violet/cyan, listening = oceanic cyan,
// thinking = warm amber, speaking = magenta neon (Pablo's signature pink).
const STATUS_PALETTE: Record<NebulaStatus, { primary: THREE.Vector3; secondary: THREE.Vector3; accent: THREE.Vector3 }> = {
  idle:      { primary: new THREE.Vector3(0.42, 0.20, 0.95), secondary: new THREE.Vector3(0.20, 0.55, 1.0),  accent: new THREE.Vector3(0.95, 0.50, 1.0) },
  listening: { primary: new THREE.Vector3(0.06, 0.70, 1.00), secondary: new THREE.Vector3(0.10, 0.95, 0.85), accent: new THREE.Vector3(0.40, 1.00, 0.95) },
  thinking:  { primary: new THREE.Vector3(1.00, 0.55, 0.05), secondary: new THREE.Vector3(0.95, 0.20, 0.40), accent: new THREE.Vector3(1.00, 0.85, 0.40) },
  speaking:  { primary: new THREE.Vector3(1.00, 0.18, 0.65), secondary: new THREE.Vector3(0.55, 0.10, 0.95), accent: new THREE.Vector3(1.00, 0.65, 0.90) },
};

// Wave dynamics per emotion: the larger / faster, the more agitated.
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
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 5; i++) {
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

function WaveField({ status }: { status: NebulaStatus }) {
  const { size } = useThree();
  const palette = STATUS_PALETTE[status];
  const dyn = STATUS_DYNAMICS[status];

  // Targets we lerp the uniforms toward so emotion changes glide instead of
  // popping. Refs so we don't re-allocate the vector each frame.
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

  // Push new emotion targets when status changes.
  useEffect(() => {
    targets.current.primary.copy(palette.primary);
    targets.current.secondary.copy(palette.secondary);
    targets.current.accent.copy(palette.accent);
    targets.current.speed = dyn.speed;
    targets.current.amplitude = dyn.amplitude;
    targets.current.complexity = dyn.complexity;
  }, [status, palette, dyn]);

  // Keep resolution uniform in sync with canvas size for crisp rendering.
  useEffect(() => {
    (material.uniforms.uResolution.value as THREE.Vector2).set(size.width, size.height);
  }, [size.width, size.height, material]);

  useFrame((_, delta) => {
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
}: {
  status: NebulaStatus;
  size: number;
}) {
  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);
  // Latched once the GPU drops the WebGL context. Without this we used to
  // just preventDefault() and warn — the canvas stayed black forever and
  // the user lost the entire intro screen ("screen goes black" bug). Now
  // we permanently swap in the 2D fallback so the page is never blank.
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => { setHasWebGL(webglAvailable()); }, []);

  // Cap pixel ratio more aggressively on small/touch devices so we don't shade
  // a multi-thousand-pixel canvas on a phone GPU. Desktop keeps the original
  // 4K-grade clarity range.
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const dprRange: [number, number] = isMobile ? [1, 1.5] : [1.75, 2.5];

  if (hasWebGL === false || contextLost) {
    return <NebulaFallback2D status={status} size={size} />;
  }
  if (hasWebGL === null) {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <WebGLErrorBoundary fallback={<NebulaFallback2D status={status} size={size} />}>
      <div style={{ width: size, height: size, position: "relative" }}>
        <Canvas
          // High DPR for that "4K" sharpness on retina displays — capped on
          // low-end so we don't melt their GPU.
          dpr={dprRange}
          orthographic
          camera={{ position: [0, 0, 1], near: 0, far: 2 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            // When the GPU yanks the context (mobile background, low memory,
            // tab switch, even just HMR thrash in dev), preventDefault stops
            // the browser from auto-swapping in a corrupted canvas, and we
            // promote the 2D fallback for the rest of the session. The
            // restored event would let us reinit, but R3F's mounted scene
            // can't re-bootstrap cleanly mid-render — the fallback is more
            // reliable than a flicker-prone recovery.
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              console.warn("[PabloNebula3D] WebGL context lost — falling back to 2D nebula");
              setContextLost(true);
            });
          }}
        >
          <Suspense fallback={null}>
            <WaveField status={status} />
          </Suspense>
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}
