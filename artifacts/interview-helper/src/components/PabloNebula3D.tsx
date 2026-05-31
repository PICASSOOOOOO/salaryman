import { useMemo, useRef, Suspense, Component, type ReactNode, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLowGfx } from "@/lib/lowGfx";

/**
 * PabloNebula3D — particle "deep space nebula" scene.
 *
 * This is the original painterly nebula art: a rotating starfield, several
 * additively-blended gas clouds built from procedural point sprites, and a
 * glowing pulsing core, framed by a slow camera dolly. Color + motion shift
 * with `status` (treated as the AI's emotional state).
 *
 * The art is the older particle implementation, but it's wrapped in the
 * hardened host added later: WebGL detection with a 2D CSS fallback orb
 * underlayer (iOS Safari can hand back a context that never paints), a
 * latched 2D fallback on context loss (mobile "black screen" bug), OS
 * reduce-motion + low-GFX support, a stable DPR range that doesn't remount
 * the canvas on resize, and a real pause-on-hidden via R3F's frameloop.
 */

export type NebulaStatus = "idle" | "listening" | "thinking" | "speaking";

// ─── WebGL detection + 2D CSS fallback orb ────────────────────────────────────
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

function NebulaFallback2D({ status, size, animate = true }: { status: NebulaStatus; size: number; animate?: boolean }) {
  const c = FALLBACK_COLORS[status];
  const pulseSpeed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  return (
    <div style={{ width: size, height: size, position: "relative" }} aria-label="Pablo nebula (2D fallback)">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 28%, ${c.ring} 55%, transparent 78%)`,
        filter: "blur(2px)",
        animation: animate ? `pablo-pulse ${pulseSpeed} ease-in-out infinite` : "none",
      }} />
      <div style={{
        position: "absolute", inset: "12%", borderRadius: "50%",
        background: `radial-gradient(circle at 45% 45%, #fff 0%, ${c.core} 35%, transparent 70%)`,
        opacity: 0.85, mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", inset: "32%", borderRadius: "50%", background: "#fff",
        boxShadow: `0 0 ${size * 0.15}px ${c.core}`, opacity: 0.9,
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

const STATUS_TINT: Record<NebulaStatus, [number, number, number]> = {
  idle:      [0.66, 0.40, 1.00],
  listening: [0.30, 0.85, 1.00],
  thinking:  [1.00, 0.58, 0.20],
  speaking:  [0.95, 0.40, 0.85],
};

const STATUS_SPEED: Record<NebulaStatus, number> = {
  idle: 0.05, listening: 0.18, thinking: 0.30, speaking: 0.22,
};

const STATUS_PULSE: Record<NebulaStatus, number> = {
  idle: 0.6, listening: 1.6, thinking: 1.0, speaking: 1.3,
};

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

// ─── Deep starfield ───────────────────────────────────────────────────────────
function StarField({ count = 2400, radius = 60 }: { count?: number; radius?: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform sphere distribution
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * (0.6 + Math.random() * 0.4);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      // Star color tint (cool whites + occasional warm)
      const warm = Math.random() < 0.12;
      const t = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 0] = warm ? t : 0.7 * t;
      colors[i * 3 + 1] = warm ? 0.7 * t : 0.85 * t;
      colors[i * 3 + 2] = warm ? 0.5 * t : t;
      sizes[i] = Math.random() < 0.04 ? 2.4 + Math.random() * 1.6 : 0.6 + Math.random() * 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [count, radius]);

  const sprite = useMemo(makeSpriteTexture, []);
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: sprite,
        vertexColors: true,
        size: 0.5,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [sprite],
  );

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.01;
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}

// ─── A single nebula gas cloud (anisotropic blob shaped via 3D noise-ish shells) ──
type CloudProps = {
  count: number;
  radius: number;
  inner: number;
  color: [number, number, number];
  rotation: [number, number, number];
  rotSpeed: number;
  pointSize: number;
  flatten?: number; // squish on Y axis for disc-like cloud
};

function Cloud({ count, radius, inner, color, rotation, rotSpeed, pointSize, flatten = 0.55 }: CloudProps) {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Gaussian-ish distribution between inner and outer radius, with axial flatten
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      // Bias toward middle shell for organic clumping
      const t = Math.pow(Math.random(), 0.6);
      const r = inner + (radius - inner) * t;
      const sx = r * Math.sin(phi) * Math.cos(theta);
      const sy = r * Math.sin(phi) * Math.sin(theta) * flatten;
      const sz = r * Math.cos(phi);
      // Add a turbulence offset for wispy edges
      const jitter = (radius - inner) * 0.25;
      positions[i * 3 + 0] = sx + (Math.random() - 0.5) * jitter;
      positions[i * 3 + 1] = sy + (Math.random() - 0.5) * jitter * 0.7;
      positions[i * 3 + 2] = sz + (Math.random() - 0.5) * jitter;
      // Per-particle color jitter around the cloud's tint
      const k = 0.55 + Math.random() * 0.55;
      colors[i * 3 + 0] = Math.min(1, color[0] * k + (Math.random() - 0.5) * 0.08);
      colors[i * 3 + 1] = Math.min(1, color[1] * k + (Math.random() - 0.5) * 0.08);
      colors[i * 3 + 2] = Math.min(1, color[2] * k + (Math.random() - 0.5) * 0.08);
      seeds[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    return g;
  }, [count, radius, inner, color, flatten]);

  const sprite = useMemo(makeSpriteTexture, []);
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: sprite,
        vertexColors: true,
        size: pointSize,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
      }),
    [sprite, pointSize],
  );

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * rotSpeed * 0.3;
      ref.current.rotation.y += delta * rotSpeed;
      ref.current.rotation.z += delta * rotSpeed * 0.15;
    }
  });

  return (
    <points
      ref={ref}
      geometry={geometry}
      material={material}
      rotation={rotation}
    />
  );
}

// ─── Glowing pulsing core (inner sun + halo sprite) ──────────────────────────
function Core({ color, pulseSpeed }: { color: [number, number, number]; pulseSpeed: number }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const sprite = useMemo(makeSpriteTexture, []);
  const c = useMemo(() => new THREE.Color(color[0], color[1], color[2]), [color]);

  const haloMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: sprite,
        color: c,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.95,
      }),
    [sprite, c],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime * pulseSpeed;
    const pulse = 1 + Math.sin(t * 2) * 0.08;
    if (sphereRef.current) sphereRef.current.scale.setScalar(pulse);
    if (haloRef.current) {
      const h = 6.5 + Math.sin(t * 2.4) * 0.8;
      haloRef.current.scale.set(h, h, 1);
      haloMat.opacity = 0.7 + Math.sin(t * 2.4) * 0.18;
    }
  });

  return (
    <group>
      {/* Outer halo sprite (always faces camera) */}
      <sprite ref={haloRef} material={haloMat} />
      {/* Inner bright sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color={c.clone().lerp(new THREE.Color(1, 1, 1), 0.6)} />
      </mesh>
      {/* Mid glow shell */}
      <mesh>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshBasicMaterial
          color={c}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── Slow camera dolly + parallax ─────────────────────────────────────────────
function CameraOrbit({ speed }: { speed: number }) {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * speed;
    const r = 16;
    camera.position.x = Math.cos(t * 0.3) * r * 0.15;
    camera.position.y = Math.sin(t * 0.22) * r * 0.08;
    camera.position.z = r;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ─── Real pause-on-hidden ─────────────────────────────────────────────────────
// Flip R3F's frameloop between 'always' and 'never' on tab visibility. With the
// default 'always' loop, returning early from useFrame still leaves R3F issuing
// render() every frame; switching to 'never' actually stops the rAF loop and the
// per-frame draw — saving battery and reducing the chance the GPU evicts our
// context while backgrounded. invalidate() once on return so we paint a fresh
// frame immediately instead of holding the last stale image.
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

// ─── Main exported nebula scene ───────────────────────────────────────────────
export function PabloNebula3D({
  status,
  size,
}: {
  status: NebulaStatus;
  size: number;
}) {
  const tint = STATUS_TINT[status];
  const speed = STATUS_SPEED[status];
  const pulse = STATUS_PULSE[status];

  // Two complementary cloud colors built off the status tint
  const cloudA: [number, number, number] = [tint[0], tint[1], tint[2]];
  const cloudB: [number, number, number] = [
    Math.min(1, tint[2] * 0.9 + 0.15),
    Math.min(1, tint[0] * 0.5 + 0.2),
    Math.min(1, tint[1] * 0.95 + 0.05),
  ];
  const cloudC: [number, number, number] = [
    Math.min(1, (tint[0] + 0.4) * 0.7),
    Math.min(1, (tint[1] + 0.2) * 0.8),
    Math.min(1, (tint[2] + 0.5) * 0.7),
  ];

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

  // Snapshot mobile flag ONCE at mount. Reading window.innerWidth on every
  // render and feeding the dpr prop a different tuple across the 640px
  // breakpoint used to remount the entire <Canvas> on resize/orientation
  // change — recreating the WebGL context. Now the dpr range is stable.
  const dprRange = useMemo<[number, number]>(() => {
    if (typeof window === "undefined") return [1, 1.5];
    return window.innerWidth < 640 ? [1, 1.25] : [1, 1.75];
  }, []);

  if (hasWebGL === false || contextLost || reduceMotion || lowGfx) {
    return <NebulaFallback2D status={status} size={size} animate={!reduceMotion} />;
  }
  if (hasWebGL === null) {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <WebGLErrorBoundary fallback={<NebulaFallback2D status={status} size={size} />}>
      <div style={{ width: size, height: size, position: "relative" }}>
        {/* Paint-safety underlayer. iOS Safari can return a working WebGL
            context from getContext() and then silently fail to draw — no
            error event, no boundary trip, the canvas just stays blank. The 2D
            orb sits below the canvas: when WebGL paints, the canvas covers
            this layer; when it doesn't, the user still sees a glowing orb. */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <NebulaFallback2D status={status} size={size} />
        </div>
        <Canvas
          dpr={dprRange}
          camera={{ position: [0, 0, 16], fov: 45, near: 0.1, far: 200 }}
          // No `powerPreference: "high-performance"` — that flag forces
          // discrete GPUs on hybrid laptops, which causes the OS to swap GPUs
          // when battery saver kicks in and drops the WebGL context.
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
            <FramePause />
            <CameraOrbit speed={speed} />

            {/* Far star field — deep space */}
            <StarField count={2400} radius={70} />

            {/* Three layered gas clouds with additive blending */}
            <Cloud
              count={1400}
              radius={5.6}
              inner={1.4}
              color={cloudA}
              rotation={[0.3, 0.0, 0.1]}
              rotSpeed={speed * 0.6}
              pointSize={0.55}
              flatten={0.55}
            />
            <Cloud
              count={1100}
              radius={4.2}
              inner={1.0}
              color={cloudB}
              rotation={[-0.4, 1.1, -0.2]}
              rotSpeed={-speed * 0.9}
              pointSize={0.48}
              flatten={0.7}
            />
            <Cloud
              count={900}
              radius={3.4}
              inner={0.9}
              color={cloudC}
              rotation={[0.9, -0.6, 0.4]}
              rotSpeed={speed * 1.4}
              pointSize={0.42}
              flatten={0.85}
            />

            {/* Dust shell — many tiny dim points filling the outer void */}
            <Cloud
              count={2200}
              radius={9.0}
              inner={4.5}
              color={[tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.55]}
              rotation={[0.0, 0.0, 0.0]}
              rotSpeed={speed * 0.2}
              pointSize={0.18}
              flatten={0.95}
            />

            {/* Glowing pulsing core */}
            <Core color={tint} pulseSpeed={pulse} />
          </Suspense>
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}
